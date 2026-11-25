import type { CompletionRequest, CompletionResult, DanchuQuoteBrief, LlmProvider } from "@danchuai/core";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { CRO_DANCHU_SYSTEM } from "../src/agent/prompts";
import { DanchuRequestDirectory, MemoryConversationRepo } from "../src/agent/store";
import { danchuApi, type DanchuApi, type DanchuMe } from "../src/danchu";
import { CONSENT_VERSION, danchuIdentity, MemoryWorkspaceRepo, workspaceKey } from "../src/danchuAuth";
import { MemoryOutboundRepo } from "../src/repo";
import { purgeSignature, verifyPurge, type PurgeReason, type PurgeRepo } from "../src/purge";
import { costMicros, MemoryUsageRepo, periods, usageConfigFromEnv, usageMeter, type UsageMeter } from "../src/usage";
import { afterDanchuSent, canonical, checkAction, outcomeOf, parseActionText } from "../src/danchuActions";

/* 단추 계정 연동(연동 2단계): 신원은 단추에서만, 동의 전 AI 금지, 읽기는 단추에서 */
const T_REQ = "tok-requester-aaaaaaaaaaaa";
const T_CRO = "tok-cro-bbbbbbbbbbbbbbbbbbbb";
const T_PENDING = "tok-cro-pending-cccccccccccc";
/** 단추 정식 서비스 뒤 Pro 가 아닌 기관(단추 입구가 plan_required) */
const T_FREE = "tok-cro-free-dddddddddddddddd";

/** 단추가 주는 받은 요청·회신 초안(단추 회신 구조, 부가세 별도) */
const QUOTE_BRIEF = (no: string, state: DanchuQuoteBrief["state"] = "open"): DanchuQuoteBrief => ({
  no,
  state,
  closedReason: null,
  request: {
    full: true, substance: "후보물질 A", categories: ["일반독성"], overview: [["의뢰 목적", "IND"]], common: [["시험 투여경로", "경구"]], situation: [], ask: [],
    replyBy: "2026-11-30", authorities: ["식약처"], translation: false, files: [],
    rows: [
      { seq: 1, category: "일반독성", name: "랫드 4주 반복투여독성", cond: "경구" },
      { seq: 2, category: "일반독성", name: "회복군 추가(4주)", cond: "" },
    ],
  },
  draft:
    state === "open"
      ? {
          status: "draft", prefilled: true, note: "", steps: [], pdfName: "",
          common: { validUntil: "", startDate: "", payTerms: "", substanceQty: "", reportLang: "", includes: [] },
          items: [{ seq: 1, avail: "가능", amount: "48500000", weeks: "14", source: "catalog", design: { route: "경구" } }],
        }
      : null,
});

/** 정해 둔 답을 돌려주는 가짜 AI. 받은 요청을 기록한다 */
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

const ME: Record<string, DanchuMe> = {
  [T_REQ]: { id: "11111111-1111-4111-8111-111111111111", role: "requester", name: "가", email: "a@example.test", org: null },
  [T_CRO]: { id: "22222222-2222-4222-8222-222222222222", role: "cro", name: "나", email: "b@example.test", org: { id: "33333333-3333-4333-8333-333333333333", name: "나기관", plan: "plus" } },
};

type Fake = DanchuApi & { calls: string[]; consentDown: boolean; danchuConsents: Map<string, string[]>; actReply: { status: number; body: unknown }; acted: Array<{ token: string; a: unknown }> };
function fakeApi(): Fake {
  const calls: string[] = [];
  const me = async (t: string) => {
    calls.push(`me:${t}`);
    if (t === T_PENDING) return { ok: false as const, error: "org_not_ready" as const };
    if (t === T_FREE) return { ok: false as const, error: "plan_required" as const };
    return ME[t] ? { ok: true as const, data: ME[t]! } : { ok: false as const, error: "unauthorized" as const };
  };
  const api: Fake = {
    calls,
    consentDown: false,
    danchuConsents: new Map(),
    actReply: { status: 200, body: { rfqNo: "DC-2026-0011", started: true } },
    acted: [],
    act: async (token, a) => {
      api.acted.push({ token, a });
      return api.actReply;
    },
    me,
    requesterList: async () => ({
      ok: true,
      data: [{ no: "DC-2026-0010", title: "물질 A", categories: ["독성"], status: "open", createdAt: "2026-11-10T00:00:00Z", joinBy: null, replyBy: "2026-11-20", sent: 5, joined: 3, submitted: 1, compareOpen: false, selected: false }],
    }),
    requesterDetail: async (_t, no) =>
      no === "DC-2026-0010"
        ? { ok: true, data: { request: { no, title: "물질 A", categories: [], status: "open", createdAt: "2026-11-10", joinBy: null, replyBy: null, sent: 5, joined: 3, submitted: 1, compareOpen: false, selected: false }, compare: { open: false, joined: 3, submitted: 1, replyBy: null } } }
        : { ok: false, error: "not_found" },
    croList: async () => ({ ok: true, data: [] }),
    croDetail: async () => ({ ok: false as const, error: "not_found" as const }),
    croQuote: async (t, no) => {
      calls.push(`quote:${t}:${no}`);
      if (no === "DC-2026-0142") return { ok: true as const, data: QUOTE_BRIEF(no) };
      if (no === "DC-2026-0143") return { ok: true as const, data: QUOTE_BRIEF(no, "not_joined") };
      return { ok: false as const, error: "not_found" as const };
    },
    catalog: async () => ({ ok: true as const, data: { version: "t", role: "cro" as const, actions: [] } }),
    run: async () => ({ status: 404, body: { error: "not_found" } }),
    undo: async () => ({ status: 404, body: { error: "not_found" } }),
    recordConsent: async (t: string, version: string) => {
      calls.push(`consent:${t}:${version}`);
      if (api.consentDown) return { ok: false as const, error: "unavailable" as const };
      api.danchuConsents.set(t, [...(api.danchuConsents.get(t) ?? []), version]);
      return { ok: true as const, data: { version } };
    },
    consents: async (t: string) => {
      calls.push(`consents:${t}`);
      if (api.consentDown) return { ok: false as const, error: "unavailable" as const };
      return { ok: true as const, data: (api.danchuConsents.get(t) ?? []).map((version) => ({ version, agreedAt: "2026-11-19T00:00:00Z" })) };
    },
    revokeConsent: async (t: string, version: string) => {
      calls.push(`revoke:${t}:${version}`);
      if (api.consentDown) return { ok: false as const, error: "unavailable" as const };
      api.danchuConsents.set(t, (api.danchuConsents.get(t) ?? []).filter((v) => v !== version));
      return { ok: true as const, data: { version } };
    },
  };
  return api;
}

