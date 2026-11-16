// 요청 보내기·회신·선정(0005, InAppTransport, /v1/labs·/v1/requests·/v1/lab). TEST_DATABASE_URL이 있으면 새 DB에서 돈다.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_SHEET, computeTotals, type CompletionResult, type LlmProvider } from "@danchuai/core";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { PgConversationRepo, PgRequestDirectory } from "../src/db/conversations";
import { InAppTransport, PgMarketRepo } from "../src/db/market";
import { PgOutboundRepo } from "../src/db/outbound";
import { PgAccountRepo } from "../src/db/account";
import { pgMemberships, supabaseAuth } from "../src/supabaseAuth";

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE && process.env.REQUIRE_DB_TESTS === "1") throw new Error("TEST_DATABASE_URL이 없어요");
const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS = join(here, "../../../supabase/migrations");
const ISSUER = "https://test.supabase.co/auth/v1";

const ids = {
  reqOrg: randomUUID(),
  otherReqOrg: randomUUID(),
  croA: randomUUID(),
  croB: randomUUID(),
  croC: randomUUID(),
  reqUser: randomUUID(),
  otherReqUser: randomUUID(),
  aUser: randomUUID(),
  bUser: randomUUID(),
  cUser: randomUUID(),
};

class Fake implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model = "fake";
  next: Partial<CompletionResult> = {};
  async complete(): Promise<CompletionResult> {
    const r = this.next;
    return { text: r.text ?? "네.", toolCalls: r.toolCalls ?? [], usage: { inputTokens: 1, outputTokens: 1 }, stop: "done", provider: "anthropic", model: "fake" };
  }
}

const SHEET = { ...EMPTY_SHEET, testType: "반복투여독성", substance: "저분자", species: "랫드", route: "경구", duration: "4주", glp: "GLP", dueDate: "11월 29일" };

