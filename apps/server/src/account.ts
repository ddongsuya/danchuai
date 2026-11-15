import { randomInt } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { sha256 } from "./hash";
import type { Identity, IdentityResolver } from "./supabaseAuth";

// 로그인 직후 단계: 내 조직 확인, 조직 만들기, 초대 코드 만들기·수락.
// 조직은 토큰이나 본문이 아니라 members 표에서만 찾는다. 초대 코드는 원문을 저장하지 않는다(sha256).

export interface AccountOrg {
  orgId: string;
  kind: "requester" | "cro";
  name: string;
  memberRole: "owner" | "member";
  displayName: string | null;
}

export type JoinFailure = "already_member" | "not_found" | "expired" | "used";

export interface AccountRepo {
  /** 소속 조직. 없으면 null, 둘 이상이면 "multiple". */
  me(userId: string): Promise<AccountOrg | null | "multiple">;
  createOrg(userId: string, input: { kind: "requester" | "cro"; name: string; displayName: string }): Promise<AccountOrg | "already_member">;
  /** 조직 소유자만 만든다. 아니면 false. */
  createInvite(userId: string, codeHash: string, expiresAt: Date): Promise<boolean>;
  acceptInvite(userId: string, codeHash: string, displayName: string): Promise<AccountOrg | JoinFailure>;
  /** 내 조직 구성원(이름·역할). 소속이 정확히 하나일 때만, 아니면 null. */
  members(userId: string): Promise<AccountMember[] | null>;
  /** 내 이름 바꾸기. 소속이 정확히 하나일 때만. */
  rename(userId: string, displayName: string): Promise<boolean>;
}

export interface AccountMember {
  name: string | null;
  role: "owner" | "member";
  me: boolean;
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 헷갈리는 0 O 1 I L 제외

export function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** 입력한 코드를 저장 형식으로. 공백·하이픈·소문자를 받아 준다. 형식이 아니면 null. */
export function normalizeInviteCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== 8 || [...s].some((ch) => !ALPHABET.includes(ch))) return null;
  return s;
}

export const inviteHash = (normalized: string) => sha256(`invite:${normalized}`);

const Name = z.string().trim().min(1).max(40);
const CreateOrgBody = z.object({ kind: z.enum(["requester", "cro"]), name: z.string().trim().min(1).max(60), displayName: Name }).strict();
const JoinBody = z.object({ code: z.string().max(32), displayName: Name }).strict();
const RenameBody = z.object({ displayName: Name }).strict();

/** 초대 코드 맞히기 막기: 사용자당 10분에 10번. 서버가 여러 대면 DB나 공용 저장소로 옮긴다. */
export class AttemptLimiter {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(private readonly max = 10, private readonly windowMs = 10 * 60 * 1000, private readonly now = () => Date.now()) {}
  take(key: string): boolean {
    const t = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= t) this.hits.delete(k); // 오래된 기록 정리
    const h = this.hits.get(key);
    if (!h || h.until <= t) {
      this.hits.set(key, { n: 1, until: t + this.windowMs });
      return true;
    }
    h.n += 1;
    return h.n <= this.max;
  }
}

type Env = { Variables: { who: Identity } };