/** 지우기 요청을 기록하고, 메모리 대화 저장소에서 그 사람이 연 대화를 지운다 */
class MemoryPurge implements PurgeRepo {
  calls: Array<{ userId: string; reason: PurgeReason }> = [];
  constructor(private workspaces: MemoryWorkspaceRepo) {}
  async purge(userId: string, reason: PurgeReason) {
    this.calls.push({ userId, reason });
    await this.workspaces.revoke(userId);
    return { conversations: 0, drafts: 0 };
  }
}

function setup(provider?: LlmProvider, opts: { usage?: UsageMeter; secret?: string; now?: () => number } = {}) {
  const api = fakeApi();
  const workspaces = new MemoryWorkspaceRepo();
  const id = danchuIdentity(api, workspaces);
  const conversations = new MemoryConversationRepo();
  const purge = new MemoryPurge(workspaces);
  const app = createApp({
    purge: { repo: purge, secret: opts.secret, now: opts.now },
    usage: opts.usage,
    auth: id.resolver,
    outbound: new MemoryOutboundRepo(),
    transport: { deliver: async () => "unknown" },
    danchu: { api, lookup: id.lookup, workspaces },
    provider,
    conversations,
    requests: new DanchuRequestDirectory(api),
  });
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { api, call, workspaces, conversations, purge, app };
}

describe("단추 신원", () => {
  it("작업 공간 열쇠: 기관은 단추 기관, 의뢰자는 단추 계정", () => {
    expect(workspaceKey(ME[T_CRO]!)).toBe("cro:33333333-3333-4333-8333-333333333333");
    expect(workspaceKey(ME[T_REQ]!)).toBe("user:11111111-1111-4111-8111-111111111111");
    expect(workspaceKey({ ...ME[T_CRO]!, org: null })).toBeNull();
  });

  it("토큰 없음·틀린 토큰은 401, 승인 전 기관은 403 org_not_ready", async () => {
    const { call } = setup();
    expect((await call("GET", "/account/me", null)).status).toBe(401);
    expect((await call("GET", "/account/me", "tok-wrong-xxxxxxxxxxxxxx")).status).toBe(401);
    const r = await call("GET", "/account/me", T_PENDING);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "org_not_ready" });
  });

  it("내 정보는 단추 값, 같은 기관 담당자 둘은 같은 작업 공간", async () => {
    const { call, api } = setup();
    const a = (await (await call("GET", "/account/me", T_CRO)).json()) as { userId: string; org: { orgId: string; kind: string; name: string }; consent: unknown };
    expect(a).toMatchObject({ userId: ME[T_CRO]!.id, org: { kind: "cro", name: "나기관" }, consent: null });
    ME["tok-cro-second-dddddddddddd"] = { ...ME[T_CRO]!, id: "44444444-4444-4444-8444-444444444444", name: "다" };
    const b = (await (await call("GET", "/account/me", "tok-cro-second-dddddddddddd")).json()) as { org: { orgId: string } };
    expect(b.org.orgId).toBe(a.org.orgId);
    // 같은 토큰은 잠깐 기억한다
    await call("GET", "/account/me", T_CRO);
    expect(api.calls.filter((c) => c === `me:${T_CRO}`)).toHaveLength(1);
  });

  it("비서 캐릭터: 처음엔 단추, 목록에 있는 값만 계정별로 저장", async () => {
    const { call } = setup();
    const before = (await (await call("GET", "/account/me", T_REQ)).json()) as { character: string };
    expect(before.character).toBe("danchu");
    expect((await call("POST", "/account/character", T_REQ, { character: "kit" })).status).toBe(400);
    expect((await call("POST", "/account/character", T_REQ, { character: "bibi", orgId: "x" })).status).toBe(400);
    expect((await call("POST", "/account/character", T_REQ, { character: "bibi" })).status).toBe(200);
    const after = (await (await call("GET", "/account/me", T_REQ)).json()) as { character: string };
    expect(after.character).toBe("bibi");
    // 다른 계정에는 번지지 않는다
    const other = (await (await call("GET", "/account/me", T_CRO)).json()) as { character: string };
    expect(other.character).toBe("danchu");
  });

  it("가입·조직·초대는 단추에서 관리", async () => {
    const { call } = setup();
    expect((await call("POST", "/account/org", T_REQ, { kind: "cro", name: "x", displayName: "x" })).status).toBe(404);
  });
});

