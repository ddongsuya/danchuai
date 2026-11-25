// 단추 계정으로 로그인 (연동 2단계). 앱은 단추 Supabase로 로그인하고, 서버는 그 토큰으로 단추 /api/agent/me를 불러
// 사용자·역할·기관을 정한다. 에이전트 DB에는 단추 신원 열쇠(cro:<기관>, user:<계정>)로 작업 공간 한 줄만 둔다.
// 대화·초안·승인 기록은 이 작업 공간에 묶는다. 요청 본문이나 헤더의 조직 값은 쓰지 않는다.
import type { AuthResolver, Session } from "./auth";
import type { DanchuApi, DanchuError, DanchuMe } from "./danchu";
import { sha256 } from "./hash";
import type { Pool } from "./db/pool";
import type { AgentCharacterId } from "@danchuai/core";

/** 국외 이전·AI 처리 동의 판. 문구가 바뀌면 올리고, 다시 동의받는다. */
export const CONSENT_VERSION = "2026-11-17";

export interface WorkspaceRepo {
  /** 단추 신원 열쇠의 작업 공간 id. 없으면 만든다. */
  ensure(key: string, kind: "requester" | "cro", name: string): Promise<string>;
  consent(userId: string): Promise<{ version: string; agreedAt: string } | null>;
  agree(userId: string, version: string): Promise<void>;
  /** 이 계정의 동의를 철회로 표시한다(기록은 남긴다) */
  revoke(userId: string): Promise<void>;
  /** 고른 비서 캐릭터(없으면 null, 앱이 기본 "단추"를 쓴다) */
  character(userId: string): Promise<string | null>;
  setCharacter(userId: string, id: AgentCharacterId): Promise<void>;
}

export interface DanchuIdentity {
  session: Session;
  me: DanchuMe;
}

export const BEARER = /^Bearer ([A-Za-z0-9._-]{20,4096})$/;

export const workspaceKey = (me: DanchuMe): string | null =>
  me.role === "cro" ? (me.org ? `cro:${me.org.id}` : null) : `user:${me.id}`;

/** 토큰 → 단추 신원. 같은 토큰은 잠깐(기본 60초) 기억해 단추를 매번 부르지 않는다. */
export function danchuIdentity(api: DanchuApi, workspaces: WorkspaceRepo, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  const cache = new Map<string, { until: number; value: DanchuIdentity }>();

  async function lookup(authorization: string | undefined): Promise<DanchuIdentity | DanchuError> {
    const m = BEARER.exec(authorization ?? "");
    if (!m) return "unauthorized";
    const key = sha256(m[1]!);
    const t = now();
    const hit = cache.get(key);
    if (hit && hit.until > t) return hit.value;
    const r = await api.me(m[1]!);
    if (!r.ok) return r.error;
    const me = r.data;
    const wk = workspaceKey(me);
    if (!wk) return "org_not_ready";
    const orgId = await workspaces.ensure(wk, me.role, me.role === "cro" ? me.org!.name : me.name ?? me.email);
    const value: DanchuIdentity = { me, session: { userId: me.id, orgId, role: me.role } };
    if (cache.size > 1000) for (const [k, v] of cache) if (v.until <= t) cache.delete(k);
    cache.set(key, { until: t + ttl, value });
    return value;
  }

  const resolver: AuthResolver = {
    async resolve(authorization) {
      const r = await lookup(authorization);
      return typeof r === "string" ? null : r.session;
    },
  };
  return { lookup, resolver };
}

export class PgWorkspaceRepo implements WorkspaceRepo {
  constructor(private readonly pool: Pool) {}
  async ensure(key: string, kind: "requester" | "cro", name: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into orgs (kind, name, danchu_key) values ($1, $2, $3)
       on conflict (danchu_key) do update set name = excluded.name
       returning id`,
      [kind, name.slice(0, 60), key],
    );
    return rows[0]!.id;
  }
  async consent(userId: string) {
    const { rows } = await this.pool.query<{ version: string; agreed_at: Date }>(
      `select version, agreed_at from agent_consents where danchu_user_id = $1 and version = $2 and revoked_at is null`,
      [userId, CONSENT_VERSION],
    );
    return rows[0] ? { version: rows[0].version, agreedAt: rows[0].agreed_at.toISOString() } : null;
  }
  async agree(userId: string, version: string) {
    await this.pool.query(
      `insert into agent_consents (danchu_user_id, version) values ($1, $2) on conflict (danchu_user_id, version) do update set revoked_at = null, agreed_at = now()`,
      [userId, version],
    );
  }
  async revoke(userId: string) {
    await this.pool.query(`update agent_consents set revoked_at = now() where danchu_user_id = $1 and revoked_at is null`, [userId]);
  }
  async character(userId: string) {
    try {
      const { rows } = await this.pool.query<{ character: string }>(`select character from agent_prefs where danchu_user_id = $1`, [userId]);
      return rows[0]?.character ?? null;
    } catch {
      // 표가 아직 없거나(0013 적용 전) 읽지 못해도 내 정보는 열린다. 앱은 기본 캐릭터를 쓴다
      return null;
    }
  }
  async setCharacter(userId: string, id: AgentCharacterId) {
    await this.pool.query(
      `insert into agent_prefs (danchu_user_id, character) values ($1, $2) on conflict (danchu_user_id) do update set character = excluded.character, updated_at = now()`,
      [userId, id],
    );
  }
}

export class MemoryWorkspaceRepo implements WorkspaceRepo {
  private ids = new Map<string, string>();
  private consents = new Map<string, string>();
  async ensure(key: string) {
    let id = this.ids.get(key);
    if (!id) {
      id = crypto.randomUUID();
      this.ids.set(key, id);
    }
    return id;
  }
  async consent(userId: string) {
    const at = this.consents.get(`${userId}:${CONSENT_VERSION}`);
    return at ? { version: CONSENT_VERSION, agreedAt: at } : null;
  }
  async agree(userId: string, version: string) {
    this.consents.set(`${userId}:${version}`, new Date().toISOString());
  }
  async revoke(userId: string) {
    for (const k of [...this.consents.keys()]) if (k.startsWith(`${userId}:`)) this.consents.delete(k);
  }
  private characters = new Map<string, string>();
  async character(userId: string) {
    return this.characters.get(userId) ?? null;
  }
  async setCharacter(userId: string, id: AgentCharacterId) {
    this.characters.set(userId, id);
  }
}
