// 견적 에이전트 서버와 이야기하는 부분. API 키는 앱에 없다. 앱은 서버 세션 토큰만 쓴다.
// EXPO_PUBLIC_AGENT_URL 이 없으면 시연 화면(데모 데이터)을 쓴다.
import type { DanchuQuoteDraft, QuoteLine, RequestSheet } from '@danchuai/core';
import { fetch } from 'expo/fetch';

import type { ChatErrorCode } from './chat';
import { createSseParser, type SseEvent } from './sse';
import { accessToken, authEnabled } from './supabase';
import type { SttTicket } from './transcribe';

const BASE = process.env.EXPO_PUBLIC_AGENT_URL?.replace(/\/$/, '');
// 로그인(Supabase)이 켜져 있으면 그 세션 토큰을 쓰고, 아니면 개발용 토큰(로컬 실행)을 쓴다.
const TOKEN = process.env.EXPO_PUBLIC_AGENT_TOKEN;
const LAB_TOKEN = process.env.EXPO_PUBLIC_AGENT_LAB_TOKEN;

export const agentConfigured = () => Boolean(BASE);

export type AgentRole = 'requester' | 'cro';

export class AgentHttpError extends Error {
  constructor(readonly code: ChatErrorCode, readonly status: number) {
    super(code);
  }
}

const codeOf = (status: number, body: unknown): ChatErrorCode => {
  const e = (body as { error?: string } | null)?.error;
  if (status === 401) return 'unauthorized';
  if (status === 503 || e === 'agent_unavailable') return 'agent_unavailable';
  if (e === 'usage_limit') return 'usage_limit';
  if (status === 429 || e === 'turn_limit') return 'turn_limit';
  if (e === 'turn_in_progress') return 'turn_in_progress';
  // 단추 견적 대화를 열 수 없음(quote_not_joined·quote_closed 등), 단추가 찾지 못함·막음
  if ((typeof e === 'string' && e.startsWith('quote_')) || e === 'not_found' || e === 'plan_required' || e === 'forbidden') return 'quote_unavailable';
  // 기관 비서: 되돌릴 수 없음(이미 되돌림·7일 지남·그 뒤 바뀜)
  if (e === 'already_undone' || e === 'not_undoable' || e === 'expired' || e === 'changed') return 'undo_unavailable';
  return 'provider_error';
};

