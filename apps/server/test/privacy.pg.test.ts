// 탈퇴·철회 지우기와 AI 이용량(0011)을 실제 Postgres 스키마로 확인한다. TEST_DATABASE_URL 이 있으면 새 DB를 만들어 돈다.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgPurgeRepo } from "../src/purge";
import { PgUsageRepo, usageMeter } from "../src/usage";
import { CONSENT_VERSION, PgWorkspaceRepo } from "../src/danchuAuth";

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE && process.env.REQUIRE_DB_TESTS === "1") throw new Error("TEST_DATABASE_URL이 없어요");
const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS = join(here, "../../../supabase/migrations");

describe.skipIf(!BASE)("탈퇴·철회 지우기와 이용량 (Postgres)", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let dbName = "";
  const reqUser = randomUUID();
  const croUser = randomUUID();
  const croColleague = randomUUID();
  const croOrgDanchu = randomUUID();
  let reqWs = "";
  let croWs = "";

  beforeAll(async () => {
    dbName = `danchuai_privacy_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const url = new URL(BASE!);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
    const c = await pool.connect();
    await c.query(readFileSync(join(here, "sql/supabase-stub.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await c.query(readFileSync(join(MIGRATIONS, f), "utf8"));
    c.release();
    const ws = new PgWorkspaceRepo(pool);
    reqWs = await ws.ensure(`user:${reqUser}`, "requester", "홍길동");
    croWs = await ws.ensure(`cro:${croOrgDanchu}`, "cro", "가 기관");
    for (const u of [reqUser, croUser, croColleague]) await ws.agree(u, CONSENT_VERSION);
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  async function conv(org: string, by: string, role: "requester" | "cro") {
    const { rows } = await pool.query<{ id: string }>(
      `insert into conversations (org_id, created_by, role, mode) values ($1, $2, $3, 'ask') returning id`,
      [org, by, role],
    );
    await pool.query(`insert into messages (conversation_id, org_id, role, body) values ($1, $2, 'user', '질문')`, [rows[0]!.id, org]);
    return rows[0]!.id;
  }
  async function draft(org: string, conversationId: string | null, approvedBy: string | null) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_drafts (org_id, counterparty_org_id, kind, body, body_sha256, status, conversation_id)
       values ($1, $1, 'danchu', '본문', repeat('a', 64), $2, $3) returning id`,
      [org, approvedBy ? "approved" : "drafted", conversationId],
    );
    if (approvedBy) {
      await pool.query(`insert into approvals (draft_id, org_id, decided_by, decision, epoch, body_sha256) values ($1, $2, $3, 'approve', 1, repeat('a', 64))`, [rows[0]!.id, org, approvedBy]);
    }
    return rows[0]!.id;
  }
  const count = async (sql: string, args: unknown[]) => Number((await pool.query<{ n: string }>(sql, args)).rows[0]!.n);

  it("기관 담당자 철회: 그 사람의 대화·초안·대화 없는 승인 동작만 지우고, 동료 초안의 승인은 결정자만 비운다", async () => {
    const mine = await conv(croWs, croUser, "cro");
    const theirs = await conv(croWs, croColleague, "cro");
    const myDraft = await draft(croWs, mine, croUser);
    const loose = await draft(croWs, null, croUser);
    const colleagueDraft = await draft(croWs, theirs, croUser); // 동료 초안을 내가 승인
    const r = await new PgPurgeRepo(pool).purge(croUser, "consent_revoked");
    expect(r).toEqual({ conversations: 1, drafts: 2 });
    expect(await count(`select count(*) n from conversations where id = $1`, [mine])).toBe(0);
    expect(await count(`select count(*) n from messages where conversation_id = $1`, [mine])).toBe(0);
    expect(await count(`select count(*) n from outbound_drafts where id = any($1)`, [[myDraft, loose]])).toBe(0);
    expect(await count(`select count(*) n from conversations where id = $1`, [theirs])).toBe(1);
    expect(await count(`select count(*) n from approvals where draft_id = $1 and decided_by is null`, [colleagueDraft])).toBe(1);
    expect(await new PgWorkspaceRepo(pool).consent(croUser)).toBeNull();
    expect(await new PgWorkspaceRepo(pool).consent(croColleague)).not.toBeNull();
    // 철회는 동의 기록을 남긴다
    expect(await count(`select count(*) n from agent_consents where danchu_user_id = $1 and revoked_at is not null`, [croUser])).toBe(1);
    // 다시 받아도 같다
    expect(await new PgPurgeRepo(pool).purge(croUser, "consent_revoked")).toEqual({ conversations: 0, drafts: 0 });
  });

  it("의뢰자 탈퇴: 작업 공간의 대화·초안 전부, 동의 사본, 계정 이용량을 지우고 작업 공간 이름을 비운다", async () => {
    const c1 = await conv(reqWs, reqUser, "requester");
    await draft(reqWs, c1, reqUser);
    await draft(reqWs, null, null);
    const meter = usageMeter(new PgUsageRepo(pool), { prices: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, caps: { userDay: 1, orgMonth: null, allMonth: null } });
    await meter.record({ userId: reqUser, orgId: reqWs, role: "requester" }, { inputTokens: 10, outputTokens: 10 });
    const r = await new PgPurgeRepo(pool).purge(reqUser, "account_deleted");
    expect(r).toEqual({ conversations: 1, drafts: 2 });
    expect(await count(`select count(*) n from outbound_drafts where org_id = $1`, [reqWs])).toBe(0);
    expect(await count(`select count(*) n from agent_consents where danchu_user_id = $1`, [reqUser])).toBe(0);
    expect(await count(`select count(*) n from ai_usage where scope = $1`, [`user:${reqUser}`])).toBe(0);
    expect(await count(`select count(*) n from ai_usage where scope = 'all'`, [])).toBe(1);
    expect((await pool.query(`select name from orgs where id = $1`, [reqWs])).rows[0].name).toBe("삭제된 계정");
  });

  it("이용량: 세 칸(계정 하루·조직 한 달·전체 한 달)에 더하고, 상한을 넘으면 알린다", async () => {
    const repo = new PgUsageRepo(pool);
    const meter = usageMeter(repo, { prices: { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }, caps: { userDay: 3_000_000, orgMonth: null, allMonth: null } });
    const s = { userId: croColleague, orgId: croWs, role: "cro" as const };
    const now = new Date("2026-11-19T03:00:00Z");
    await meter.record(s, { inputTokens: 2, outputTokens: 5, cacheReadTokens: 7 }, now);
    expect(await meter.over(s, now)).toBeNull();
    await meter.record(s, { inputTokens: 1, outputTokens: 0 }, now);
    expect(await meter.over(s, now)).toBe("user_day");
    const rows = (await pool.query(`select scope, period, input_tokens, output_tokens, cache_read_tokens, cost_micros from ai_usage where scope <> 'all' and scope like '%' || $1 order by scope`, [croColleague])).rows;
    expect(rows).toEqual([{ scope: `user:${croColleague}`, period: "2026-11-19", input_tokens: "3", output_tokens: "5", cache_read_tokens: "7", cost_micros: "3000000" }]);
    expect(await repo.costs([{ scope: `org:${croWs}`, period: "2026-11" }])).toEqual([3_000_000]);
  });

  it("앱 역할은 이용량 표를 읽지 못한다", async () => {
    const r = await pool.query(`select has_table_privilege('authenticated', 'ai_usage', 'select') a, has_table_privilege('anon', 'ai_usage', 'select') b`);
    expect(r.rows[0]).toEqual({ a: false, b: false });
  });
});
