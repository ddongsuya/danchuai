import type { CompletionRequest, CompletionResult, LlmProvider } from "@danchuai/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CRO_ASSIST_SYSTEM } from "../src/agent/prompts";
import { MemoryConversationRepo } from "../src/agent/store";
import type { DanchuApi, DanchuCatalog, DanchuMe } from "../src/danchu";
import { assistContext, assistTools, CatalogCache, refBook, resolveCall, type AssistBrief, type AssistReport } from "../src/danchuAssist";
import { checkCatalogAction } from "../src/danchuActions";
import { CONSENT_VERSION, danchuIdentity, MemoryWorkspaceRepo } from "../src/danchuAuth";
import { MemoryOutboundRepo } from "../src/repo";
import { MemoryRunRepo } from "../src/runs";

/*
 * 기관 비서 (에이전트 액션 등록부 1~3단계, 2026-11-19)
 * - 단추 액션 목록으로 비서 도구를 만든다: 바로 실행(auto)·tool 만, 번호(D1…)로 대상 고르기
 * - 바로 실행은 단추에서 하고 기록(assist_runs). 되돌리기는 시킨 사람만
 * - 승인이 필요한 액션은 바로 실행하지 않는다(확인 카드). 목록에 새로 생긴 승인 액션도 확인 카드로 받는다
 */
const T_REQ = "tok-requester-aaaaaaaaaaaa";
const T_CRO = "tok-cro-bbbbbbbbbbbbbbbbbbbb";
const T_CRO2 = "tok-cro-second-cccccccccccccc";
const ORG = "33333333-3333-4333-8333-333333333333";
const ME: Record<string, DanchuMe> = {
  [T_REQ]: { id: "11111111-1111-4111-8111-111111111111", role: "requester", name: "가", email: "a@example.test", org: null },
  [T_CRO]: { id: "22222222-2222-4222-8222-222222222222", role: "cro", name: "나", email: "b@example.test", org: { id: ORG, name: "나기관", plan: "pro" } },
  [T_CRO2]: { id: "44444444-4444-4444-8444-444444444444", role: "cro", name: "다", email: "c@example.test", org: { id: ORG, name: "나기관", plan: "pro" } },
};

