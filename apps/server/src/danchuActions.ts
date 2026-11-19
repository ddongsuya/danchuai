// 단추에서 실행할 동작 (연동 4·5단계). 사람이 확인 카드에서 승인한 동작만 단추로 보낸다.
// - 초안 본문은 단추로 보낼 JSON 그대로(키 정렬). 사람이 본 본문의 해시와 보낸 본문이 같다.
// - AI 도구로는 만들지 않는다. 앱이 사람이 고른 값으로 만든다.
// - 회사명·연락처 칸은 받지 않는다. 요청 접수 때 단추가 프로필에서 채운다.
import type { Conversation } from "./agent/store";
import { z } from "zod";
import { RFQ_NO } from "./danchu";
import type { DanchuCatalog, DanchuRole } from "./danchu";

export const ACTIONS = {
  // 4단계: create·ask·answer / 5단계: select·detail(2차 요청)·contract_confirm·contract_result
  requester: ["create", "ask", "answer", "select", "detail", "contract_confirm", "contract_result"],
  // 4단계: join·decline·ask·answer·quote_draft(임시 저장)·quote_upload(PDF 올릴 주소)·quote_submit / 5단계: detail_reply·contract_report·crm_activity
  // quote_draft·quote_upload 는 단추 /api/agent/requests/[no]/act 가 이미 받는다(단추 PR #117 이전부터). 말로 맡기는 견적 2단계에서 연다.
  cro: ["join", "decline", "ask", "answer", "quote_draft", "quote_upload", "quote_submit", "detail_reply", "contract_report", "crm_activity"],
} as const satisfies Record<DanchuRole, readonly string[]>;
/** 요청 번호 없이 하는 동작 */
const NO_RFQ: readonly string[] = ["create", "crm_activity"];
export type DanchuActionName = (typeof ACTIONS)[DanchuRole][number];

const ALL = [...new Set([...ACTIONS.requester, ...ACTIONS.cro])] as [DanchuActionName, ...DanchuActionName[]];
const MAX_TEXT = 100_000;
/** 요청서에서 받지 않는 칸(단추가 프로필로 채움) */
const CONTACT_KEYS = ["company", "name", "dept", "phone", "email", "website"];

export const DanchuActionBody = z
  .object({
    action: z.enum(ALL),
    rfqNo: z.string().regex(RFQ_NO).optional(),
    body: z.record(z.string(), z.unknown()),
  })
  .strict();
export type DanchuAction = { action: DanchuActionName; rfqNo: string | null; body: Record<string, unknown> };

/** 키를 정렬한 JSON. 같은 동작은 늘 같은 문자열(같은 해시)이 된다 */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export type Checked = { ok: true; action: DanchuAction; text: string } | { ok: false; error: "bad_request" | "forbidden" | "too_long" };

// 단추 회신 본문(/api/quote/[token] PUT·POST)과 같은 모양만 받는다. 금액은 부가세 별도 원 단위 숫자 문자열(단추 비교표 기준).
// 레거시 견적(quoteLines·부가세 포함 총액)은 받지 않는다. 자세한 검사는 단추가 한 번 더 한다.
const QuoteItem = z
  .object({
    seq: z.number().int().min(1).max(999),
    avail: z.enum(["", "가능", "조건부 가능", "불가"]),
    amount: z.string().regex(/^\d{0,13}$/),
    weeks: z.string().regex(/^\d{0,3}$/),
    reason: z.string().max(500).nullable().optional(),
  })
  .passthrough();
const QuoteBody = z
  .object({
    items: z.array(QuoteItem).min(1).max(60),
    note: z.string().max(2000),
    common: z
      .object({
        validUntil: z.string().max(10),
        startDate: z.string().max(10),
        payTerms: z.string().max(60),
        substanceQty: z.string().max(120),
        reportLang: z.string().max(20),
        includes: z.array(z.string().max(40)).max(20),
      })
      .strict(),
    steps: z.array(z.object({ seq: z.number().int(), name: z.string().max(60), weeks: z.string().max(3), after: z.array(z.number().int()).max(20) }).strict()).max(20),
    pdf: z.object({ path: z.string().max(400), name: z.string().max(200), size: z.number().int().positive() }).strict().optional(),
  })
  .strict();
const UploadBody = z.object({ name: z.string().min(1).max(200), size: z.number().int().positive(), type: z.string().max(60).optional() }).strict();

/** 기관 견적 동작의 본문 모양 검사. 다른 동작은 그대로 통과 */
export function quoteBodyOk(action: DanchuActionName, body: Record<string, unknown>): boolean {
  if (action === "quote_draft" || action === "quote_submit") return QuoteBody.safeParse(body).success;
  if (action === "quote_upload") return UploadBody.safeParse(body).success;
  return true;
}

/** 역할에 맞는 동작인지, 번호가 필요한지 보고 본문 문자열을 만든다 */
export function checkAction(role: DanchuRole, input: unknown): Checked {
  const p = DanchuActionBody.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const { action, rfqNo, body } = p.data;
  if (!(ACTIONS[role] as readonly string[]).includes(action)) return { ok: false, error: "forbidden" };
  if (NO_RFQ.includes(action) === !!rfqNo) return { ok: false, error: "bad_request" };
  if ("action" in body) return { ok: false, error: "bad_request" };
  if (!quoteBodyOk(action, body)) return { ok: false, error: "bad_request" };
  const clean = action === "create" ? Object.fromEntries(Object.entries(body).filter(([k]) => !CONTACT_KEYS.includes(k))) : body;
  const a: DanchuAction = { action, rfqNo: rfqNo ?? null, body: clean };
  const text = canonical(a);
  if (text.length > MAX_TEXT) return { ok: false, error: "too_long" };
  return { ok: true, action: a, text };
}