describe("동의", () => {
  it("동의 전에는 AI 대화 403, 이번 판 동의 뒤에는 통과", async () => {
    const { call } = setup();
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).toBe(403);
    expect((await call("POST", "/account/consent", T_REQ, { version: "1999-01-01" })).status).toBe(400);
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(200);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).not.toBe(403);
    const me = (await (await call("GET", "/account/me", T_REQ)).json()) as { consent: { version: string } | null };
    expect(me.consent?.version).toBe(CONSENT_VERSION);
  });

  it("동의는 단추에도 남기고, 단추 기록이 안 되면 503·에이전트 쪽도 남기지 않음", async () => {
    const { call, api } = setup();
    api.consentDown = true;
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(503);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).toBe(403);
    api.consentDown = false;
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(200);
    expect(api.calls).toContain(`consent:${T_REQ}:${CONSENT_VERSION}`);
  });

  it("동의는 계정별: 같은 기관 다른 담당자는 따로 동의", async () => {
    const { call } = setup();
    await call("POST", "/account/consent", T_CRO, { version: CONSENT_VERSION });
    ME["tok-cro-third-eeeeeeeeeeeee"] = { ...ME[T_CRO]!, id: "55555555-5555-4555-8555-555555555555" };
    expect((await call("POST", "/v1/agent/conversations", "tok-cro-third-eeeeeeeeeeeee", {})).status).toBe(403);
  });
});

describe("단추에서 읽기", () => {
  it("의뢰자 요청함은 단추 요청을 합계로, 기관 화면은 막힘", async () => {
    const { call } = setup();
    const r = (await (await call("GET", "/v1/requests", T_REQ)).json()) as { items: Array<Record<string, unknown>> };
    expect(r.items[0]).toMatchObject({ requestId: "DC-2026-0010", status: "sent", recipients: 3, replies: 1 });
    expect((await call("GET", "/v1/lab/requests", T_REQ)).status).toBe(403);
    expect((await call("GET", "/v1/requests", T_CRO)).status).toBe(403);
  });

  it("기관 견적 읽기: 기관만, 사용자 토큰으로 단추에서, 번호 형식·없는 요청은 404", async () => {
    const { call, api } = setup();
    expect((await call("GET", "/v1/lab/requests/DC-2026-0142/quote", T_REQ)).status).toBe(403);
    expect((await call("GET", "/v1/lab/requests/x/quote", T_CRO)).status).toBe(404);
    expect((await call("GET", "/v1/lab/requests/DC-2026-9999/quote", T_CRO)).status).toBe(404);
    const ok = (await (await call("GET", "/v1/lab/requests/DC-2026-0142/quote", T_CRO)).json()) as { source: string; quote: { state: string } };
    expect(ok).toMatchObject({ source: "danchu", quote: { state: "open" } });
    expect(api.calls).toContain(`quote:${T_CRO}:DC-2026-0142`);
  });

  it("요청 하나: 번호 형식이 아니면 404, 단추가 못 찾으면 404", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/requests/../me", T_REQ)).status).toBe(404);
    expect((await call("GET", "/v1/requests/DC-2026-9999", T_REQ)).status).toBe(404);
    const ok = (await (await call("GET", "/v1/requests/DC-2026-0010", T_REQ)).json()) as { source: string; compare: { open: boolean } };
    expect(ok).toMatchObject({ source: "danchu", compare: { open: false } });
  });

  it("받는 기관 고르기는 없어졌다(단추가 보냄)", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/labs", T_REQ)).status).toBe(410);
  });
});

describe("단추 호출", () => {
  it("토큰을 Bearer로 넘기고, 단추 오류 코드를 그대로 받는다", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://danchu.example/api/agent/me");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer abc");
      return new Response(JSON.stringify({ error: "org_not_ready" }), { status: 403 });
    });
    const api = danchuApi("https://danchu.example", fetchImpl as unknown as typeof fetch);
    expect(await api.me("abc")).toEqual({ ok: false, error: "org_not_ready" });
  });

  it("연결 실패는 unavailable", async () => {
    const api = danchuApi("https://danchu.example", (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch);
    expect(await api.requesterList("abc")).toEqual({ ok: false, error: "unavailable" });
  });

  it("동작: 요청 접수는 /api/agent/requests {payload}, 나머지는 /act {action,...}", async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const api = danchuApi("https://danchu.example", fetchImpl as unknown as typeof fetch);
    await api.act("abc", { action: "create", rfqNo: null, body: { substance: "A" } });
    await api.act("abc", { action: "ask", rfqNo: "DC-2026-0001", body: { topic: "x" } });
    await api.act("abc", { action: "crm_activity", rfqNo: null, body: { kind: "call" } });
    expect(seen).toEqual([
      { url: "https://danchu.example/api/agent/requests", body: { payload: { substance: "A" } } },
      { url: "https://danchu.example/api/agent/requests/DC-2026-0001/act", body: { topic: "x", action: "ask" } },
      { url: "https://danchu.example/api/agent/crm", body: { kind: "call" } },
    ]);
  });

  it("동의 기록은 POST 본문으로 보낸다", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://danchu.example/api/agent/consent");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ version: "2026-11-17" });
      return new Response(JSON.stringify({ consent: { version: "2026-11-17" } }), { status: 200 });
    });
    const api = danchuApi("https://danchu.example", fetchImpl as unknown as typeof fetch);
    expect(await api.recordConsent("abc", "2026-11-17")).toEqual({ ok: true, data: { version: "2026-11-17" } });
  });
});