const ref = (to: string) => ({ type: "string", format: "uuid", "x-ref": to, description: "대상" });
const CATALOG: DanchuCatalog = {
  version: "2026-11-19.1",
  role: "cro",
  actions: [
    { name: "brief", scope: "org", level: "read", area: "brief", label: "오늘 브리핑", description: "", input: { type: "object", properties: {}, additionalProperties: false }, tool: false },
    { name: "report", scope: "org", level: "read", area: "report", label: "기간 보고", description: "", input: { type: "object", properties: {}, additionalProperties: false }, tool: false },
    {
      name: "task_create", scope: "org", level: "auto", area: "crm", label: "할 일 만들기", description: "할 일을 만든다.", tool: true,
      input: { type: "object", properties: { title: { type: "string", maxLength: 200 }, due_on: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, deal_id: ref("deal"), assignee: ref("member") }, required: ["title"], additionalProperties: false },
    },
    {
      name: "deal_move", scope: "org", level: "auto", area: "crm", label: "안건 단계 옮기기", description: "", tool: true,
      input: { type: "object", properties: { id: ref("deal"), stage: { type: "string", enum: ["inquiry", "quote", "negotiation"] } }, required: ["id"], additionalProperties: false },
    },
    { name: "quote_draft", scope: "rfq", level: "auto", area: "quote", label: "견적 임시 저장", description: "", input: { type: "object" }, tool: false },
    { name: "quote_submit", scope: "rfq", level: "confirm", area: "quote", label: "견적 제출", description: "", input: { type: "object" }, tool: false },
    { name: "price_book_apply", scope: "org", level: "confirm", area: "price", label: "단가표 반영", description: "", input: { type: "object" }, tool: false },
    { name: "crm_delete", scope: "org", level: "human", area: "crm", label: "기록 지우기", description: "", input: { type: "object" }, tool: false },
    // 이름이 보내기 계열이면 tool 이어도 비서 도구로 쓰지 않는다
    { name: "send_mail", scope: "org", level: "auto", area: "crm", label: "메일", description: "", input: { type: "object", properties: {}, additionalProperties: false }, tool: true },
  ],
};
const BRIEF: AssistBrief = {
  date: "2026-11-19",
  today: [{ kind: "task", time: null, title: "견적서 보완", sub: "가람바이오 · 랫드 4주 독성", done: false, overdue: true, badge: "D+1", taskId: "t-1", eventId: null }],
  need: [{ dealId: "d-1", title: "랫드 4주 독성", company: "가람바이오", reason: "견적 유효기간 D-3", tone: "due", suggest: "안건 열기", danchuNo: null }],
  deals: [{ id: "d-1", title: "랫드 4주 독성", company: "가람바이오", stage: "quote", stageLabel: "견적", next: null, mine: true, danchuNo: null }],
  tasks: [{ id: "t-1", title: "견적서 보완", due: "2026-11-18", assignee: "나", dealId: "d-1" }],
  events: [],
  companies: [{ id: "c-1", name: "가람바이오" }],
  contacts: [{ id: "p-1", name: "박 팀장", title: "팀장", companyId: "c-1" }],
  members: [{ id: ME[T_CRO]!.id, name: "나", me: true }, { id: ME[T_CRO2]!.id, name: "다", me: false }],
};
const REPORT: AssistReport = { from: "2026-11-16", to: "2026-11-19", created: 3, won: 1, lost: 1, winRate: 50, wonSum: 48_500_000, reasons: [{ reason: "가격", count: 1 }], funnel: [], activity: [] };

class FakeProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model = "fake";
  calls: CompletionRequest[] = [];
  constructor(private script: Partial<CompletionResult>[] = []) {}
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(structuredClone({ ...req, onText: undefined, signal: undefined }));
    const r = this.script.shift() ?? {};
    if (r.text) req.onText?.(r.text);
    return { text: r.text ?? "", toolCalls: r.toolCalls ?? [], usage: { inputTokens: 1, outputTokens: 1 }, stop: "done", provider: "anthropic", model: "fake" };
  }
}