describe.skipIf(!BASE)("요청 보내기·회신·선정", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let dbName = "";
  let sign: (sub: string) => Promise<string>;
  const fake = new Fake();
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dbName = `danchuai_mkt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
    await setup.query(`insert into auth.users (id, email) values ($1,'req@example.com'),($2,null),($3,null),($4,null),($5,null)`, [
      ids.reqUser,
      ids.otherReqUser,
      ids.aUser,
      ids.bUser,
      ids.cUser,
    ]);
    await setup.query(
      `insert into orgs (id, kind, name) values ($1,'requester','의뢰 회사'),($2,'requester','다른 의뢰 회사'),($3,'cro','나 기관'),($4,'cro','가 기관'),($5,'cro','다 기관')`,
      [ids.reqOrg, ids.otherReqOrg, ids.croA, ids.croB, ids.croC],
    );
    await setup.query(
      `insert into members (user_id, org_id, display_name) values ($1,$2,'김담당'),($3,$4,null),($5,$6,null),($7,$8,null),($9,$10,null)`,
      [ids.reqUser, ids.reqOrg, ids.otherReqUser, ids.otherReqOrg, ids.aUser, ids.croA, ids.bUser, ids.croB, ids.cUser, ids.croC],
    );
    setup.release();

    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" }] });
    sign = (sub) =>
      new SignJWT({ role: "authenticated" })
        .setProtectedHeader({ alg: "ES256", kid: "k1" })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience("authenticated")
        .setExpirationTime("10m")
        .sign(privateKey);

    app = createApp({
      auth: supabaseAuth({ key: jwks, issuer: ISSUER, memberships: pgMemberships(pool) }),
      outbound: new PgOutboundRepo(pool),
      transport: new InAppTransport(pool),
      provider: fake,
      conversations: new PgConversationRepo(pool),
      requests: new PgRequestDirectory(pool),
      market: new PgMarketRepo(pool),
    });
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      for (let i = 0; i < 50; i++) {
        try {
          await admin.query(`drop database if exists ${dbName}`);
          break;
        } catch (e) {
          if ((e as { code?: string }).code !== "55006" || i === 49) throw e;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      await admin.end();
    }
  });

  const call = async (method: string, path: string, token: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

  /** 사람이 승인하고 보내기(발송 1회) */
  const approveAndSend = async (t: string, d: { id: string; epoch: number; textHash: string }) => {
    expect((await call("POST", `/v1/outbound/${d.id}/decision`, t, { decision: "approve", epoch: d.epoch, textHash: d.textHash })).status).toBe(200);
    return json<{ status: string }>(call("POST", `/v1/outbound/${d.id}/dispatch`, t));
  };

  /** 의뢰자: 대화 → 본문 초안 → 받는 기관 → 보내기. 요청 id를 돌려준다. */
  async function sendRequest(to: string[]) {
    const t = await sign(ids.reqUser);
    const { id: convId } = await json<{ id: string }>(call("POST", "/v1/agent/conversations", t, {}));
    fake.next = {
      toolCalls: [
        { id: "u", name: "update_sheet", input: SHEET },
        { id: "d", name: "draft_body", input: { body: "랫드 4주 경구 독성시험 견적을 요청드려요." } },
      ],
    };
    await (await call("POST", `/v1/agent/conversations/${convId}/turn`, t, { text: "견적 받아 줘" })).text();
    const out = await call("POST", `/v1/agent/conversations/${convId}/outbound`, t, { version: 1, recipientOrgIds: to });
    expect(out.status).toBe(201);
    const { outbound, requestId: madeId } = await json<{ requestId: string; outbound: Array<{ id: string; epoch: number; textHash: string }> }>(out);
    for (const d of outbound) expect(await approveAndSend(t, d)).toEqual({ status: "sent" });
    const { items } = await json<{ items: Array<{ conversationId: string; requestId: string }> }>(call("GET", "/v1/requests", t));
    const requestId = items.find((i) => i.conversationId === convId)!.requestId;
    // 보내기 초안 응답이 만든 요청 id를 알려 준다(앱이 진행 화면으로 바로 간다)
    expect(madeId).toBe(requestId);
    // 이어 보기: 기록은 돌려주되 모델용 표시("(요청서 갱신)" 등)는 빼고, 초안은 보낸 것으로 표시
    const view = await json<{ messages: Array<{ role: string; text: string }>; draft: { sent: boolean } }>(call("GET", `/v1/agent/conversations/${convId}`, t));
    expect(view.messages[0]).toEqual({ role: "user", text: "견적 받아 줘" });
    expect(view.messages.some((m) => /\(요청서 갱신\)|\(본문 초안\)/.test(m.text))).toBe(false);
    expect(view.draft.sent).toBe(true);
    return { t, convId, requestId };
  }

  /** 기관: 받은 요청으로 대화 → 회신 초안 → 견적 줄 → 보내기 */
  async function reply(labUser: string, requestId: string, lines: Array<{ label: string; amountWon: number }>, weeks: number) {
    const t = await sign(labUser);
    const conv = await call("POST", "/v1/agent/conversations", t, { requestId });
    expect(conv.status).toBe(201);
    const { id } = await json<{ id: string }>(conv);
    fake.next = { toolCalls: [{ id: "d", name: "draft_body", input: { body: "요청하신 시험 견적을 보내 드려요." } }] };
    await (await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "회신 써 줘" })).text();
    const out = await call("POST", `/v1/agent/conversations/${id}/outbound`, t, { version: 1, quoteLines: lines, durationWeeks: weeks });
    expect(out.status).toBe(201);
    const { outbound } = await json<{ outbound: Array<{ id: string; epoch: number; textHash: string }> }>(out);
    expect(await approveAndSend(t, outbound[0]!)).toEqual({ status: "sent" });
  }

  it("기관 목록은 가입 기관만 가나다순, 기관 역할은 볼 수 없다", async () => {
    const { labs } = await json<{ labs: Array<{ id: string; name: string }> }>(call("GET", "/v1/labs", await sign(ids.reqUser)));
    expect(labs.map((l) => l.name)).toEqual(["가 기관", "나 기관", "다 기관"]);
    expect((await call("GET", "/v1/labs", await sign(ids.aUser))).status).toBe(403);
  });

  it("가입 기관이 아닌 곳(의뢰 조직)에는 보내기 초안을 만들 수 없다", async () => {
    const t = await sign(ids.reqUser);
    const { id } = await json<{ id: string }>(call("POST", "/v1/agent/conversations", t, {}));
    fake.next = {
      toolCalls: [
        { id: "u", name: "update_sheet", input: SHEET },
        { id: "d", name: "draft_body", input: { body: "견적을 요청드려요." } },
      ],
    };
    await (await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "본문" })).text();
    const r = await call("POST", `/v1/agent/conversations/${id}/outbound`, t, { version: 1, recipientOrgIds: [ids.otherReqOrg] });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "unknown_recipient" });
  });

  it("요청 → 기관 받은 요청함(의뢰자 신원 없음) → 회신(금액은 서버 계산) → 도착 순 → 선정 → 선정 기관에만 공개", async () => {
    const { t, requestId } = await sendRequest([ids.croA, ids.croB]);

    // 기관 A: 받은 요청함. 의뢰 회사 이름·메일·담당자 이름이 응답 어디에도 없다.
    const ta = await sign(ids.aUser);
    const inboxRaw = await (await call("GET", "/v1/lab/requests", ta)).text();
    const inbox = JSON.parse(inboxRaw) as { items: Array<{ requestId: string; status: string; title: string; dueDate: string }> };
    expect(inbox.items).toEqual([expect.objectContaining({ requestId, status: "received", title: "랫드 4주 반복투여독성", dueDate: "11월 29일" })]);
    const detailRaw = await (await call("GET", `/v1/lab/requests/${requestId}`, ta)).text();
    for (const secret of ["의뢰 회사", "req@example.com", "김담당", ids.reqOrg]) {
      expect(inboxRaw).not.toContain(secret);
      expect(detailRaw).not.toContain(secret);
    }
    const detail = JSON.parse(detailRaw) as { message: string; requester: unknown; sheet: { species: string } };
    expect(detail.message).toBe("랫드 4주 경구 독성시험 견적을 요청드려요.");
    expect(detail.requester).toBeNull();
    expect(detail.sheet.species).toBe("랫드");

    // 확인 표시
    expect((await call("POST", `/v1/lab/requests/${requestId}/viewed`, ta)).status).toBe(204);
    const viewed = await json<{ status: string }>(call("GET", `/v1/lab/requests/${requestId}`, ta));
    expect(viewed.status).toBe("viewed");

    // 받지 않은 기관 C는 없는 요청과 같다
    expect((await call("GET", `/v1/lab/requests/${requestId}`, await sign(ids.cUser))).status).toBe(404);
    expect((await call("POST", "/v1/agent/conversations", await sign(ids.cUser), { requestId })).status).toBe(404);

    // 기관 B가 먼저, A가 나중에 회신 → 비교는 도착 순(B, A)
    await reply(ids.bUser, requestId, [{ label: "반복투여 4주", amountWon: 90_000_000 }], 12);
    await reply(ids.aUser, requestId, [{ label: "반복투여 4주", amountWon: 82_000_000 }, { label: "TK 분석", amountWon: 17_000_000 }], 14);

    const d = await json<{
      status: string;
      recipients: Array<{ labId: string; labName: string; status: string; quote: { subtotalWon: number; totalWithVatWon: number; durationWeeks: number; body: string } }>;
    }>(call("GET", `/v1/requests/${requestId}`, t));
    expect(d.status).toBe("sent");
    expect(d.recipients.map((r) => r.labName)).toEqual(["가 기관", "나 기관"]); // B(가 기관)가 먼저 도착
    const a = d.recipients.find((r) => r.labId === ids.croA)!;
    const lines = [82_000_000, 17_000_000].map((amountWon, i) => ({ label: String(i), amountWon }));
    expect(a.quote.subtotalWon).toBe(99_000_000);
    expect(a.quote.totalWithVatWon).toBe(computeTotals(lines).totalWithVatWon);
    expect(a.quote.durationWeeks).toBe(14);
    expect(a.quote.body).toContain("견적 총액(부가세 포함)");

    // 목록
    const list = await json<{ items: Array<{ requestId: string; status: string; recipients: number; replies: number }> }>(call("GET", "/v1/requests", t));
    expect(list.items.find((i) => i.requestId === requestId)).toEqual(expect.objectContaining({ status: "sent", recipients: 2, replies: 2 }));

    // 다른 의뢰 조직·기관 역할은 볼 수 없다
    expect((await call("GET", `/v1/requests/${requestId}`, await sign(ids.otherReqUser))).status).toBe(404);
    expect((await call("GET", "/v1/requests/a", t)).status).toBe(404);
    expect((await call("GET", `/v1/requests/${requestId}`, ta)).status).toBe(403);
    expect((await call("POST", `/v1/requests/${requestId}/select`, await sign(ids.otherReqUser), { labOrgId: ids.croA })).status).toBe(404);

    // 선정: 받지 않은 기관은 안 되고, 회신한 기관은 한 번만
    expect((await call("POST", `/v1/requests/${requestId}/select`, t, { labOrgId: ids.croC })).status).toBe(409);
    expect(await json(call("POST", `/v1/requests/${requestId}/select`, t, { labOrgId: ids.croA }))).toEqual({ status: "selected" });
    expect((await call("POST", `/v1/requests/${requestId}/select`, t, { labOrgId: ids.croB })).status).toBe(409);

    // 선정 기관 A에만 공개, B는 미선정이고 신원 없음
    const aDetail = await json<{ status: string; requester: { orgName: string; name: string; email: string } }>(call("GET", `/v1/lab/requests/${requestId}`, ta));
    expect(aDetail.status).toBe("selected");
    expect(aDetail.requester).toEqual(expect.objectContaining({ orgName: "의뢰 회사", name: "김담당", email: "req@example.com" }));
    const tb = await sign(ids.bUser);
    const bRaw = await (await call("GET", `/v1/lab/requests/${requestId}`, tb)).text();
    expect(JSON.parse(bRaw)).toEqual(expect.objectContaining({ status: "not_selected", requester: null }));
    expect(bRaw).not.toContain("의뢰 회사");
    // 미선정 기관은 새 회신 대화를 열 수 없다
    expect((await call("POST", "/v1/agent/conversations", tb, { requestId })).status).toBe(404);

    // 선정 뒤에는 같은 요청으로 다시 보낼 수 없다
    const { items } = await json<{ items: Array<{ requestId: string; status: string }> }>(call("GET", "/v1/requests", t));
    expect(items.find((i) => i.requestId === requestId)!.status).toBe("selected");
  });

  it("질문 대화: 기관도 요청 없이 열고(Postgres), 의뢰자 요청함에는 나오지 않는다", async () => {
    const tl = await sign(ids.aUser);
    const lab = await call("POST", "/v1/agent/conversations", tl, { mode: "ask" });
    expect(lab.status).toBe(201);
    const labConv = await json<{ id: string; mode: string }>(lab);
    expect(labConv.mode).toBe("ask");
    await (await call("POST", `/v1/agent/conversations/${labConv.id}/turn`, tl, { text: "유전독성 표준 조합" })).text();
    expect((await json<{ mode: string; messages: unknown[] }>(call("GET", `/v1/agent/conversations/${labConv.id}`, tl))).messages).toHaveLength(2);

    const t = await sign(ids.reqUser);
    const { id } = await json<{ id: string }>(call("POST", "/v1/agent/conversations", t, { mode: "ask" }));
    await (await call("POST", `/v1/agent/conversations/${id}/turn`, t, { text: "반복투여 기간" })).text();
    const { items } = await json<{ items: Array<{ conversationId: string }> }>(call("GET", "/v1/requests", t));
    expect(items.some((i) => i.conversationId === id)).toBe(false);
    // 지난 질문: 내 질문 대화만, 첫 질문이 제목
    const asks = await json<{ items: Array<{ id: string; title: string }> }>(call("GET", "/v1/agent/asks", t));
    expect(asks.items.map((a) => a.title)).toEqual(["반복투여 기간"]);
  });

  it("회신 전에는 선정할 수 없다(409 not_replied)", async () => {
    const { t, requestId } = await sendRequest([ids.croC]);
    const r = await call("POST", `/v1/requests/${requestId}/select`, t, { labOrgId: ids.croC });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "not_replied" });
  });

  it("계정: 구성원 목록은 내 조직만, 이름은 나만 바꾼다(Postgres)", async () => {
    const repo = new PgAccountRepo(pool);
    expect(await repo.members(ids.reqUser)).toEqual([{ name: "김담당", role: "member", me: true }]);
    expect(await repo.rename(ids.reqUser, "김담당자")).toBe(true);
    expect((await repo.members(ids.reqUser))![0]!.name).toBe("김담당자");
    expect(await repo.members(randomUUID())).toBeNull();
    await repo.rename(ids.reqUser, "김담당");
  });
});