describe("단추 동작 승인 (연동 4단계)", () => {
  const consent = async (call: ReturnType<typeof setup>["call"], t: string) => call("POST", "/account/consent", t, { version: CONSENT_VERSION });
  const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

  it("본문은 키 정렬 JSON, 회사명·연락처 칸은 빼고, 역할에 없는 동작은 막는다", () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    const r = checkAction("requester", { action: "create", body: { substance: "A", company: "가회사", phone: "010", email: "x@y.z" } });
    expect(r.ok && r.text).toBe('{"action":"create","body":{"substance":"A"},"rfqNo":null}');
    expect(checkAction("cro", { action: "create", body: {} })).toEqual({ ok: false, error: "forbidden" });
    expect(checkAction("cro", { action: "select", rfqNo: "DC-2026-0001", body: {} })).toEqual({ ok: false, error: "forbidden" });
    expect(checkAction("requester", { action: "crm_activity", body: {} })).toEqual({ ok: false, error: "forbidden" });
    expect(checkAction("cro", { action: "crm_activity", body: { note: "통화" } }).ok).toBe(true);
    expect(checkAction("requester", { action: "select", rfqNo: "DC-2026-0001", body: { quoteId: "q", revision: 1 } }).ok).toBe(true);
    expect(checkAction("requester", { action: "ask", body: {} })).toEqual({ ok: false, error: "bad_request" });
    expect(checkAction("requester", { action: "create", rfqNo: "DC-2026-0001", body: {} })).toEqual({ ok: false, error: "bad_request" });
    expect(checkAction("cro", { action: "join", rfqNo: "DC-2026-0001", body: { action: "x" } })).toEqual({ ok: false, error: "bad_request" });
    expect(parseActionText("{not json")).toBeNull();
    expect([outcomeOf(200), outcomeOf(409), outcomeOf(429), outcomeOf(503)]).toEqual(["sent", "failed", "unknown", "unknown"]);
  });

  it("승인 전에는 보내지 않고, 승인한 본문 그대로 사용자 토큰으로 단추에 보낸다", async () => {
    const { call, api } = setup();
    await consent(call, T_REQ);
    const made = await json(await call("POST", "/v1/danchu/actions", T_REQ, { action: "create", body: { substance: "물질 B", company: "가회사" } }));
    expect(made.status).toBe("drafted");
    const id = made.id as string;
    expect((await call("POST", `/v1/outbound/${id}/dispatch`, T_REQ)).status).toBe(409);
    expect(api.acted).toHaveLength(0);
    // 다른 해시로는 승인이 안 된다
    expect((await call("POST", `/v1/outbound/${id}/decision`, T_REQ, { decision: "approve", epoch: 1, textHash: "0".repeat(64) })).status).toBe(409);
    expect((await call("POST", `/v1/outbound/${id}/decision`, T_REQ, { decision: "approve", epoch: 1, textHash: made.textHash })).status).toBe(200);
    const sent = await json(await call("POST", `/v1/outbound/${id}/dispatch`, T_REQ));
    expect(sent).toEqual({ status: "sent", result: { rfqNo: "DC-2026-0011", started: true } });
    expect(api.acted).toEqual([{ token: T_REQ, a: { action: "create", rfqNo: null, body: { substance: "물질 B" } } }]);
    // 한 승인에 한 번만
    expect((await call("POST", `/v1/outbound/${id}/dispatch`, T_REQ)).status).toBe(409);
    expect(api.acted).toHaveLength(1);
    const got = await json(await call("GET", `/v1/danchu/actions/${id}`, T_REQ));
    expect(got).toMatchObject({ status: "sent", result: { rfqNo: "DC-2026-0011" } });
  });

  it("단추가 거절하면 failed, 연결 실패면 unknown. 다른 조직은 못 본다", async () => {
    const { call, api } = setup();
    await consent(call, T_CRO);
    const go = async () => {
      const m = await json(await call("POST", "/v1/danchu/actions", T_CRO, { action: "join", rfqNo: "DC-2026-0010", body: {} }));
      await call("POST", `/v1/outbound/${m.id}/decision`, T_CRO, { decision: "approve", epoch: 1, textHash: m.textHash });
      return { id: m.id as string, r: await json(await call("POST", `/v1/outbound/${m.id}/dispatch`, T_CRO)) };
    };
    api.actReply = { status: 409, body: { error: "참여 결정 기한이 지났어요." } };
    const a = await go();
    expect(a.r).toEqual({ status: "failed", result: { error: "참여 결정 기한이 지났어요." } });
    api.actReply = { status: 0, body: null };
    expect((await go()).r.status).toBe("unknown");
    expect((await call("GET", `/v1/danchu/actions/${a.id}`, T_REQ)).status).toBe(404);
  });

  it("보낸 것 기록: 승인한 동작만 최근 것부터, 안쪽 동작·승인 전 초안은 빼고, 본문 원문은 주지 않는다", async () => {
    const { call, api } = setup();
    await consent(call, T_CRO);
    await consent(call, T_REQ);
    const make = async (action: string, body: Record<string, unknown> = {}) => json(await call("POST", "/v1/danchu/actions", T_CRO, { action, rfqNo: "DC-2026-0010", body }));
    const approve = async (m: Record<string, unknown>) => {
      await call("POST", `/v1/outbound/${m.id}/decision`, T_CRO, { decision: "approve", epoch: 1, textHash: m.textHash });
      return json(await call("POST", `/v1/outbound/${m.id}/dispatch`, T_CRO));
    };
    await make("join"); // 승인 전 초안
    api.actReply = { status: 200, body: { ok: true } };
    await approve(await make("crm_activity", { note: "통화" })); // 기관 안 기록
    await approve(await make("contract_report", { amount: 1000 }));
    api.actReply = { status: 409, body: { error: "회신 기한이 지났어요." } };
    await approve(await make("join"));
    api.actReply = { status: 0, body: null };
    await approve(await make("decline", { reason: "x" }));
    const got = (await json(await call("GET", "/v1/danchu/sent", T_CRO))) as { items: Array<{ action: string; status: string }> };
    expect(got.items.map((i) => [i.action, i.status])).toEqual([
      ["decline", "unknown"],
      ["join", "failed"],
      ["contract_report", "sent"],
    ]);
    expect(got.items[1]).toMatchObject({ rfqNo: "DC-2026-0010", mine: true, reason: "회신 기한이 지났어요." });
    expect(JSON.stringify(got)).not.toContain("1000");
    // 다른 조직은 보이지 않는다
    expect((await json(await call("GET", "/v1/danchu/sent", T_REQ))).items).toEqual([]);
  });
});

