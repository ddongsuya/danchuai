import { randomUUID } from "node:crypto";
import {
  amountBlock,
  EMPTY_SHEET,
  missingFields,
  quoteContext,
  quoteDraftFromBrief,
  redactContacts,
  retrievalQuery,
  sheetContext,
  type AgentMessage,
  type LlmProvider,
  type OutboundDraft,
} from "@danchuai/core";
import { citedSources, contextBlock, retrieve } from "@danchuai/knowledge";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Session } from "../auth";
import { sha256 } from "../hash";
import type { MarketRepo } from "../db/market";
import type { OutboundRepo } from "../repo";
import type { AgentEvent } from "./interpret";
import { MarkupFilter, runToolTurn, stripToolMarkup } from "./repair";
import { applyAssistCalls, prepareAssist, type AssistDeps } from "../danchuAssist";
import { BEARER } from "../danchuAuth";
import { ASK_SYSTEM, CRO_ASSIST_SYSTEM, CRO_DANCHU_SYSTEM, SYSTEM } from "./prompts";
import { toolsFor } from "./tools";
import { nextMonthStart, type UsageMeter } from "../usage";
import type { Conversation, ConversationRepo, DanchuLookupError, RequestDirectory, StoredMessage } from "./store";

/** 단추 요청 번호 */
const RFQ_NO = /^DC-\d{4}-\d{4,6}$/;
const LOOKUP_STATUS: Record<DanchuLookupError, 401 | 403 | 404 | 429 | 503> = {
  unauthorized: 401,
  forbidden: 403,
  org_not_ready: 403,
  plan_required: 403,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
};

export const LIMITS = {
  textChars: 2000,
  // 회의 녹음 전사본(약 두 시간 분량). 기관 비서 턴에만 받는다
  transcriptChars: 60_000,
  turns: 40,
  historyMessages: 20,
  // 답 길이 상한(출력 토큰). 한국어는 토큰을 많이 쓰고, 요청 대화는 요청서 채우기 도구 호출도 이 안에서 쓴다.
  // 1200·1600일 때 긴 답이 "답이 길어 중간에 끊겼어요"로 잘렸다(2026-11-17 사용자 시험). 쓴 만큼만 과금된다.
  maxTokens: 4096,
  askMaxTokens: 4096,
  recipients: 10,
} as const;

export interface AgentDeps {
  provider?: LlmProvider;
  conversations: ConversationRepo;
  requests: RequestDirectory;
  outbound: OutboundRepo;
  /** 있으면 받는 곳이 가입 기관인지 확인하고, 의뢰자 요청 행을 만든다 */
  market?: MarketRepo;
  /** AI 이용량 상한(계정 하루·조직 한 달·전체 한 달). 넘으면 429 usage_limit */
  usage?: UsageMeter;
  /** 단추 연동 모드의 기관 비서(액션 목록·바로 실행). 없으면 비서 대화는 열지 않는다 */
  assist?: AssistDeps;
}

type Env = { Variables: { session: Session } };

const CreateBody = z
  .object({ requestId: z.string().min(1).max(64).optional(), mode: z.enum(["request", "ask", "assist"]).optional() })
  .strict();
const TurnBody = z
  .object({
    text: z.string().trim().min(1).max(LIMITS.textChars),
    /** 회의 녹음 전사본(기관 비서만). 이 턴에만 모델에 넘기고 대화 기록에는 남기지 않는다 */
    transcript: z.string().trim().min(1).max(LIMITS.transcriptChars).optional(),
  })
  .strict();
