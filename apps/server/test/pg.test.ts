// Postgres(Supabase 스키마) 저장소·로그인 테스트. TEST_DATABASE_URL이 있으면 새 DB를 만들어 마이그레이션을 적용하고 돈다.
// CI는 REQUIRE_DB_TESTS=1 이라 DB가 없으면 실패한다(조용히 건너뛰지 않는다).
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_SHEET, type CompletionResult, type LlmProvider } from "@danchuai/core";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { PgConversationRepo, PgRequestDirectory } from "../src/db/conversations";
import { PgOutboundRepo } from "../src/db/outbound";
import { supabaseAuth, pgMemberships } from "../src/supabaseAuth";

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE && process.env.REQUIRE_DB_TESTS === "1") throw new Error("TEST_DATABASE_URL이 없어요");
const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS = join(here, "../../../supabase/migrations");
const ISSUER = "https://test.supabase.co/auth/v1";

const ids = {
  reqOrg: randomUUID(),
  croA: randomUUID(),
  croB: randomUUID(),
  reqUser: randomUUID(),
  croUser: randomUUID(),
  croBUser: randomUUID(),
  twoOrgUser: randomUUID(),
  request: randomUUID(),
};

class Fake implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model = "fake";
  next: Partial<CompletionResult> = {};
  async complete(): Promise<CompletionResult> {
    const r = this.next;
    return { text: r.text ?? "네.", toolCalls: r.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 8, cacheWriteTokens: 0 }, stop: "done", provider: "anthropic", model: "fake" };
  }
}