export function accountRoutes(deps: { identity: IdentityResolver; repo: AccountRepo; limiter?: AttemptLimiter; now?: () => Date }) {
  const app = new Hono<Env>();
  const limiter = deps.limiter ?? new AttemptLimiter();
  const now = deps.now ?? (() => new Date());

  app.use("*", async (c, next) => {
    const who = await deps.identity.verify(c.req.header("authorization"));
    if (!who) return c.json({ error: "unauthorized" }, 401);
    c.set("who", who);
    await next();
  });

  app.get("/me", async (c) => {
    const who = c.get("who");
    const org = await deps.repo.me(who.userId);
    if (org === "multiple") return c.json({ error: "multiple_orgs" }, 409);
    return c.json({ userId: who.userId, email: who.email, org });
  });

  app.post("/me", async (c) => {
    const parsed = RenameBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    if (!(await deps.repo.rename(c.get("who").userId, parsed.data.displayName))) return c.json({ error: "not_found" }, 404);
    return c.json({ displayName: parsed.data.displayName });
  });

  app.get("/members", async (c) => {
    const list = await deps.repo.members(c.get("who").userId);
    if (!list) return c.json({ error: "not_found" }, 404);
    return c.json({ members: list });
  });

  app.post("/org", async (c) => {
    const parsed = CreateOrgBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const r = await deps.repo.createOrg(c.get("who").userId, parsed.data);
    if (r === "already_member") return c.json({ error: r }, 409);
    return c.json({ org: r }, 201);
  });

  app.post("/invites", async (c) => {
    const code = newInviteCode();
    const expiresAt = new Date(now().getTime() + INVITE_TTL_MS);
    const ok = await deps.repo.createInvite(c.get("who").userId, inviteHash(normalizeInviteCode(code)!), expiresAt);
    if (!ok) return c.json({ error: "forbidden" }, 403);
    return c.json({ code, expiresAt: expiresAt.toISOString() }, 201);
  });

  app.post("/join", async (c) => {
    const who = c.get("who");
    if (!limiter.take(who.userId)) return c.json({ error: "too_many_attempts" }, 429);
    const parsed = JoinBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const code = normalizeInviteCode(parsed.data.code);
    if (!code) return c.json({ error: "not_found" }, 404);
    const r = await deps.repo.acceptInvite(who.userId, inviteHash(code), parsed.data.displayName);
    if (typeof r === "string") return c.json({ error: r }, r === "not_found" ? 404 : r === "already_member" ? 409 : 410);
    return c.json({ org: r });
  });

  return app;
}

/** 메모리 구현(테스트·로컬). */
export class MemoryAccountRepo implements AccountRepo {
  orgs = new Map<string, { kind: "requester" | "cro"; name: string }>();
  rows: Array<{ userId: string; orgId: string; role: "owner" | "member"; displayName: string | null }> = [];
  invites = new Map<string, { orgId: string; expiresAt: Date; usedBy: string | null }>();
  constructor(private readonly now = () => new Date()) {}

  private view(userId: string): AccountOrg[] {
    return this.rows
      .filter((m) => m.userId === userId)
      .map((m) => ({ orgId: m.orgId, ...this.orgs.get(m.orgId)!, memberRole: m.role, displayName: m.displayName }));
  }
  async me(userId: string) {
    const v = this.view(userId);
    return v.length > 1 ? ("multiple" as const) : (v[0] ?? null);
  }
  async createOrg(userId: string, input: { kind: "requester" | "cro"; name: string; displayName: string }) {
    if (this.view(userId).length) return "already_member" as const;
    const orgId = crypto.randomUUID();
    this.orgs.set(orgId, { kind: input.kind, name: input.name });
    this.rows.push({ userId, orgId, role: "owner", displayName: input.displayName });
    return this.view(userId)[0]!;
  }
  async createInvite(userId: string, codeHash: string, expiresAt: Date) {
    const own = this.rows.find((m) => m.userId === userId && m.role === "owner");
    if (!own || this.view(userId).length !== 1) return false;
    this.invites.set(codeHash, { orgId: own.orgId, expiresAt, usedBy: null });
    return true;
  }
  async acceptInvite(userId: string, codeHash: string, displayName: string) {
    if (this.view(userId).length) return "already_member" as const;
    const inv = this.invites.get(codeHash);
    if (!inv) return "not_found" as const;
    if (inv.usedBy) return "used" as const;
    if (inv.expiresAt <= this.now()) return "expired" as const;
    inv.usedBy = userId;
    this.rows.push({ userId, orgId: inv.orgId, role: "member", displayName });
    return this.view(userId)[0]!;
  }
  async members(userId: string) {
    const v = this.view(userId);
    if (v.length !== 1) return null;
    return this.rows
      .filter((m) => m.orgId === v[0]!.orgId)
      .map((m) => ({ name: m.displayName, role: m.role, me: m.userId === userId }));
  }
  async rename(userId: string, displayName: string) {
    const mine = this.rows.filter((m) => m.userId === userId);
    if (mine.length !== 1) return false;
    mine[0]!.displayName = displayName;
    return true;
  }
}
