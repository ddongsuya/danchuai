import { describe, expect, it } from "vitest";
import { accountRoutes, AttemptLimiter, inviteHash, MemoryAccountRepo, newInviteCode, normalizeInviteCode } from "../src/account";
import type { IdentityResolver } from "../src/supabaseAuth";

// 토큰 "Bearer u:<id>"를 그 사용자로 보는 가짜 확인기
const identity: IdentityResolver = {
  verify: async (h) => (h?.startsWith("Bearer u:") ? { userId: h.slice(9), email: null } : null),
};

function setup(now = () => new Date("2026-11-15T00:00:00Z")) {
  const repo = new MemoryAccountRepo(now);
  const app = accountRoutes({ identity, repo, now, limiter: new AttemptLimiter(3, 60_000) });
  const call = (method: string, path: string, user: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer u:${user}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { repo, call };
}

describe("초대 코드 형식", () => {
  it("8자, 헷갈리는 글자 없음, 입력은 소문자·공백·하이픈을 받아 준다", () => {
    for (let i = 0; i < 200; i++) expect(newInviteCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeInviteCode(" k7q2 m9xd ")).toBe("K7Q2M9XD");
    expect(normalizeInviteCode("K7Q2-M9X0")).toBeNull(); // 0은 없는 글자
    expect(normalizeInviteCode("K7Q2")).toBeNull();
  });
});

describe("가입·초대", () => {
  it("로그인 없으면 401, 조직 없으면 org null", async () => {
    const { call } = setup();
    expect((await call("GET", "/me", null)).status).toBe(401);
    expect(await (await call("GET", "/me", "a")).json()).toMatchObject({ userId: "a", org: null });
  });

  it("조직을 만들면 소유자가 되고, 두 번째는 409", async () => {
    const { call } = setup();
    const r = await call("POST", "/org", "a", { kind: "cro", name: " 가 기관 ", displayName: "가" });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { org: unknown }).org).toMatchObject({ kind: "cro", name: "가 기관", memberRole: "owner" });
    expect((await call("POST", "/org", "a", { kind: "cro", name: "또", displayName: "가" })).status).toBe(409);
  });

  it("본문 형식이 다르거나 조직 값을 실으면 400", async () => {
    const { call } = setup();
    expect((await call("POST", "/org", "a", { kind: "admin", name: "x", displayName: "x" })).status).toBe(400);
    expect((await call("POST", "/org", "a", { kind: "cro", name: "", displayName: "x" })).status).toBe(400);
    expect((await call("POST", "/org", "a", { kind: "cro", name: "x", displayName: "x", orgId: "o" })).status).toBe(400);
  });

  it("소유자만 초대 코드를 만들고, 코드는 한 번만 쓴다", async () => {
    const { call } = setup();
    await call("POST", "/org", "owner", { kind: "requester", name: "의뢰", displayName: "주" });
    expect((await call("POST", "/invites", "nobody")).status).toBe(403);
    const inv = (await (await call("POST", "/invites", "owner")).json()) as { code: string; expiresAt: string };
    expect(inv.expiresAt).toBe("2026-11-22T00:00:00.000Z");
    const j = await call("POST", "/join", "b", { code: inv.code.toLowerCase(), displayName: "비" });
    expect(j.status).toBe(200);
    expect(((await j.json()) as { org: unknown }).org).toMatchObject({ name: "의뢰", memberRole: "member" });
    expect((await call("POST", "/invites", "b")).status).toBe(403); // 구성원은 초대 못 함
    expect(await (await call("POST", "/join", "c", { code: inv.code, displayName: "씨" })).json()).toEqual({ error: "used" });
    expect((await call("POST", "/join", "b", { code: inv.code, displayName: "비" })).status).toBe(409);
  });

  it("만료·없는 코드, 시도 횟수 제한", async () => {
    let t = new Date("2026-11-15T00:00:00Z");
    const { call, repo } = setup(() => t);
    await call("POST", "/org", "owner", { kind: "cro", name: "기관", displayName: "주" });
    const inv = (await (await call("POST", "/invites", "owner")).json()) as { code: string };
    t = new Date("2026-11-23T00:00:00Z");
    expect((await call("POST", "/join", "x", { code: inv.code, displayName: "엑" })).status).toBe(410);
    expect((await call("POST", "/join", "x", { code: "ZZZZ-ZZZZ", displayName: "엑" })).status).toBe(404);
    expect((await call("POST", "/join", "x", { code: "ZZZZ-ZZZZ", displayName: "엑" })).status).toBe(404);
    expect((await call("POST", "/join", "x", { code: "ZZZZ-ZZZZ", displayName: "엑" })).status).toBe(429);
    expect(repo.invites.has(inviteHash(normalizeInviteCode(inv.code)!))).toBe(true); // 원문이 아니라 해시로 저장
  });
});
