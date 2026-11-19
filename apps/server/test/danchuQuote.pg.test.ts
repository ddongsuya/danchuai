// 말로 맡기는 견적 2단계의 DB 부분(0010). TEST_DATABASE_URL이 있으면 새 DB에서 돈다.
// - 기관 견적 대화: 단추 요청 번호·견적 초안 저장, 이어 쓰기(findDanchu), 요청 없는 기관 대화는 막힘
// - 단추 동작은 한 대화에서 여러 번(판 없이) 만들 수 있고, 어느 대화의 동작인지 찾을 수 있다
// - 단추로 접수된 의뢰자 대화는 요청함에 작성 중·대기로 보이지 않는다
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_SHEET, quoteDraftFromBrief, type DanchuQuoteBrief } from "@danchuai/core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Conversation } from "../src/agent/store";
import { PgConversationRepo } from "../src/db/conversations";
import { PgMarketRepo } from "../src/db/market";
import { PgOutboundRepo } from "../src/db/outbound";

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE && process.env.REQUIRE_DB_TESTS === "1") throw new Error("TEST_DATABASE_URL이 없어요");

const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS = join(here, "../../../supabase/migrations");

const ids = { reqOrg: randomUUID(), croOrg: randomUUID(), reqUser: randomUUID(), croUser: randomUUID() };

const BRIEF: DanchuQuoteBrief = {
  no: "DC-2026-0142",
  state: "open",
  closedReason: null,
  request: {
    full: true, substance: "후보물질 A", categories: ["일반독성"], overview: [], common: [], situation: [], ask: [], replyBy: "2026-11-30", authorities: [], translation: false, files: [],
    rows: [{ seq: 1, category: "일반독성", name: "랫드 4주 반복투여독성", cond: "" }],
  },
  draft: {
    status: "draft", prefilled: true, note: "", steps: [], pdfName: "",
    common: { validUntil: "", startDate: "", payTerms: "", substanceQty: "", reportLang: "", includes: [] },
    items: [{ seq: 1, avail: "가능", amount: "48500000", weeks: "14", source: "catalog" }],
  },
};

const conv = (over: Partial<Conversation>): Conversation => ({
  id: randomUUID(),
  orgId: ids.croOrg,
  createdBy: ids.croUser,
  role: "cro",
  mode: "request",
  requestId: null,
  danchuNo: null,
  quote: null,
  sheet: { ...EMPTY_SHEET },
  messages: [],
  question: null,
  summary: null,
  draft: null,
  turns: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ...over,
});

describe.skipIf(!BASE)("말로 맡기는 견적 2단계 (DB)", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let dbName = "";

  beforeAll(async () => {
    dbName = `danchuai_quote_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const url = new URL(BASE!);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 3 });
    const setup = await pool.connect();
    await setup.query(readFileSync(join(here, "sql/supabase-stub.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      await setup.query(readFileSync(join(MIGRATIONS, f), "utf8"));
    }
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

  it("기관 견적 대화: 단추 번호·견적 초안을 저장하고, 같은 사용자·같은 번호로 이어 쓴다", async () => {
    const repo = new PgConversationRepo(pool);
    const c = conv({ danchuNo: "DC-2026-0142", quote: quoteDraftFromBrief(BRIEF) });
    await repo.create(c);
    const got = await repo.get(c.id);
    expect(got).toMatchObject({ danchuNo: "DC-2026-0142", quote: { no: "DC-2026-0142", priced: [1], submittedVersion: null } });
    await repo.save({ ...got!, quote: { ...got!.quote!, submittedVersion: 1 } });
    expect((await repo.findDanchu(ids.croOrg, ids.croUser, "DC-2026-0142"))?.quote?.submittedVersion).toBe(1);
    expect(await repo.findDanchu(ids.croOrg, randomUUID(), "DC-2026-0142")).toBeNull();
    expect(await repo.findDanchu(ids.croOrg, ids.croUser, "DC-2026-0999")).toBeNull();
  });

  it("요청이 없는 기관 요청 대화와 번호 모양이 틀린 단추 번호는 DB가 막는다", async () => {
    const repo = new PgConversationRepo(pool);
    await expect(repo.create(conv({}))).rejects.toMatchObject({ code: "23514" });
    await expect(repo.create(conv({ danchuNo: "DC-26-1" }))).rejects.toMatchObject({ code: "23514" });
  });

  it("단추 동작은 한 대화에서 여러 번 만들 수 있고, 어느 대화의 동작인지 찾는다", async () => {
    const repo = new PgConversationRepo(pool);
    const c = conv({ danchuNo: "DC-2026-0142", quote: quoteDraftFromBrief(BRIEF) });
    await repo.create(c);
    const out = new PgOutboundRepo(pool);
    const action = (text: string) => ({ id: randomUUID(), orgId: ids.croOrg, counterpartyOrgId: ids.croOrg, kind: "danchu" as const, text, textHash: "0".repeat(64), epoch: 1, status: "drafted" as const });
    const a = action('{"action":"quote_draft"}');
    const b = action('{"action":"quote_submit"}');
    expect(await out.insertBatch([a], { conversationId: c.id })).toBe(true);
    expect(await out.insertBatch([b], { conversationId: c.id })).toBe(true);
    expect(await out.conversationOf(b.id)).toBe(c.id);
    const free = action('{"action":"join"}');
    expect(await out.insertBatch([free])).toBe(true);
    expect(await out.conversationOf(free.id)).toBeNull();
  });

  it("요청함: 단추로 접수된 의뢰자 대화는 작성 중·대기가 아니라 보낸 것으로 본다", async () => {
    const repo = new PgConversationRepo(pool);
    const market = new PgMarketRepo(pool);
    const req = (over: Partial<Conversation>) => conv({ orgId: ids.reqOrg, createdBy: ids.reqUser, role: "requester", ...over });
    const writing = req({});
    const waiting = req({});
    const sent = req({});
    const numbered = req({});
    for (const c of [writing, waiting, sent, numbered]) await repo.create(c);
    const draft = { body: "본문", dropped: 0, version: 1, outboundCreated: false };
    await repo.save({ ...writing, turns: 1 });
    await repo.save({ ...waiting, turns: 1, draft });
    await repo.save({ ...sent, turns: 1, draft: { ...draft, outboundCreated: true } });
    await repo.save({ ...numbered, turns: 1, draft, danchuNo: "DC-2026-0011" });
    const items = await market.requesterList(ids.reqOrg);
    const status = Object.fromEntries(items.map((i) => [i.conversationId, i.status]));
    expect(status[writing.id]).toBe("drafting");
    expect(status[waiting.id]).toBe("waiting");
    expect(status[sent.id]).toBe("sent");
    expect(status[numbered.id]).toBe("sent");
  });
});