const OutboundBody = z
  .object({
    version: z.number().int().positive(),
    recipientOrgIds: z.array(z.string().uuid()).min(1).max(LIMITS.recipients).optional(),
    // 기관 회신: 사람이 넣은 항목 금액(원 단위 정수). 합계는 서버가 계산한다.
    quoteLines: z
      .array(z.object({ label: z.string().min(1).max(60), amountWon: z.number().int().nonnegative().max(1e12) }).strict())
      .max(30)
      .optional(),
    // 기관 회신: 사람이 넣은 소요 기간(주)
    durationWeeks: z.number().int().min(1).max(520).optional(),
  })
  .strict();

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** 화면에 돌려줄 대화 상태. 모델 기록(messages)은 사용자·답 글만 보낸다. */
const view = (c: Conversation) => ({
  id: c.id,
  role: c.role,
  mode: c.mode,
  sheet: c.sheet,
  missing: missingFields(c.sheet),
  question: c.question,
  summary: c.summary,
  draft: c.draft && { body: c.draft.body, dropped: c.draft.dropped, version: c.draft.version, sent: c.draft.outboundCreated },
  // 단추 연동: 다루는 단추 요청 번호와 기관 견적 초안(금액은 단추 계산값, 사람에게만 보인다)
  danchuNo: c.danchuNo,
  quote: c.quote,
  turns: c.turns,
  // 이어서 보기용. 같은 조직의 대화 기록만 돌려준다(load가 조직을 확인한다).
  messages: c.messages
    .map((m) => ({ role: m.role, text: m.role === "assistant" ? stripNotes(m.content) : m.content, ...(m.sources?.length ? { sources: m.sources } : {}) }))
    .filter((m) => m.text),
});

/**
 * 공급사 오류를 로그에 남길 값. 오류 이름·상태·종류, 그리고 요청 모양 오류(400)일 때만 공급사의 짧은 사유 문장.
 * 사유 문장은 요청 구조에 대한 검사 결과다(예: "tool_choice may only be specified while providing tools"). 따옴표 안의 값은 지운다.
 */