describe("말로 맡기는 견적 2단계", () => {
  const consent = async (call: ReturnType<typeof setup>["call"], t: string) => call("POST", "/account/consent", t, { version: CONSENT_VERSION });
  const json = async (r: Response) => (await r.json()) as Record<string, any>;
  const QUOTE_BODY = {
    items: [
      { seq: 1, avail: "가능", amount: "48500000", weeks: "14", source: "catalog", design: { route: "경구" } },
      { seq: 2, avail: "조건부 가능", amount: "32000000", weeks: "4", reason: "회복군 4주" },
    ],
    note: "회복군은 4주 운영해요.",
    common: { validUntil: "2026-12-31", startDate: "2026-12-01", payTerms: "30, 40, 30", substanceQty: "", reportLang: "국문", includes: [] },
    steps: [],
  };
  const approveAndDispatch = async (call: ReturnType<typeof setup>["call"], t: string, made: Record<string, any>) => {
    expect((await call("POST", `/v1/outbound/${made.id}/decision`, t, { decision: "approve", epoch: 1, textHash: made.textHash })).status).toBe(200);
    return json(await call("POST", `/v1/outbound/${made.id}/dispatch`, t));
  };

  it("역할·요금제 위반은 403: 의뢰자는 견적 동작, 기관은 요청 접수, Pro 아닌 기관은 plan_required", async () => {
    const { call } = setup();
    await consent(call, T_REQ);
    await consent(call, T_CRO);
    for (const action of ["quote_draft", "quote_upload", "quote_submit"]) {
      expect((await call("POST", "/v1/danchu/actions", T_REQ, { action, rfqNo: "DC-2026-0142", body: QUOTE_BODY })).status).toBe(403);
    }
    expect((await call("POST", "/v1/danchu/actions", T_CRO, { action: "create", body: { substance: "A" } })).status).toBe(403);
    // 단추가 기관 요금제로 막으면 계정 확인에서 plan_required, AI·동작 경로는 들어가지 못한다
    const me = await call("GET", "/account/me", T_FREE);
    expect(me.status).toBe(403);
    expect(await json(me)).toEqual({ error: "plan_required" });
    expect((await call("POST", "/v1/danchu/actions", T_FREE, { action: "quote_submit", rfqNo: "DC-2026-0142", body: QUOTE_BODY })).status).toBe(401);
    expect((await call("POST", "/v1/agent/conversations", T_FREE, { requestId: "DC-2026-0142" })).status).toBe(401);
  });

  it("quote_draft·quote_upload·quote_submit: 단추 회신 구조만 받고, 승인 뒤 그대로 단추 /act 로 보낸다", async () => {
    const { call, api } = setup();
    await consent(call, T_CRO);
    const upload = { name: "견적서.pdf", size: 1024, type: "application/pdf" };
    for (const [action, body] of [["quote_draft", QUOTE_BODY], ["quote_upload", upload], ["quote_submit", QUOTE_BODY]] as const) {
      const made = await json(await call("POST", "/v1/danchu/actions", T_CRO, { action, rfqNo: "DC-2026-0142", body }));
      expect(made.status).toBe("drafted");
      expect(await approveAndDispatch(call, T_CRO, made)).toMatchObject({ status: "sent" });
      expect(api.acted.at(-1)).toEqual({ token: T_CRO, a: { action, rfqNo: "DC-2026-0142", body } });
    }
    // 레거시 견적(부가세 포함 총액 줄)·쉼표 금액·요청 번호 없음은 받지 않는다
    const bad = [
      { action: "quote_submit", rfqNo: "DC-2026-0142", body: { quoteLines: [{ label: "독성", amountWon: 1 }] } },
      { action: "quote_submit", rfqNo: "DC-2026-0142", body: { ...QUOTE_BODY, items: [{ ...QUOTE_BODY.items[0], amount: "48,500,000" }] } },
      { action: "quote_submit", body: QUOTE_BODY },
      { action: "quote_upload", rfqNo: "DC-2026-0142", body: { name: "a.pdf" } },
    ];
    for (const b of bad) expect((await call("POST", "/v1/danchu/actions", T_CRO, b)).status).toBe(400);
    expect(api.acted).toHaveLength(3);
  });

  it("단추 요청 번호로 기관 견적 대화를 열고(요청서·초안은 단추에서), 다시 열면 이어 쓴다. 참여 전이면 409", async () => {
    const { call, api } = setup();
    await consent(call, T_CRO);
    const first = await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-0142" });
    expect(first.status).toBe(201);
    const conv = await json(first);
    expect(conv).toMatchObject({ role: "cro", danchuNo: "DC-2026-0142", quote: { no: "DC-2026-0142", priced: [1], submittedVersion: null } });
    expect(conv.quote.items.map((i: { seq: number }) => i.seq)).toEqual([1, 2]);
    expect(api.calls).toContain(`quote:${T_CRO}:DC-2026-0142`);
    const again = await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-0142" });
    expect(again.status).toBe(200);
    expect((await json(again)).id).toBe(conv.id);
    const notJoined = await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-0143" });
    expect(notJoined.status).toBe(409);
    expect(await json(notJoined)).toEqual({ error: "quote_not_joined" });
    expect((await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-9999" })).status).toBe(404);
    // 기관 견적 대화는 레거시 회신 장부로 보내지 않는다
    expect((await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, T_CRO, { version: 1 })).status).toBe(409);
  });

  it("턴: 모델에는 견적 도구와 받은 요청·초안(금액 숫자 없음)만, update_quote 는 금액 없이 반영하고 금액 칸이 든 호출은 버린다", async () => {
    const provider = new FakeProvider([
      {
        text: "회복군은 조건부로 적었어요.",
        toolCalls: [{ id: "t1", name: "update_quote", input: { items: [{ seq: 2, avail: "조건부 가능", weeks: "4", reason: "회복군 4주 운영" }], common: { startDate: "2026-12-01" } } }],
      },
      { text: "금액도 넣었어요.", toolCalls: [{ id: "t2", name: "update_quote", input: { items: [{ seq: 1, amount: "1" }] } }] },
    ]);
    const { call } = setup(provider);
    await consent(call, T_CRO);
    const conv = await json(await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-0142" }));
    const sse = await (await call("POST", `/v1/agent/conversations/${conv.id}/turn`, T_CRO, { text: "회복군은 4주로 할 수 있어요. 착수는 12월 1일." })).text();
    expect(sse).toContain("event: quote");
    const req = provider.calls[0]!;
    expect(req.system).toBe(CRO_DANCHU_SYSTEM);
    expect(req.tools?.map((t) => t.name)).toEqual(["summarize_request", "update_quote"]);
    const last = String(req.messages.at(-1)?.content);
    expect(last).toContain("<견적 초안>");
    expect(last).toContain("2. 회복군 추가(4주) | 가능 여부: 미정");
    expect(last).not.toMatch(/48500000|48,500,000/);
    const after = await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_CRO));
    expect(after.quote.items[1]).toMatchObject({ seq: 2, avail: "조건부 가능", weeks: "4", reason: "회복군 4주 운영", amount: "" });
    expect(after.quote.common.startDate).toBe("2026-12-01");
    expect(after.quote.version).toBe(2);
    // 금액 칸이 든 도구 호출은 통째로 버린다(스키마에 금액이 없다)
    const sse2 = await (await call("POST", `/v1/agent/conversations/${conv.id}/turn`, T_CRO, { text: "금액도 넣어 줘" })).text();
    expect(sse2).toContain("tool_rejected");
    const after2 = await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_CRO));
    expect(after2.quote.items[0].amount).toBe("48500000");
    expect(after2.quote.version).toBe(2);
  });

  it("승인 뒤 상태: 견적 제출이 단추에 들어가면 그 대화에 제출한 판을 남긴다. 거절되면 그대로, 다른 요청·조직 대화는 붙이지 못한다", async () => {
    const { call, api } = setup();
    await consent(call, T_CRO);
    await consent(call, T_REQ);
    const conv = await json(await call("POST", "/v1/agent/conversations", T_CRO, { requestId: "DC-2026-0142" }));
    const submit = (extra: Record<string, unknown> = {}) =>
      call("POST", "/v1/danchu/actions", T_CRO, { action: "quote_submit", rfqNo: "DC-2026-0142", body: QUOTE_BODY, conversationId: conv.id, ...extra });
    // 단추가 거절하면 대화는 그대로
    api.actReply = { status: 409, body: { error: "회신 기한이 지났어요." } };
    expect((await approveAndDispatch(call, T_CRO, await json(await submit()))).status).toBe("failed");
    expect((await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_CRO))).quote.submittedVersion).toBeNull();
    // 받으면 지금 판을 제출한 판으로
    api.actReply = { status: 200, body: { ok: true } };
    expect((await approveAndDispatch(call, T_CRO, await json(await submit()))).status).toBe("sent");
    const done = await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_CRO));
    expect(done.quote.submittedVersion).toBe(done.quote.version);
    // 승인한 줄 금액(견적서 금액)을 초안에 남긴다
    expect(done.quote.items.find((it: { seq: number }) => it.seq === 2).amount).toBe("32000000");
    expect(done.quote.priced).toEqual(expect.arrayContaining([1, 2]));
    // 견적서 판(docUpdatedAt)은 받아서 단추로 그대로 넘긴다
    expect((await approveAndDispatch(call, T_CRO, await json(await submit({ body: { ...QUOTE_BODY, docUpdatedAt: "2026-11-20T00:00:00Z" } })))).status).toBe("sent");
    expect((api.acted.at(-1)!.a as { body: { docUpdatedAt?: string } }).body.docUpdatedAt).toBe("2026-11-20T00:00:00Z");
    // 대화 id 는 단추로 보내는 본문에 들어가지 않는다
    expect(JSON.stringify(api.acted.at(-1))).not.toContain(String(conv.id));
    // 다른 요청 번호로는 이 대화를 붙일 수 없고, 다른 역할(의뢰자)도 못 붙인다
    expect((await submit({ rfqNo: "DC-2026-0010" })).status).toBe(404);
    expect((await call("POST", "/v1/danchu/actions", T_REQ, { action: "create", body: { substance: "A" }, conversationId: conv.id })).status).toBe(404);
    expect((await submit({ conversationId: "not-a-uuid" })).status).toBe(400);
  });

  it("의뢰자 요청 접수가 단추에 들어가면 대화를 보낸 것으로 표시하고 단추 번호를 남긴다(요청함에 작성 중으로 다시 보이지 않게)", async () => {
    const { call } = setup();
    await consent(call, T_REQ);
    const conv = await json(await call("POST", "/v1/agent/conversations", T_REQ, {}));
    const made = await json(await call("POST", "/v1/danchu/actions", T_REQ, { action: "create", body: { substance: "물질 B" }, conversationId: conv.id }));
    expect((await approveAndDispatch(call, T_REQ, made)).status).toBe("sent");
    const after = await json(await call("GET", `/v1/agent/conversations/${conv.id}`, T_REQ));
    expect(after.danchuNo).toBe("DC-2026-0011");
  });

  it("afterDanchuSent: 접수는 본문 초안을 보낸 것으로, 임시 저장·PDF 주소는 상태를 바꾸지 않는다", () => {
    const base = {
      id: "c", orgId: "o", createdBy: "u", role: "requester" as const, mode: "request" as const, requestId: null, danchuNo: null, quote: null,
      sheet: {} as never, messages: [], question: null, summary: null, draft: { body: "본문", dropped: 0, version: 2, outboundCreated: false }, turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
    const next = afterDanchuSent(base, { action: "create", rfqNo: null, body: {} }, { rfqNo: "DC-2026-0011" });
    expect(next).toMatchObject({ danchuNo: "DC-2026-0011", draft: { outboundCreated: true, version: 2 } });
    expect(afterDanchuSent(base, { action: "create", rfqNo: null, body: {} }, { rfqNo: "../x" })?.danchuNo).toBeNull();
    expect(afterDanchuSent(base, { action: "quote_draft", rfqNo: "DC-2026-0142", body: {} }, null)).toBeNull();
    expect(afterDanchuSent(base, { action: "quote_upload", rfqNo: "DC-2026-0142", body: {} }, null)).toBeNull();
  });
});