export async function call<T>(role: AgentRole, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = (await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: await headers(role),
      body: body === undefined ? undefined : JSON.stringify(body),
    })) as unknown as Response;
  } catch {
    throw new AgentHttpError('network', 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new AgentHttpError(codeOf(res.status, json), res.status);
  return json as T;
}

async function headers(role: AgentRole): Promise<Record<string, string>> {
  const token = authEnabled() ? await accessToken() : role === 'cro' ? LAB_TOKEN : TOKEN;
  return token ? { 'content-type': 'application/json', authorization: `Bearer ${token}` } : { 'content-type': 'application/json' };
}

export interface ConversationView {
  id: string;
  role: AgentRole;
  sheet: RequestSheet;
  missing: string[];
  question?: { field: string; question: string; options: string[] } | null;
  summary?: string[] | null;
  draft?: { body: string; dropped: number; version: number; sent: boolean } | null;
  messages?: { role: 'user' | 'assistant'; text: string; sources?: unknown }[];
  /** 단추 연동: 대화가 다루는 단추 요청 번호와 기관 견적 초안 */
  danchuNo?: string | null;
  quote?: DanchuQuoteDraft | null;
}

export interface AskListItem {
  id: string;
  title: string;
  updatedAt: string;
}

/** 지난 질문(내가 연 질문 대화, 최근 순) */
export const listAsks = (role: AgentRole) => call<{ items: AskListItem[] }>(role, '/v1/agent/asks').then((r) => r.items);

export type ConversationMode = 'request' | 'ask' | 'assist';

export const createConversation = (role: AgentRole, requestId?: string, mode: ConversationMode = 'request') =>
  call<ConversationView>(role, '/v1/agent/conversations', mode === 'ask' || mode === 'assist' ? { mode } : requestId ? { requestId } : {});

/* ── 기관 비서: 단추 액션 바로 실행·되돌리기 ── */

/** 바로 실행한 단추 액션 한 줄(서버 runView) */
export interface AssistRunView {
  id: string;
  action: string;
  label: string;
  outcome: 'done' | 'failed' | 'unknown';
  undoable: boolean;
  undone: boolean;
  createdAt: string;
}

/** 단추 브리핑(단추 lib/agent-brief.ts). 금액·연락처 없음 */
export interface AssistBriefView {
  date: string;
  today: { kind: 'event' | 'task' | 'danchu'; time: string | null; title: string; sub: string; done: boolean; overdue: boolean; badge: string }[];
  need: { dealId: string; title: string; company: string | null; reason: string; tone: 'warn' | 'due'; suggest: string }[];
}

/** 읽기 액션(브리핑 등)을 단추에서 읽는다. 요청 단위 읽기는 요청 번호를 함께 */
export const readDanchu = <T,>(action: string, body: Record<string, unknown> = {}, rfqNo?: string) =>
  call<{ result: T }>('cro', '/v1/danchu/run', { action, body, ...(rfqNo ? { rfqNo } : {}) }).then((r) => r.result);

/** 바로 실행 액션을 앱 버튼으로(견적서 만들기 등). 서버가 실행 기록을 남긴다 */
export const runDanchu = <T,>(action: string, body: Record<string, unknown> = {}, rfqNo?: string) =>
  call<{ run: AssistRunView; result: T }>('cro', '/v1/danchu/run', { action, body, ...(rfqNo ? { rfqNo } : {}) });

/** 회의 녹음 전사 임시 토큰. 녹음 길이(분)와 참석자 동의 확인(attest)을 보낸다 */
export const getSttTicket = (minutes: number) => call<SttTicket>('cro', '/v1/agent/transcribe/token', { minutes: Math.max(1, Math.ceil(minutes)), attest: true });

/** 단추 견적서 툴 계산 금액(요청 행별, 부가세 별도). 금액이 없는 행은 amount null */
export interface QuotePriceView {
  rows: { seq: number; name: string; kind: string | null; amount: number | null; changes: number; priced: boolean; why: 'no_match' | 'no_price' | 'missing_item' | 'check' | null; checks?: string[] }[];
  sum: number;
  complete: boolean;
  source: 'doc' | 'catalog';
  doc: { id: string; docNo: string } | null;
}

/** 단추 과거 견적 찾기 결과 한 줄(금액은 단추 견적서 툴 계산) */
export interface QuoteHitView {
  id: string;
  docNo: string;
  title: string;
  client: string;
  substance: string;
  rfqNo: string | null;
  issuedOn: string;
  supply: number;
  tests: { name: string; total: number }[];
}

/** 비서·앱이 바로 실행한 기록(최근 30건, 최근 순) */
export const listRuns = () => call<{ items: AssistRunView[] }>('cro', '/v1/danchu/runs').then((r) => r.items);

/** 바로 실행한 기관 기록 되돌리기 */
export const undoRun = (id: string) => call<{ run: AssistRunView }>('cro', `/v1/danchu/runs/${encodeURIComponent(id)}/undo`, {}).then((r) => r.run);

export const getConversation = (role: AgentRole, id: string) => call<ConversationView>(role, `/v1/agent/conversations/${encodeURIComponent(id)}`);

/**
 * 한 턴. 서버 이벤트를 오는 대로 넘긴다. done이 오면 정상 종료, 오기 전에 끊기면 network 오류.
 */
export async function sendTurn(role: AgentRole, id: string, text: string, onEvent: (e: SseEvent) => void, signal?: AbortSignal, transcript?: string) {
  let res;
  try {
    res = await fetch(`${BASE}/v1/agent/conversations/${encodeURIComponent(id)}/turn`, {
      method: 'POST',
      headers: { ...(await headers(role)), accept: 'text/event-stream' },
      // 회의 전사본(기관 비서)은 이 턴에만 붙인다. 서버는 대화 기록에 남기지 않는다
      body: JSON.stringify(transcript ? { text, transcript } : { text }),
      signal,
    });
  } catch {
    throw new AgentHttpError('network', 0);
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    throw new AgentHttpError(codeOf(res.status, json), res.status);
  }
  let finished = false;
  const parser = createSseParser((e) => {
    if (e.event === 'done') finished = true;
    onEvent(e);
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
  } catch {
    throw new AgentHttpError('network', 0);
  }
  if (!finished) throw new AgentHttpError('network', 0);
}

export interface OutboundDraftView {
  id: string;
  counterpartyOrgId: string;
  text: string;
  epoch: number;
  textHash: string;
}

/** 보내기 초안. 본문은 서버가 가진 점검 통과 본문이고, 앱은 판 번호와 받는 곳(또는 견적 항목)만 보낸다. */
export const createOutbound = (role: AgentRole, id: string, body: { version: number; recipientOrgIds?: string[]; quoteLines?: QuoteLine[]; durationWeeks?: number }) =>
  call<{ requestId: string | null; outbound: OutboundDraftView[] }>(role, `/v1/agent/conversations/${encodeURIComponent(id)}/outbound`, body);

/** 사람이 승인한 정확한 본문(판·해시)으로 승인을 남기고, 한 번만 보낸다. */
export async function approveAndSend(role: AgentRole, d: OutboundDraftView): Promise<'sent' | 'unknown'> {
  await call(role, `/v1/outbound/${encodeURIComponent(d.id)}/decision`, { decision: 'approve', epoch: d.epoch, textHash: d.textHash });
  const r = await call<{ status: string }>(role, `/v1/outbound/${encodeURIComponent(d.id)}/dispatch`, {});
  return r.status === 'sent' ? 'sent' : 'unknown';
}

/** 단추에서 실행할 동작 하나(연동 4·5단계). 본문은 단추로 보낼 값 그대로이고 서버가 해시를 매긴다. */
export interface DanchuActionDraft {
  id: string;
  text: string;
  textHash: string;
  epoch: number;
}
export type DanchuActionName =
  | 'create'
  | 'ask'
  | 'answer'
  | 'select'
  | 'detail'
  | 'contract_confirm'
  | 'contract_result'
  | 'join'
  | 'decline'
  | 'quote_draft'
  | 'quote_upload'
  | 'quote_submit'
  | 'detail_reply'
  | 'contract_report'
  | 'crm_activity'
  /** 단추 액션 목록에서 온 승인 액션(계약서(안) 보내기, 견적서 금액 넣기 등). 서버가 목록의 수준을 다시 본다 */
  | 'contract_draft_send'
  | 'quote_doc_set_amount';

/** 단추 계약서(안) 요약(금액은 제출한 견적 그대로, 단추 계산) */
export interface ContractDraftView {
  awardId: string;
  path: string;
  tests: number;
  supply: number;
  vat: number;
  total: number;
  articles: number;
  sentAt: string | null;
  contractStatus: string;
}

/**
 * conversationId: 이 동작을 만든 대화. 단추가 받으면 서버가 그 대화를 끝난 것으로 표시한다
 * (의뢰자 요청 접수 → 요청함에 "작성 중"으로 남지 않게, 기관 견적 제출 → 제출한 판 기록). 단추로 보내는 본문에는 들어가지 않는다.
 */
export const draftDanchuAction = (role: AgentRole, action: DanchuActionName, body: Record<string, unknown>, rfqNo?: string, conversationId?: string) =>
  call<DanchuActionDraft>(role, '/v1/danchu/actions', { action, body, ...(rfqNo ? { rfqNo } : {}), ...(conversationId ? { conversationId } : {}) });

export type DanchuActionResult = { status: 'sent' | 'failed' | 'unknown'; result: Record<string, unknown> | null };

/** 사람이 승인 카드에서 누른 뒤에만 부른다. 승인 기록을 남기고 단추에서 한 번 실행한다. */
export async function approveDanchuAction(role: AgentRole, d: DanchuActionDraft): Promise<DanchuActionResult> {
  await call(role, `/v1/outbound/${encodeURIComponent(d.id)}/decision`, { decision: 'approve', epoch: d.epoch, textHash: d.textHash });
  const r = await call<{ status: string; result?: unknown }>(role, `/v1/outbound/${encodeURIComponent(d.id)}/dispatch`, {});
  const status = r.status === 'sent' || r.status === 'failed' ? r.status : 'unknown';
  return { status, result: r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : null };
}