/**
 * 단추 액션 목록에만 있는 승인 동작(등록부에 새로 생긴 것). 목록의 역할·범위·수준을 그대로 따른다.
 * 앞의 고정 목록(ACTIONS)에 있는 동작은 checkAction 으로만 받는다(본문 모양을 더 엄격히 본다).
 */
export function checkCatalogAction(role: DanchuRole, input: unknown, catalog: DanchuCatalog | null): Checked {
  const p = CatalogActionBody.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const { action, rfqNo, body } = p.data;
  const def = catalog && catalog.role === role ? catalog.actions.find((a) => a.name === action) : null;
  if (!def || def.level !== "confirm") return { ok: false, error: "forbidden" };
  if ((def.scope === "rfq") !== !!rfqNo) return { ok: false, error: "bad_request" };
  if ("action" in body) return { ok: false, error: "bad_request" };
  const a = { action: action as DanchuActionName, rfqNo: rfqNo ?? null, body };
  const text = canonical(a);
  if (text.length > MAX_TEXT) return { ok: false, error: "too_long" };
  return { ok: true, action: a, text };
}

const ACTION_NAME = /^[a-z][a-z_]{1,39}$/;
const CatalogActionBody = z.object({ action: z.string().regex(ACTION_NAME), rfqNo: z.string().regex(RFQ_NO).optional(), body: z.record(z.string(), z.unknown()) }).strict();

/** 승인된 본문을 다시 동작으로. 형식이 깨졌으면 null(보내지 않는다). 본문은 초안 때 checkAction·checkCatalogAction 을 지났다 */
export function parseActionText(text: string): DanchuAction | null {
  try {
    const v = JSON.parse(text) as { action?: unknown; rfqNo?: unknown; body?: unknown };
    const p = CatalogActionBody.safeParse({ action: v.action, body: v.body, ...(typeof v.rfqNo === "string" ? { rfqNo: v.rfqNo } : {}) });
    return p.success ? { action: p.data.action as DanchuActionName, rfqNo: p.data.rfqNo ?? null, body: p.data.body } : null;
  } catch {
    return null;
  }
}

/** 고정 목록에 있는 동작인지 */
export const isKnownAction = (role: DanchuRole, action: unknown): boolean => typeof action === "string" && (ACTIONS[role] as readonly string[]).includes(action);

/** 단추 응답 상태 → 장부 결과. 4xx는 확실한 거절(failed), 시간 초과·너무 잦음·5xx는 결과 불명 */
export function outcomeOf(status: number): "sent" | "failed" | "unknown" {
  if (status >= 200 && status < 300) return "sent";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "failed";
  return "unknown";
}

/**
 * 단추 동작에 붙일 대화가 맞는지(POST /v1/danchu/actions conversationId). 같은 조직·같은 역할이고,
 * 의뢰자 요청 접수는 요청 대화에서, 기관 견적 동작은 그 단추 요청 번호로 연 견적 대화에서만.
 */
export function canLinkConversation(conv: Conversation | null, s: { orgId: string; role: string }, a: DanchuAction): boolean {
  if (!conv || conv.orgId !== s.orgId || conv.role !== s.role || conv.mode !== "request") return false;
  if (a.action === "create") return conv.role === "requester";
  if (a.action === "quote_draft" || a.action === "quote_submit" || a.action === "quote_upload") return conv.role === "cro" && !!conv.danchuNo && conv.danchuNo === a.rfqNo;
  return false;
}

/**
 * 단추가 받은 동작(전송 결과 sent)을 대화 상태에 반영한다(순수 함수). 바뀐 것이 없으면 null.
 * - 의뢰자 요청 접수(create): 본문 초안을 보낸 것으로 표시하고 단추 요청 번호를 남긴다. 요청함에 "작성 중·대기"로 다시 보이지 않는다.
 * - 기관 견적 제출(quote_submit): 지금 판을 제출한 판으로 남긴다. 그 뒤 대화로 고치면 다시 제출할 것으로 보인다.
 * 임시 저장(quote_draft)·PDF 주소(quote_upload)는 상태를 바꾸지 않는다.
 */
export function afterDanchuSent(conv: Conversation, a: DanchuAction, result: unknown): Conversation | null {
  if (a.action === "create") {
    const no = result && typeof result === "object" && typeof (result as { rfqNo?: unknown }).rfqNo === "string" ? (result as { rfqNo: string }).rfqNo : null;
    return {
      ...conv,
      draft: conv.draft ? { ...conv.draft, outboundCreated: true } : conv.draft,
      danchuNo: no && RFQ_NO.test(no) ? no : conv.danchuNo,
      question: null,
    };
  }
  if (a.action === "quote_submit" && conv.quote) return { ...conv, quote: { ...conv.quote, submittedVersion: conv.quote.version } };
  return null;
}