describe("동의 철회와 지우기 (처리방침 3항)", () => {
  it("앱에서 철회: 단추에 먼저 철회, 에이전트 동의도 철회, 대화 지우기. 그 뒤 AI 대화는 403", async () => {
    const { call, api, purge } = setup();
    await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION });
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).not.toBe(403);
    const r = await call("POST", "/account/consent/revoke", T_REQ, { version: CONSENT_VERSION });
    expect(r.status).toBe(200);
    expect(api.calls).toContain(`revoke:${T_REQ}:${CONSENT_VERSION}`);
    expect(purge.calls).toEqual([{ userId: ME[T_REQ]!.id, reason: "consent_revoked" }]);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).toBe(403);
  });

  it("단추 철회가 안 되면 503, 에이전트 쪽은 그대로(다시 시도)", async () => {
    const { call, api, purge } = setup();
    await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION });
    api.consentDown = true;
    expect((await call("POST", "/account/consent/revoke", T_REQ, { version: CONSENT_VERSION })).status).toBe(503);
    expect(purge.calls).toHaveLength(0);
    expect((await call("POST", "/account/consent/revoke", T_REQ, { version: "1999-01-01" })).status).toBe(400);
  });

  it("단추 웹에서 철회했으면 다음 AI 호출에서 알아채고 지운 뒤 403. 단추 장애면 에이전트 사본으로 판단", async () => {
    const { call, api, purge } = setup();
    await call("POST", "/account/consent", T_CRO, { version: CONSENT_VERSION });
    api.consentDown = true;
    expect((await call("POST", "/v1/agent/conversations", T_CRO, { mode: "ask" })).status).not.toBe(403);
    api.consentDown = false;
    api.danchuConsents.set(T_CRO, []);
    const r = await call("POST", "/v1/agent/conversations", T_CRO, { mode: "ask" });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "consent_required" });
    expect(purge.calls).toEqual([{ userId: ME[T_CRO]!.id, reason: "consent_revoked" }]);
  });

  it("단추 동의 확인은 계정별로 잠깐 기억한다", async () => {
    const { call, api } = setup();
    await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION });
    await call("GET", "/v1/agent/asks", T_REQ);
    await call("GET", "/v1/agent/asks", T_REQ);
    expect(api.calls.filter((c) => c === `consents:${T_REQ}`)).toHaveLength(1);
  });
});

