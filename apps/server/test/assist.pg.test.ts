// 기관 비서의 DB 부분(0012). TEST_DATABASE_URL이 있으면 새 DB에서 돈다.
// - 비서 대화(mode assist)는 기관만, 요청에 묶이지 않는다. 이어 쓰기(latestAssist)
// - 바로 실행 기록(assist_runs): 본문 없이 저장, 한 번만 되돌림 표시, 최근 순
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_SHEET } from "@danchuai/core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Conversation } from "../src/agent/store";
import { PgConversationRepo } from "../src/db/conversations";
import { PgRunRepo } from "../src/db/runs";

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE && process.env.REQUIRE_DB_TESTS === "1") throw new Error("TEST_DATABASE_URL이 없어요");

const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS = join(here, "../../../supabase/migrations");
const ids = { reqOrg: randomUUID(), croOrg: randomUUID(), reqUser: randomUUID(), croUser: randomUUID() };

const conv = (over: Partial<Conversation>): Conversation => ({
  id: randomUUID(), orgId: ids.croOrg, createdBy: ids.croUser, role: "cro", mode: "assist", requestId: null, danchuNo: null, quote: null,
  sheet: { ...EMPTY_SHEET }, messages: [], question: null, summary: null, draft: null, turns: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, ...over,
});

describe.skipIf(!BASE)("기관 비서 (DB)", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let dbName = "";

  beforeAll(async () => {
    dbName = `danchuai_assist_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const url = new URL(BASE!);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 3 });
    const setup = await pool.connect();
    await setup.query(readFileSync(join(here, "sql/supabase-stub.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await setup.query(readFileSync(join(MIGRATIONS, f), "utf8"));
    await setup.query(`insert into auth.users (id, email) values ($1, null), ($2, null)`, [ids.reqUser, ids.croUser]);
    await setup.query(`insert into orgs (id, kind, name) values ($1, 'requester', '의뢰 쪽'), ($2, 'cro', '기관 쪽')`, [ids.reqOrg, ids.croOrg]);
    setup.release();
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName}`);
      await admin.end();
    }
  });

  it("비서 대화는 기관만, 요청 없이. 가장 최근 것을 이어 쓴다", async () => {
    const repo = new PgConversationRepo(pool);
    const a = conv({});
    await repo.create(a);
    await repo.save({ ...a, turns: 1, messages: [{ role: "user", content: "오늘 뭐 해야 해" }, { role: "assistant", content: "기한 지난 할 일이 하나 있어요." }] });
    const got = await repo.latestAssist(ids.croOrg, ids.croUser);
    expect(got).toMatchObject({ id: a.id, mode: "assist", turns: 1 });
    expect(got!.messages).toHaveLength(2);
    expect(await repo.latestAssist(ids.croOrg, randomUUID())).toBeNull();
    await expect(repo.create(conv({ orgId: ids.reqOrg, createdBy: ids.reqUser, role: "requester" }))).rejects.toMatchObject({ code: "23514" });
    await expect(repo.create(conv({ danchuNo: "DC-2026-0142" }))).rejects.toMatchObject({ code: "23514" });
  });

  it("바로 실행 기록: 저장·조회는 같은 사람만, 되돌림 표시는 한 번", async () => {
    const runs = new PgRunRepo(pool);
    const c = conv({});
    await new PgConversationRepo(pool).create(c);
    const base = { orgId: ids.croOrg, userId: ids.croUser, conversationId: c.id, outcome: "done" as const, undoable: true, undoneAt: null };
    const one = { ...base, id: randomUUID(), action: "task_create", label: "할 일 만들기", danchuLogId: randomUUID(), createdAt: "2026-11-19T01:00:00.000Z" };
    const two = { ...base, id: randomUUID(), action: "deal_move", label: "안건 단계 옮기기", danchuLogId: randomUUID(), createdAt: "2026-11-19T02:00:00.000Z" };
    await runs.insert(one);
    await runs.insert(two);
    expect(await runs.get(one.id, ids.croOrg, ids.croUser)).toMatchObject({ action: "task_create", undoable: true, undoneAt: null });
    expect(await runs.get(one.id, ids.croOrg, randomUUID())).toBeNull();
    expect((await runs.recent(ids.croOrg, ids.croUser, 10)).map((r) => r.action)).toEqual(["deal_move", "task_create"]);
    expect(await runs.markUndone(one.id, "2026-11-19T03:00:00.000Z")).toBe(true);
    expect(await runs.markUndone(one.id, "2026-11-19T03:00:01.000Z")).toBe(false);
    await runs.clearUndone(one.id);
    expect((await runs.get(one.id, ids.croOrg, ids.croUser))!.undoneAt).toBeNull();
    await expect(runs.insert({ ...one, id: randomUUID(), action: "Drop Table" })).rejects.toMatchObject({ code: "23514" });
  });
});