describe.skipIf(!BASE)("Postgres 저장소와 Supabase 로그인", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let dbName = "";
  let sign: (sub: string, over?: Record<string, unknown>) => Promise<string>;
  let otherKeySign: (sub: string) => Promise<string>;
  const fake = new Fake();
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dbName = `danchuai_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const url = new URL(BASE!);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
    const setup = await pool.connect();
    await setup.query(readFileSync(join(here, "sql/supabase-stub.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      await setup.query(readFileSync(join(MIGRATIONS, f), "utf8"));
    }
    await setup.query(`insert into auth.users (id) values ($1),($2),($3),($4)`, [ids.reqUser, ids.croUser, ids.croBUser, ids.twoOrgUser]);
    await setup.query(`insert into orgs (id, kind, name) values ($1,'requester','의뢰 조직'),($2,'cro','가 기관'),($3,'cro','나 기관')`, [ids.reqOrg, ids.croA, ids.croB]);
    await setup.query(
      `insert into members (user_id, org_id) values ($1,$2),($3,$4),($5,$6),($7,$2),($7,$4)`,
      [ids.reqUser, ids.reqOrg, ids.croUser, ids.croA, ids.croBUser, ids.croB, ids.twoOrgUser],
    );
    await setup.query(`insert into requests (id, org_id, code, status, sheet) values ($1,$2,'R-1','sent',$3)`, [
      ids.request,
      ids.reqOrg,
      JSON.stringify({ testType: "독성", species: "랫드", route: "경구", duration: "4주", glp: "GLP", dueDate: "11월 29일", substance: "저분자" }),
    ]);
    await setup.query(`insert into request_recipients (request_id, cro_org_id) values ($1,$2)`, [ids.request, ids.croA]);
    setup.release();

    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" }] });
    sign = (sub, over = {}) =>
      new SignJWT({ role: "authenticated", ...over })
        .setProtectedHeader({ alg: "ES256", kid: "k1" })
        .setSubject(sub)
        .setIssuer((over.iss as string) ?? ISSUER)
        .setAudience((over.aud as string) ?? "authenticated")
        .setIssuedAt()
        .setExpirationTime((over.exp as number) ?? "10m")
        .sign(privateKey);
    const other = await generateKeyPair("ES256");
    otherKeySign = (sub) =>
      new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid: "k1" }).setSubject(sub).setIssuer(ISSUER).setAudience("authenticated").setExpirationTime("10m").sign(other.privateKey);

    app = createApp({
      auth: supabaseAuth({ key: jwks, issuer: ISSUER, memberships: pgMemberships(pool) }),
      outbound: new PgOutboundRepo(pool),
      transport: { deliver: async () => "sent" },
      provider: fake,
      conversations: new PgConversationRepo(pool),
      requests: new PgRequestDirectory(pool),
    });
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  const call = async (method: string, path: string, token: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const nulls = Object.fromEntries(Object.keys(EMPTY_SHEET).map((k) => [k, null]));

  it("의뢰자 흐름: 대화 → 초안 → 보내기 초안 → 승인 → 발송이 DB에 남는다", async () => {
    const t = await sign(ids.reqUser);
    const created = await call("POST", "/v1/agent/conversations", t, {});
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    fake.next = {
      text: "정리했어요.",
      toolCalls: [
        { id: "u", name: "update_sheet", input: { ...nulls, testType: "독성", substance: "저분자", species: "랫드", route: "경구", duration: "4주", glp: "GLP", dueDate: "11월 29일" } },
        { id: "d", name: "draft_body", input: { body: "랫드 4주 경구 독성시험 견적을 요청드려요." } },
      ],
    };
    const turn = await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "랫드 4주 견적, 연락은 kim@abc.co.kr" });
    expect(await turn.text()).toContain("event: draft");

    // 새 저장소 인스턴스로 다시 읽어도 그대로(서버 재시작과 같다)
    const again = await new PgConversationRepo(pool).get(id);
    expect(again!.sheet.species).toBe("랫드");
    expect(again!.turns).toBe(1);
    expect(again!.usage.cacheReadTokens).toBe(8);
    expect(again!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(again!.messages[0]!.content).not.toContain("kim@");
    expect(again!.draft!.version).toBe(1);

    const out = await call("POST", `/v1/agent/conversations/${id}/outbound`, t, { version: 1, recipientOrgIds: [ids.croA, ids.croB] });
    expect(out.status).toBe(201);
    const { outbound } = (await out.json()) as { outbound: Array<{ id: string; epoch: number; textHash: string }> };
    const d = outbound[0]!;
    expect((await call("POST", `/v1/outbound/${d.id}/decision`, t, { decision: "approve", epoch: d.epoch, textHash: d.textHash })).status).toBe(200);
    expect(await (await call("POST", `/v1/outbound/${d.id}/dispatch`, t)).json()).toEqual({ status: "sent" });
    // 두 번째 발송은 막힌다
    expect((await call("POST", `/v1/outbound/${d.id}/dispatch`, t)).status).toBe(409);
    const { rows } = await pool.query(`select decided_by, status from approvals a join outbound_drafts o on o.id = a.draft_id where o.id = $1`, [d.id]);
    expect(rows).toEqual([{ decided_by: ids.reqUser, status: "sent" }]);
  });

  it("같은 판의 보내기 초안을 동시에 두 번 만들면 하나만 된다", async () => {
    const t = await sign(ids.reqUser);
    const { id } = (await (await call("POST", "/v1/agent/conversations", t, {})).json()) as { id: string };
    fake.next = {
      toolCalls: [
        { id: "u", name: "update_sheet", input: { ...nulls, testType: "독성", substance: "저분자", species: "랫드", route: "경구", duration: "4주", glp: "GLP", dueDate: "11월 29일" } },
        { id: "d", name: "draft_body", input: { body: "견적을 요청드려요." } },
      ],
    };
    await (await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "본문" })).text();
    const body = { version: 1, recipientOrgIds: [ids.croA] };
    const [a, b] = await Promise.all([
      call("POST", `/v1/agent/conversations/${id}/outbound`, t, body),
      call("POST", `/v1/agent/conversations/${id}/outbound`, t, body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const { rows } = await pool.query(`select count(*)::int as n from outbound_drafts where conversation_id = $1`, [id]);
    expect(rows[0].n).toBe(1);
  });

  it("한 대화에 한 턴만 잠그고, 오래된 잠금은 넘겨받는다", async () => {
    const repo = new PgConversationRepo(pool);
    const t = await sign(ids.reqUser);
    const { id } = (await (await call("POST", "/v1/agent/conversations", t, {})).json()) as { id: string };
    expect(await repo.lockTurn(id, ids.reqOrg)).toBe(true);
    expect(await repo.lockTurn(id, ids.reqOrg)).toBe(false);
    expect((await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "하나" })).status).toBe(409);
    expect(await repo.lockTurn(id, ids.croA)).toBe(false); // 다른 조직
    await pool.query(`update conversations set turn_started_at = now() - interval '3 minutes' where id = $1`, [id]);
    expect(await repo.lockTurn(id, ids.reqOrg)).toBe(true);
    await repo.unlockTurn(id);
    expect(await repo.lockTurn(id, ids.reqOrg)).toBe(true);
    await repo.unlockTurn(id);
  });

  it("기관은 받은 요청만 열고, 회신은 의뢰 조직으로만 간다", async () => {
    const tb = await sign(ids.croBUser);
    expect((await call("POST", "/v1/agent/conversations", tb, { requestId: ids.request })).status).toBe(404);
    const ta = await sign(ids.croUser);
    const res = await call("POST", "/v1/agent/conversations", ta, { requestId: ids.request });
    expect(res.status).toBe(201);
    const conv = (await res.json()) as { id: string; sheet: { species: string } };
    expect(conv.sheet.species).toBe("랫드");
    fake.next = { toolCalls: [{ id: "d", name: "draft_body", input: { body: "진행 가능해요." } }] };
    await (await call("POST", `/v1/agent/conversations/${conv.id}/turn`, ta, { text: "회신" })).text();
    const out = await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, ta, { version: 1, quoteLines: [{ label: "반복투여", amountWon: 10_000_000 }] });
    const { outbound } = (await out.json()) as { outbound: Array<{ counterpartyOrgId: string; text: string }> };
    expect(outbound[0]!.counterpartyOrgId).toBe(ids.reqOrg);
    expect(outbound[0]!.text).toContain("견적 총액(부가세 포함) 1,100만원");
  });

  it("다른 조직의 대화는 404, 본문의 조직 값은 받지 않는다", async () => {
    const t = await sign(ids.reqUser);
    const { id } = (await (await call("POST", "/v1/agent/conversations", t, {})).json()) as { id: string };
    expect((await call("GET", `/v1/agent/conversations/${id}`, await sign(ids.croUser))).status).toBe(404);
    expect((await call("POST", "/v1/agent/conversations", t, { orgId: ids.croA })).status).toBe(400);
    expect((await call("GET", `/v1/agent/conversations/not-a-uuid`, t)).status).toBe(404);
  });

  it("로그인 토큰: 다른 키·만료·다른 발급자·다른 대상·익명·여러 조직 소속은 401", async () => {
    const path = "/v1/agent/conversations";
    expect((await call("POST", path, await otherKeySign(ids.reqUser), {})).status).toBe(401);
    expect((await call("POST", path, await sign(ids.reqUser, { exp: Math.floor(Date.now() / 1000) - 60 }), {})).status).toBe(401);
    expect((await call("POST", path, await sign(ids.reqUser, { iss: "https://evil.supabase.co/auth/v1" }), {})).status).toBe(401);
    expect((await call("POST", path, await sign(ids.reqUser, { aud: "other" }), {})).status).toBe(401);
    expect((await call("POST", path, await sign(ids.reqUser, { role: "anon" }), {})).status).toBe(401);
    expect((await call("POST", path, await sign(ids.twoOrgUser), {})).status).toBe(401);
    expect((await call("POST", path, await sign(randomUUID()), {})).status).toBe(401); // 조직 없음
    expect((await call("POST", path, "not.a.jwt", {})).status).toBe(401);
  });

  it("RLS: 앱 사용자는 자기 조직 행만 읽고, 쓰지 못한다", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids.croUser]);
      const own = await c.query(`select distinct org_id from conversations`);
      expect(own.rows.map((r) => r.org_id)).toEqual([ids.croA]);
      const drafts = await c.query(`select distinct org_id from outbound_drafts`);
      expect(drafts.rows.every((r) => r.org_id === ids.croA)).toBe(true);
      const orgs = await c.query(`select id from orgs`);
      expect(orgs.rows.map((r) => r.id)).toEqual([ids.croA]); // 의뢰 조직 이름은 보이지 않는다
      await expect(c.query(`insert into conversations (org_id, created_by) values ($1, $2)`, [ids.croA, ids.croUser])).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback");
      c.release();
    }
    const anon = await pool.connect();
    try {
      await anon.query("begin");
      await anon.query("set local role anon");
      await expect(anon.query(`select id from conversations`)).rejects.toThrow(/permission denied/);
    } finally {
      await anon.query("rollback");
      anon.release();
    }
  });
});