describe("단추 → 에이전트 삭제 요청 (서명)", () => {
  const SECRET = "test-secret-0123456789";
  const NOW = 1_763_500_000_000;
  const userId = "11111111-1111-4111-8111-111111111111";
  function signed(body: string, ts = String(Math.floor(NOW / 1000)), secret = SECRET) {
    return { "content-type": "application/json", "x-danchu-timestamp": ts, "x-danchu-signature": purgeSignature(secret, ts, body) };
  }

  it("단추와 같은 서명 규칙: HMAC-SHA256(비밀값, '시각.본문') 16진수", () => {
    // 단추 lib/agent-purge.ts purgeSignature 와 같은 값이어야 한다
    expect(purgeSignature("k", "1700000000", '{"a":1}')).toBe(createHmac("sha256", "k").update('1700000000.{"a":1}').digest("hex"));
    expect(verifyPurge("k", "1700000000", purgeSignature("k", "1700000000", "x"), "x", 1700000100)).toBe(true);
    expect(verifyPurge("k", "1700000000", purgeSignature("k", "1700000000", "x"), "x", 1700000400)).toBe(false);
    expect(verifyPurge("k", "1700000000", purgeSignature("other", "1700000000", "x"), "x", 1700000000)).toBe(false);
    expect(verifyPurge("k", "1700000000", purgeSignature("k", "1700000000", "x"), "y", 1700000000)).toBe(false);
  });

  it("맞는 서명이면 지우고, 틀린 서명·오래된 요청·비밀값 미설정은 거절", async () => {
    const { app, purge } = setup(undefined, { secret: SECRET, now: () => NOW });
    const body = JSON.stringify({ userId, reason: "account_deleted" });
    const ok = await app.request("/internal/danchu/purge", { method: "POST", headers: signed(body), body });
    expect(ok.status).toBe(200);
    expect(purge.calls).toEqual([{ userId, reason: "account_deleted" }]);
    // 같은 요청을 다시 받아도 된다(여러 번 받아도 결과가 같다)
    expect((await app.request("/internal/danchu/purge", { method: "POST", headers: signed(body), body })).status).toBe(200);

    expect((await app.request("/internal/danchu/purge", { method: "POST", headers: signed(body, undefined, "wrong-secret-xxxxxxxx"), body })).status).toBe(401);
    expect((await app.request("/internal/danchu/purge", { method: "POST", headers: signed(body, String(Math.floor(NOW / 1000) - 600)), body })).status).toBe(401);
    expect((await app.request("/internal/danchu/purge", { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(401);
    const bad = JSON.stringify({ userId: "x", reason: "account_deleted" });
    expect((await app.request("/internal/danchu/purge", { method: "POST", headers: signed(bad), body: bad })).status).toBe(400);
    expect(purge.calls).toHaveLength(2);

    const off = setup(undefined, { secret: undefined, now: () => NOW });
    expect((await off.app.request("/internal/danchu/purge", { method: "POST", headers: signed(body), body })).status).toBe(503);
  });
});

describe("AI 이용량 상한", () => {
  it("비용은 코드가 단가로 계산(백만분의 1달러, 올림). 기간은 한국 시간", () => {
    const { prices } = usageConfigFromEnv({});
    expect(costMicros({ inputTokens: 1_000_000, outputTokens: 0 }, prices)).toBe(3_000_000);
    expect(costMicros({ inputTokens: 0, outputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 1000 }, prices)).toBe(15_000 + 300 + 3_750);
    expect(periods(new Date("2026-11-30T15:30:00Z"))).toEqual({ day: "2026-12-01", month: "2026-12" });
  });

  it("환경 변수로 단가·상한을 바꾸고, off 는 그 상한을 끈다. 이상한 값은 시작할 때 막는다", () => {
    const c = usageConfigFromEnv({ AGENT_CAP_USER_DAY_USD: "0.5", AGENT_CAP_ALL_MONTH_USD: "off", AGENT_PRICE_OUTPUT_PER_MTOK: "75" });
    expect(c.caps).toEqual({ userDay: 500_000, orgMonth: 30_000_000, allMonth: null });
    expect(c.prices.output).toBe(75);
    expect(() => usageConfigFromEnv({ AGENT_CAP_ORG_MONTH_USD: "abc" })).toThrow();
  });

  it("계정 하루 상한을 넘으면 다음 턴은 429 usage_limit(user_day), 모델은 부르지 않는다. 다른 계정은 그대로", async () => {
    const repo = new MemoryUsageRepo();
    // 한 턴(입력 1·출력 1 토큰)이 상한을 넘도록 아주 낮게
    const meter = usageMeter(repo, { prices: { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 }, caps: { userDay: 1_000_000, orgMonth: null, allMonth: null } });
    const provider = new FakeProvider([{ text: "네" }, { text: "네" }]);
    const { call } = setup(provider, { usage: meter });
    await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION });
    const conv = (await (await call("POST", "/v1/agent/conversations", T_REQ, { mode: "ask" })).json()) as { id: string };
    const first = await call("POST", `/v1/agent/conversations/${conv.id}/turn`, T_REQ, { text: "4주 반복투여 몇 마리?" });
    expect(first.status).toBe(200);
    await first.text();
    const second = await call("POST", `/v1/agent/conversations/${conv.id}/turn`, T_REQ, { text: "회복군은?" });
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "usage_limit", scope: "user_day" });
    expect(provider.calls).toHaveLength(1);

    await call("POST", "/account/consent", T_CRO, { version: CONSENT_VERSION });
    const other = (await (await call("POST", "/v1/agent/conversations", T_CRO, { mode: "ask" })).json()) as { id: string };
    expect((await call("POST", `/v1/agent/conversations/${other.id}/turn`, T_CRO, { text: "질문" })).status).toBe(200);
  });

  it("조직 한 달·전체 한 달 상한도 같은 방식", async () => {
    const repo = new MemoryUsageRepo();
    const cfg = { prices: { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }, caps: { userDay: null, orgMonth: 2_000_000, allMonth: 3_000_000 } };
    const meter = usageMeter(repo, cfg);
    const a = { userId: "a", orgId: "11111111-1111-4111-8111-111111111111", role: "cro" as const };
    const b = { userId: "b", orgId: "22222222-2222-4222-8222-222222222222", role: "cro" as const };
    const now = new Date("2026-11-19T00:00:00Z");
    await meter.record(a, { inputTokens: 2, outputTokens: 0 }, now);
    expect(await meter.over(a, now)).toBe("org_month");
    expect(await meter.over(b, now)).toBeNull();
    await meter.record(b, { inputTokens: 1, outputTokens: 0 }, now);
    expect(await meter.over(b, now)).toBe("all_month");
    // 다음 달에는 다시 열린다
    expect(await meter.over(a, new Date("2026-12-05T00:00:00Z"))).toBeNull();
  });
});