export function providerErrorInfo(err: unknown): (string | number)[] {
  const e = err as { status?: unknown; error?: { error?: { type?: unknown; message?: unknown } } };
  const status = typeof e.status === "number" ? e.status : "";
  const type = typeof e.error?.error?.type === "string" ? e.error.error.type : "";
  const msg = status === 400 && typeof e.error?.error?.message === "string" ? e.error.error.message.replace(/(["'`]).*?\1/g, "$1…$1").slice(0, 160) : "";
  return [err instanceof Error ? err.name : "unknown", status, type, msg];
}

/** 공급사 계정의 사용 한도·크레딧이 다 됐는지(서비스 운영 쪽 한도). 앱에는 ai_quota 로 알린다 */
export function providerErrorCode(err: unknown): "ai_quota" | "provider_error" {
  const e = err as { status?: unknown; error?: { error?: { type?: unknown; message?: unknown } } };
  const msg = typeof e.error?.error?.message === "string" ? e.error.error.message : "";
  const quota = (e.status === 400 && /usage limit|credit balance/i.test(msg)) || e.status === 402 || e.error?.error?.type === "billing_error";
  return quota ? "ai_quota" : "provider_error";
}

/** 기록용 표시("(요청서 갱신)" 등)는 모델 맥락에만 두고 화면에는 보이지 않는다. */
const stripNotes = (t: string) =>
  t
    .split("\n")
    .filter((l) => !/^\((요청서 갱신|요청 요약|본문 초안|견적 초안 갱신|응답 없음|질문: .*|실행: .*|실행 안 함: .*|찾기: .*)\)$/.test(l.trim()))
    .join("\n")
    .trim();

/** 최근 기록만 보내고, 첫 메시지는 사용자 글이 되도록 맞춘다. */
function windowed(messages: StoredMessage[]): AgentMessage[] {
  let w = messages.slice(-LIMITS.historyMessages);
  while (w.length && w[0]!.role !== "user") w = w.slice(1);
  // 저장용 칸(출처)은 모델에 보내지 않는다
  return w.map(({ role, content }) => ({ role, content }));
}

export function agentRoutes(deps: AgentDeps) {
  const app = new Hono<Env>();

  const load = async (id: string, s: Session) => {
    const c = await deps.conversations.get(id);
    // 다른 조직의 대화는 있는지 없는지도 알려 주지 않는다
    return c && c.orgId === s.orgId ? c : null;
  };

  app.post("/conversations", async (c) => {
    const s = c.get("session");
    const parsed = CreateBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const mode = parsed.data.mode ?? "request";
    let sheet = { ...EMPTY_SHEET };
    let requestId: string | null = null;
    let danchuNo: string | null = null;
    let quote: Conversation["quote"] = null;
    // 질문 대화는 요청과 묶이지 않는다(의뢰자·기관 모두 바로 연다).
    if (mode === "ask" && parsed.data.requestId) return c.json({ error: "bad_request" }, 400);
    // 기관 비서: 기관 담당자만, 단추 연동 모드에서만. 이 사용자의 비서 대화가 있으면 이어서 쓴다
    if (mode === "assist") {
      if (parsed.data.requestId) return c.json({ error: "bad_request" }, 400);
      if (s.role !== "cro") return c.json({ error: "forbidden" }, 403);
      if (!deps.assist) return c.json({ error: "not_configured" }, 404);
      const prev = await deps.conversations.latestAssist(s.orgId, s.userId);
      if (prev && prev.turns < LIMITS.turns) return c.json(view(prev));
    }
    if (mode === "request" && s.role === "cro") {
      if (!parsed.data.requestId) return c.json({ error: "bad_request" }, 400);
      if (RFQ_NO.test(parsed.data.requestId)) {
        // 단추 연동 기관 견적 대화(말로 맡기는 견적 2단계): 단추에서 요청서 전체와 회신 초안을 사용자 토큰으로 읽는다
        if (!deps.requests.forDanchu) return c.json({ error: "not_found" }, 404);
        const r = await deps.requests.forDanchu(parsed.data.requestId, c.req.header("authorization"));
        if (!r.ok) return c.json({ error: r.error }, LOOKUP_STATUS[r.error]);
        // 참여한 뒤, 회신이 열려 있을 때만 견적을 쓴다. 참여·불참은 받은 요청 화면에서 한다
        if (r.brief.state !== "open") return c.json({ error: `quote_${r.brief.state}` }, 409);
        // 이 사용자가 이 요청으로 연 대화가 있으면 이어서 쓴다(대화로 고친 초안을 잃지 않게)
        const prev = await deps.conversations.findDanchu(s.orgId, s.userId, r.brief.no);
        if (prev) return c.json(view(prev));
        danchuNo = r.brief.no;
        quote = quoteDraftFromBrief(r.brief);
      } else {
        const r = await deps.requests.forCro(parsed.data.requestId, s.orgId);
        if (!r) return c.json({ error: "not_found" }, 404);
        sheet = r.sheet;
        requestId = parsed.data.requestId;
      }
    }
    const conv: Conversation = {
      id: randomUUID(),
      orgId: s.orgId,
      createdBy: s.userId,
      role: s.role,
      mode,
      requestId,
      danchuNo,
      quote,
      sheet,
      messages: [],
      question: null,
      summary: null,
      draft: null,
      turns: 0,
      usage: { ...ZERO_USAGE },
    };
    await deps.conversations.create(conv);
    return c.json(view(conv), 201);
  });

  // 이번 달 사용량(설정 시트). 조직 한 달 상한 대비 비율과 다시 0이 되는 날만 준다(금액은 주지 않는다)
  app.get("/usage", async (c) => {
    const share = deps.usage ? await deps.usage.monthShare(c.get("session")) : null;
    return c.json({ percent: share, resetsOn: nextMonthStart(new Date()) });
  });

  // 지난 질문(이 사용자가 연 질문 대화, 최근 순)
  app.get("/asks", async (c) => {
    const s = c.get("session");
    return c.json({ items: await deps.conversations.listAsks(s.orgId, s.userId, 30) });
  });

  app.get("/conversations/:id", async (c) => {
    const conv = await load(c.req.param("id"), c.get("session"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(view(conv));
  });

  app.post("/conversations/:id/turn", async (c) => {
    const s = c.get("session");
    const found = await load(c.req.param("id"), s);
    if (!found) return c.json({ error: "not_found" }, 404);
    const parsed = TurnBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    // 녹음 전사본은 기관 비서 대화에서만 받는다
    if (parsed.data.transcript && found.mode !== "assist") return c.json({ error: "bad_request" }, 400);
    const provider = deps.provider;
    if (!provider) return c.json({ error: "agent_unavailable" }, 503);
    if (found.turns >= LIMITS.turns) return c.json({ error: "turn_limit" }, 429);
    const over = deps.usage ? await deps.usage.over(s) : null;
    if (over) return c.json({ error: "usage_limit", scope: over }, 429);
    if (!(await deps.conversations.lockTurn(found.id, s.orgId))) return c.json({ error: "turn_in_progress" }, 409);
    // 잠근 뒤 다시 읽는다. 바로 앞 턴이 막 저장했을 수 있다.
    const conv = await load(found.id, s);
    if (!conv || conv.turns >= LIMITS.turns) {
      await deps.conversations.unlockTurn(found.id);
      return conv ? c.json({ error: "turn_limit" }, 429) : c.json({ error: "not_found" }, 404);
    }

    // 선정 전 신원 보호: 모델에 가기 전에 연락처를 지운다.
    const userText = redactContacts(parsed.data.text);
    const history = windowed(conv.messages);

    if (conv.mode === "assist") return assistTurn(c, provider, conv, s, userText, history, parsed.data.transcript ? redactContacts(parsed.data.transcript) : null);
    // 질문과 관련된 가이드라인 원문 조각. 기록에는 남기지 않고 이번 턴에만 붙인다.
    // 의뢰자 대화는 상황 칸을 검색어에 더해 짧은 답("3개월이요")에도 맞는 원문 조각을 찾는다.
    const ask = conv.mode === "ask";
    // 단추 연동 기관 견적 대화: 요청서 칸(sheet) 대신 받은 요청과 견적 초안을 붙인다(금액 숫자는 넣지 않는다)
    const danchuQuote = conv.role === "cro" && conv.danchuNo && conv.quote ? conv.quote : null;
    const evidence = retrieve(
      ask ? userText : danchuQuote ? `${userText} ${danchuQuote.request.categories.join(" ")} ${danchuQuote.rows.map((r) => r.name).join(" ")}` : retrievalQuery(userText, conv.sheet),
    );
    const stateBlock = danchuQuote ? quoteContext(danchuQuote) : sheetContext(conv.sheet);
    const messages: AgentMessage[] = [
      ...history,
      // 바뀌는 요청서 상태·근거는 맨 끝에 붙여 앞부분 캐시를 지킨다. 질문 대화에는 요청서가 없다.
      {
        role: "user",
        content: ask ? `${userText}\n\n${contextBlock(evidence)}` : `${userText}\n\n${stateBlock}\n\n${contextBlock(evidence)}`,
      },
    ];

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      let writes: Promise<void> = Promise.resolve();
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        await send("step", { label: ask ? "원문 찾기" : danchuQuote ? "견적 초안 확인" : conv.role === "cro" ? "요청 확인" : "요청서 확인" });
        const onText = (delta: string) => {
          writes = writes.then(() => send("text", { delta }));
        };
        // 질문 대화에는 도구가 없다(요청서·본문을 만들지 않는다).
        // 도구가 있는 대화는 태그가 섞인 글을 거르고, 질문 없이 끝난 의뢰자 턴은 한 번 더 부른다(repair.ts).
        const result = ask
          ? await provider
              .complete({ system: ASK_SYSTEM, messages, maxTokens: LIMITS.askMaxTokens, signal: abort.signal, onText })
              .then((r) => ({ ...r, conv, events: [] as AgentEvent[], notes: [] as string[] }))
          : await runToolTurn({
              provider,
              conv,
              request: { system: danchuQuote ? CRO_DANCHU_SYSTEM : SYSTEM[conv.role], messages, tools: toolsFor(conv), maxTokens: LIMITS.maxTokens, signal: abort.signal },
              onText,
              evidence,
            });
        await writes;

        const { conv: next, events, notes } = result;
        for (const e of events) await send(e.event, e.data);
        // 답이 인용한 원문만 출처로 보낸다(앱이 원문 링크로 보여 준다).
        const sources = citedSources(result.text, evidence.sources).map(({ doc, name, section, url, version }) => ({ doc, name, section, url, version }));
        if (sources.length) await send("sources", { items: sources });

        const reply = [result.text.trim(), ...notes].filter(Boolean).join("\n") || "(응답 없음)";
        const saved: Conversation = {
          ...next,
          messages: [...conv.messages, { role: "user", content: userText }, { role: "assistant", content: reply, ...(sources.length ? { sources } : {}) }],
          turns: conv.turns + 1,
          usage: {
            inputTokens: conv.usage.inputTokens + result.usage.inputTokens,
            outputTokens: conv.usage.outputTokens + result.usage.outputTokens,
            cacheReadTokens: conv.usage.cacheReadTokens + (result.usage.cacheReadTokens ?? 0),
            cacheWriteTokens: conv.usage.cacheWriteTokens + (result.usage.cacheWriteTokens ?? 0),
          },
        };
        await deps.conversations.save(saved);
        // 이용량은 대화 저장과 따로 더한다. 실패해도 답은 그대로 돌려준다(숫자만 남는 기록)
        if (deps.usage) await deps.usage.record(s, result.usage).catch((e) => console.error("usage_record_failed", e instanceof Error ? e.name : "unknown"));

        if (result.stop !== "done") await send("error", { code: result.stop });
        await send("done", { usage: result.usage, turns: saved.turns });
      } catch (err) {
        // 본문·프롬프트는 남기지 않는다. 오류 종류만.
        console.error("agent_turn_failed", ...providerErrorInfo(err));
        await writes.catch(() => undefined);
        await send("error", { code: providerErrorCode(err) });
      } finally {
        await deps.conversations.unlockTurn(conv.id).catch(() => undefined);
      }
    });
  });

  /**
   * 기관 비서 한 턴: 단추에서 액션 목록·브리핑·이번 주 보고를 읽어 맥락과 도구를 만들고, 모델이 부른 바로 실행 액션을 단추에서 실행한다.
   * 밖으로 나가는 액션은 도구에 없다. 실행 결과는 action 이벤트(실행 카드, 되돌리기)로 보낸다.
   */
  async function assistTurn(c: Context<Env>, provider: LlmProvider, conv: Conversation, s: Session, userText: string, history: AgentMessage[], transcript: string | null = null) {
    const a = deps.assist;
    const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
    const prep = a && token ? await prepareAssist(a, token, s.orgId) : ({ ok: false, error: "danchu_unavailable" } as const);
    if (!a || !prep.ok) {
      await deps.conversations.unlockTurn(conv.id);
      return c.json({ error: prep.ok ? "danchu_unavailable" : prep.error }, prep.ok || prep.error === "danchu_unavailable" ? 503 : 403);
    }
    // 녹음 전사본은 이번 턴에만 붙인다. 대화 기록에는 사용자 글만 남는다
    const heard = transcript ? `\n\n<회의 전사본>\n${transcript.replace(/<\/?회의 전사본>/g, "")}\n</회의 전사본>` : "";
    const messages: AgentMessage[] = [...history, { role: "user", content: `${userText}${heard}\n\n${prep.context}` }];
    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      let writes: Promise<void> = Promise.resolve();
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        await send("step", { label: "브리핑 확인" });
        const filter = new MarkupFilter();
        const onText = (delta: string) => {
          const out = filter.push(delta);
          if (out) writes = writes.then(() => send("text", { delta: out }));
        };
        const result = await provider.complete({ system: CRO_ASSIST_SYSTEM, messages, tools: prep.tools, maxTokens: LIMITS.maxTokens, signal: abort.signal, onText });
        const rest = filter.flush();
        if (rest) writes = writes.then(() => send("text", { delta: rest }));
        await writes;
        const text = stripToolMarkup(result.text.trim());
        // 끊긴 답의 도구 호출은 실행하지 않는다
        const calls = result.stop === "done" ? result.toolCalls : [];
        if (calls.length) await send("step", { label: "단추에 반영" });
        const applied = await applyAssistCalls(a, s, token, conv.id, calls, prep);
        for (const e of applied.events) await send("action", e);
        for (const l of applied.lookups) await send("lookup", l);
        const reply = [text, ...applied.notes].filter(Boolean).join("\n") || "(응답 없음)";
        const saved: Conversation = {
          ...conv,
          messages: [...conv.messages, { role: "user", content: userText }, { role: "assistant", content: reply }],
          turns: conv.turns + 1,
          usage: {
            inputTokens: conv.usage.inputTokens + result.usage.inputTokens,
            outputTokens: conv.usage.outputTokens + result.usage.outputTokens,
            cacheReadTokens: conv.usage.cacheReadTokens + (result.usage.cacheReadTokens ?? 0),
            cacheWriteTokens: conv.usage.cacheWriteTokens + (result.usage.cacheWriteTokens ?? 0),
          },
        };
        await deps.conversations.save(saved);
        if (deps.usage) await deps.usage.record(s, result.usage).catch((e) => console.error("usage_record_failed", e instanceof Error ? e.name : "unknown"));
        if (result.stop !== "done") await send("error", { code: result.stop });
        await send("done", { usage: result.usage, turns: saved.turns });
      } catch (err) {
        console.error("assist_turn_failed", ...providerErrorInfo(err));
        await writes.catch(() => undefined);
        await send("error", { code: providerErrorCode(err) });
      } finally {
        await deps.conversations.unlockTurn(conv.id).catch(() => undefined);
      }
    });
  }

  // 보내기 초안 만들기. 본문은 서버가 가진 점검 통과 본문만 쓰고, 앱이 보낸 본문은 받지 않는다.
  app.post("/conversations/:id/outbound", async (c) => {
    const s = c.get("session");
    const conv = await load(c.req.param("id"), s);
    if (!conv) return c.json({ error: "not_found" }, 404);
    const parsed = OutboundBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    if (conv.mode === "ask" || conv.mode === "assist") return c.json({ error: "no_draft" }, 409);
    // 단추 연동 기관 견적은 이 장부 경로가 아니라 단추 동작(/v1/danchu/actions quote_submit)으로 제출한다
    if (conv.danchuNo && conv.role === "cro") return c.json({ error: "use_danchu_actions" }, 409);
    const d = conv.draft;
    if (!d) return c.json({ error: "no_draft" }, 409);
    // 사람이 본 판이 지금 판과 같아야 하고, 한 판에서 한 번만 만든다.
    if (parsed.data.version !== d.version) return c.json({ error: "stale_version" }, 409);
    if (d.outboundCreated) return c.json({ error: "already_created" }, 409);

    let recipients: string[];
    let text = d.body;
    let kind: OutboundDraft["kind"];
    let requestId: string | null = conv.requestId;
    if (conv.role === "requester") {
      if (!parsed.data.recipientOrgIds || parsed.data.quoteLines) return c.json({ error: "bad_request" }, 400);
      if (parsed.data.durationWeeks !== undefined) return c.json({ error: "bad_request" }, 400);
      if (parsed.data.recipientOrgIds.includes(s.orgId)) return c.json({ error: "bad_request" }, 400);
      recipients = [...new Set(parsed.data.recipientOrgIds)];
      kind = "request";
      if (deps.market) {
        if (!(await deps.market.areLabs(recipients))) return c.json({ error: "unknown_recipient" }, 400);
        const r = await deps.market.ensureRequest({ conversationId: conv.id, orgId: s.orgId, sheet: conv.sheet });
        if (r === "closed") return c.json({ error: "request_closed" }, 409);
        requestId = r;
      }
    } else {
      if (parsed.data.recipientOrgIds) return c.json({ error: "bad_request" }, 400);
      const r = conv.requestId ? await deps.requests.forCro(conv.requestId, s.orgId) : null;
      if (!r) return c.json({ error: "not_found" }, 404);
      if (deps.market && !(await deps.market.canReply(conv.requestId!, s.orgId))) return c.json({ error: "request_closed" }, 409);
      recipients = [r.requesterOrgId];
      kind = "reply";
      // 금액 줄은 코드가 계산해 붙인다.
      if (parsed.data.quoteLines?.length) text = `${d.body}\n\n${amountBlock(parsed.data.quoteLines)}`;
    }

    const drafts: OutboundDraft[] = recipients.map((counterpartyOrgId) => ({
      id: randomUUID(),
      orgId: s.orgId,
      counterpartyOrgId,
      kind,
      text,
      textHash: sha256(text),
      epoch: 1,
      status: "drafted",
    }));
    // 같은 판을 두 요청이 동시에 만들어도 저장소가 하나만 받는다.
    const source = {
      conversationId: conv.id,
      version: d.version,
      quoteLines: kind === "reply" ? parsed.data.quoteLines ?? [] : undefined,
      durationWeeks: kind === "reply" ? parsed.data.durationWeeks : undefined,
    };
    if (!(await deps.outbound.insertBatch(drafts, source))) {
      return c.json({ error: "already_created" }, 409);
    }
    await deps.conversations.save({ ...conv, draft: { ...d, outboundCreated: true } });
    return c.json(
      {
        requestId,
        outbound: drafts.map((od) => ({ id: od.id, counterpartyOrgId: od.counterpartyOrgId, text: od.text, epoch: od.epoch, textHash: od.textHash })),
      },
      201,
    );
  });

  return app;
}