function setup(provider?: LlmProvider) {
  const ran: Array<{ action: string; body: Record<string, unknown> }> = [];
  const acted: Array<{ action: string; rfqNo: string | null }> = [];
  const undone: string[] = [];
  let logSeq = 0;
  const api: DanchuApi = {
    me: async (t) => (ME[t] ? { ok: true, data: ME[t]! } : { ok: false, error: "unauthorized" }),
    requesterList: async () => ({ ok: true, data: [] }),
    requesterDetail: async () => ({ ok: false, error: "not_found" }),
    croList: async () => ({ ok: true, data: [] }),
    croDetail: async () => ({ ok: false, error: "not_found" }),
    croQuote: async () => ({ ok: false, error: "not_found" }),
    recordConsent: async (_t, version) => ({ ok: true, data: { version } }),
    act: async (_t, a) => {
      acted.push({ action: a.action, rfqNo: a.rfqNo });
      return { status: 200, body: { ok: true } };
    },
    catalog: async (t) => (ME[t]?.role === "cro" ? { ok: true, data: CATALOG } : { ok: true, data: { version: "x", role: "requester", actions: [] } }),
    run: async (_t, a) => {
      if (a.action === "brief") return { status: 200, body: { brief: BRIEF } };
      if (a.action === "report") return { status: 200, body: { report: REPORT } };
      ran.push({ action: a.action, body: a.body });
      if (a.body.title === "거절") return { status: 400, body: { error: "할 일을 적어 주세요." } };
      return { status: 200, body: { ok: true, id: "x", agentLog: { id: `00000000-0000-4000-8000-${String(++logSeq).padStart(12, "0")}`, undoable: true } } };
    },
    undo: async (_t, id) => {
      undone.push(id);
      return { status: 200, body: { ok: true } };
    },
  };
  const workspaces = new MemoryWorkspaceRepo();
  const id = danchuIdentity(api, workspaces);
  const runs = new MemoryRunRepo();
  const conversations = new MemoryConversationRepo();
  const app = createApp({ auth: id.resolver, outbound: new MemoryOutboundRepo(), transport: { deliver: async () => "unknown" }, danchu: { api, lookup: id.lookup, workspaces }, provider, conversations, runs });
  const call = (method: string, path: string, token: string, body?: unknown) =>
    app.request(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const consent = (t: string) => call("POST", "/account/consent", t, { version: CONSENT_VERSION });
  return { call, consent, ran, acted, undone, runs };
}
const json = async (r: Response) => (await r.json()) as Record<string, any>;

describe("단추 목록 → 비서 도구", () => {
  it("바로 실행·tool 만, 보내기 계열 이름은 빼고, 참조 칸은 번호 문자열로(모델 API 가 받지 않는 칸 없음)", () => {
    const tools = assistTools(CATALOG);
    expect(tools.map((t) => t.name)).toEqual(["task_create", "deal_move"]);
    const props = (tools[0]!.inputSchema as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(props.deal_id).toEqual({ type: "string", description: expect.stringContaining("D1") });
    expect(JSON.stringify(tools)).not.toMatch(/"format"|x-ref/);
  });

  it("맥락: 번호로 고를 목록, 코드 계산 숫자. 금액 합계는 넣지 않는다", () => {
    const text = assistContext(BRIEF, refBook(BRIEF), REPORT);
    expect(text).toContain("D1 랫드 4주 독성 · 가람바이오 · 견적");
    expect(text).toContain("T1 견적서 보완 · 기한 2026-11-18");
    expect(text).toContain("P1 박 팀장 팀장(C1)");
    expect(text).toContain("M1 나(나)");
    expect(text).toContain("수주율 50%");
    expect(text).not.toMatch(/48500000|48,500,000/);
  });

  it("번호를 id 로 바꾸고, 목록에 없는 번호·다른 종류 번호·틀린 값은 실행하지 않는다", () => {
    const book = refBook(BRIEF);
    const a = CATALOG.actions.find((x) => x.name === "task_create")!;
    expect(resolveCall(a, { title: "후속 연락", deal_id: "d1", assignee: "M2", extra: 1 }, book)).toEqual({ ok: true, body: { title: "후속 연락", deal_id: "d-1", assignee: ME[T_CRO2]!.id } });
    expect(resolveCall(a, { title: "x", deal_id: "D9" }, book)).toEqual({ ok: false, reason: "unknown_ref" });
    expect(resolveCall(a, { title: "x", deal_id: "T1" }, book)).toEqual({ ok: false, reason: "unknown_ref" });
    expect(resolveCall(a, { title: "x", due_on: "다음 주" }, book)).toEqual({ ok: false, reason: "bad_input" });
    expect(resolveCall(a, { due_on: "2026-11-20" }, book)).toEqual({ ok: false, reason: "bad_input" });
    const m = CATALOG.actions.find((x) => x.name === "deal_move")!;
    expect(resolveCall(m, { id: "D1", stage: "won" }, book)).toEqual({ ok: false, reason: "bad_input" });
  });

  it("목록은 기관마다 잠깐 기억한다", async () => {
    let n = 0;
    const cache = new CatalogCache({ catalog: async () => (n++, { ok: true as const, data: CATALOG }) }, 1000, () => 0);
    await cache.get("t", ORG);
    await cache.get("t", ORG);
    expect(n).toBe(1);
  });
});

describe("바로 실행·되돌리기 (/v1/danchu/run)", () => {
  it("동의 전 403, 승인이 필요한 것 409, 사람만 403, 요청 단위 바로 실행 409, 읽기는 결과", async () => {
    const { call, consent } = setup();
    expect((await call("POST", "/v1/danchu/run", T_CRO, { action: "task_create", body: { title: "x" } })).status).toBe(403);
    await consent(T_CRO);
    expect(await json(await call("POST", "/v1/danchu/run", T_CRO, { action: "price_book_apply", body: {} }))).toEqual({ error: "needs_approval" });
    expect((await call("POST", "/v1/danchu/run", T_CRO, { action: "crm_delete", body: {} })).status).toBe(403);
    expect((await call("POST", "/v1/danchu/run", T_CRO, { action: "quote_draft", rfqNo: "DC-2026-0142", body: {} })).status).toBe(409);
    expect((await call("POST", "/v1/danchu/run", T_CRO, { action: "nope", body: {} })).status).toBe(404);
    const r = await json(await call("POST", "/v1/danchu/run", T_CRO, { action: "brief" }));
    expect(r.result.brief.date).toBe("2026-11-19");
  });

  it("바로 실행은 기록하고, 시킨 사람만 한 번 되돌린다", async () => {
    const { call, consent, undone, runs } = setup();
    await consent(T_CRO);
    await consent(T_CRO2);
    const r = await json(await call("POST", "/v1/danchu/run", T_CRO, { action: "task_create", body: { title: "후속 연락" } }));
    expect(r.run).toMatchObject({ action: "task_create", label: "할 일 만들기", outcome: "done", undoable: true });
    expect(runs.rows[0]).toMatchObject({ userId: ME[T_CRO]!.id, danchuLogId: "00000000-0000-4000-8000-000000000001" });
    expect(JSON.stringify(runs.rows[0])).not.toContain("후속 연락");
    expect((await call("POST", `/v1/danchu/runs/${r.run.id}/undo`, T_CRO2)).status).toBe(404);
    expect((await call("POST", `/v1/danchu/runs/${r.run.id}/undo`, T_CRO)).status).toBe(200);
    expect(undone).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(await json(await call("POST", `/v1/danchu/runs/${r.run.id}/undo`, T_CRO))).toEqual({ error: "already_undone" });
    const list = await json(await call("GET", "/v1/danchu/runs", T_CRO));
    expect(list.items[0]).toMatchObject({ undone: true, undoable: false });
  });

  it("단추가 거절하면 422 와 기록(되돌리기 없음)", async () => {
    const { call, consent } = setup();
    await consent(T_CRO);
    const res = await call("POST", "/v1/danchu/run", T_CRO, { action: "task_create", body: { title: "거절" } });
    expect(res.status).toBe(422);
    expect((await json(res)).run).toMatchObject({ outcome: "failed", undoable: false });
  });
});

describe("목록에 새로 생긴 승인 액션은 확인 카드로", () => {
  it("confirm 만 받고, 바로 실행·사람만·다른 역할은 거절", () => {
    expect(checkCatalogAction("cro", { action: "price_book_apply", body: { rows: [] } }, CATALOG)).toMatchObject({ ok: true });
    expect(checkCatalogAction("cro", { action: "task_create", body: {} }, CATALOG)).toEqual({ ok: false, error: "forbidden" });
    expect(checkCatalogAction("cro", { action: "crm_delete", body: {} }, CATALOG)).toEqual({ ok: false, error: "forbidden" });
    expect(checkCatalogAction("requester", { action: "price_book_apply", body: {} }, CATALOG)).toEqual({ ok: false, error: "forbidden" });
    expect(checkCatalogAction("cro", { action: "price_book_apply", rfqNo: "DC-2026-0142", body: {} }, CATALOG)).toEqual({ ok: false, error: "bad_request" });
  });

  it("확인 카드 → 승인 → 단추로 한 번", async () => {
    const { call, consent, acted } = setup();
    await consent(T_CRO);
    const d = await json(await call("POST", "/v1/danchu/actions", T_CRO, { action: "price_book_apply", body: { rows: [{ code: "A", price: "1" }] } }));
    expect(d.status).toBe("drafted");
    expect((await call("POST", `/v1/outbound/${d.id}/decision`, T_CRO, { decision: "approve", epoch: d.epoch, textHash: d.textHash })).status).toBe(200);
    expect(await json(await call("POST", `/v1/outbound/${d.id}/dispatch`, T_CRO))).toMatchObject({ status: "sent" });
    expect(acted).toEqual([{ action: "price_book_apply", rfqNo: null }]);
    expect((await call("POST", "/v1/danchu/actions", T_CRO, { action: "task_create", body: { title: "x" } })).status).toBe(403);
  });
});

describe("기관 비서 대화", () => {
  it("기관 담당자만 열고, 다시 열면 이어 쓴다", async () => {
    const { call, consent } = setup(new FakeProvider());
    await consent(T_REQ);
    await consent(T_CRO);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, { mode: "assist" })).status).toBe(403);
    const a = await json(await call("POST", "/v1/agent/conversations", T_CRO, { mode: "assist" }));
    expect(a.mode).toBe("assist");
    const b = await json(await call("POST", "/v1/agent/conversations", T_CRO, { mode: "assist" }));
    expect(b.id).toBe(a.id);
  });

  it("턴: 브리핑 맥락과 바로 실행 도구만 주고, 모델이 부른 동작을 번호→id 로 바꿔 단추에서 실행한다", async () => {
    const provider = new FakeProvider([
      {
        text: "가람바이오 후속 연락을 11월 25일 할 일로 잡고, 안건은 협의로 옮길게요.",
        toolCalls: [
          { id: "1", name: "task_create", input: { title: "가람바이오 후속 연락", due_on: "2026-11-25", deal_id: "D1" } },
          { id: "2", name: "deal_move", input: { id: "D1", stage: "negotiation" } },
          { id: "3", name: "task_create", input: { title: "없는 안건", deal_id: "D7" } },
          { id: "4", name: "quote_submit", input: {} },
        ],
      },
    ]);
    const { call, consent, ran } = setup(provider);
    await consent(T_CRO);
    const conv = await json(await call("POST", "/v1/agent/conversations", T_CRO, { mode: "assist" }));
    const sse = await (await call("POST", `/v1/agent/conversations/${conv.id}/turn`, T_CRO, { text: "가람 건 다음 주 화요일에 후속 연락 잡고 협의로 옮겨 줘" })).text();
    const req = provider.calls[0]!;
    expect(req.system).toBe(CRO_ASSIST_SYSTEM);
    expect(req.tools?.map((t) => t.name)).toEqual(["task_create", "deal_move"]);
    expect(String(req.messages.at(-1)?.content)).toContain("<오늘 브리핑");
    expect(ran).toEqual([
      { action: "task_create", body: { title: "가람바이오 후속 연락", due_on: "2026-11-25", deal_id: "d-1" } },
      { action: "deal_move", body: { id: "d-1", stage: "negotiation" } },
    ]);
    expect(sse.match(/event: action/g)).toHaveLength(4);
    expect(sse).toContain('"outcome":"skipped"');
    // 기록 표시는 화면에 보이지 않는다
    const view = await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_CRO));
    expect(view.messages.at(-1).text).toBe("가람바이오 후속 연락을 11월 25일 할 일로 잡고, 안건은 협의로 옮길게요.");
  });

  it("비서 대화에서는 보내기 초안을 만들지 않는다", async () => {
    const { call, consent } = setup(new FakeProvider());
    await consent(T_CRO);
    const conv = await json(await call("POST", "/v1/agent/conversations", T_CRO, { mode: "assist" }));
    expect((await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, T_CRO, { version: 1 })).status).toBe(409);
  });
});
