// 견적 에이전트 서버와 이야기하는 부분. API 키는 앱에 없다. 앱은 서버 세션 토큰만 쓴다.
// EXPO_PUBLIC_AGENT_URL 이 없으면 시연 화면(데모 데이터)을 쓴다.
import type { QuoteLine, RequestSheet } from '@danchuai/core';
import { fetch } from 'expo/fetch';

import type { ChatErrorCode } from './chat';
import { createSseParser, type SseEvent } from './sse';

const BASE = process.env.EXPO_PUBLIC_AGENT_URL?.replace(/\/$/, '');
// 개발용 토큰. 실제 로그인(Supabase 세션)이 붙으면 그 토큰으로 바꾼다.
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
  if (status === 429 || e === 'turn_limit') return 'turn_limit';
  if (e === 'turn_in_progress') return 'turn_in_progress';
  return 'provider_error';
};

async function call<T>(role: AgentRole, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = (await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: headers(role),
      body: body === undefined ? undefined : JSON.stringify(body),
    })) as unknown as Response;
  } catch {
    throw new AgentHttpError('network', 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new AgentHttpError(codeOf(res.status, json), res.status);
  return json as T;
}

function headers(role: AgentRole): Record<string, string> {
  const token = role === 'cro' ? LAB_TOKEN : TOKEN;
  return token ? { 'content-type': 'application/json', authorization: `Bearer ${token}` } : { 'content-type': 'application/json' };
}

export interface ConversationView {
  id: string;
  role: AgentRole;
  sheet: RequestSheet;
  missing: string[];
}

export const createConversation = (role: AgentRole, requestId?: string) =>
  call<ConversationView>(role, '/v1/agent/conversations', requestId ? { requestId } : {});

/**
 * 한 턴. 서버 이벤트를 오는 대로 넘긴다. done이 오면 정상 종료, 오기 전에 끊기면 network 오류.
 */
export async function sendTurn(role: AgentRole, id: string, text: string, onEvent: (e: SseEvent) => void, signal?: AbortSignal) {
  let res;
  try {
    res = await fetch(`${BASE}/v1/agent/conversations/${encodeURIComponent(id)}/turn`, {
      method: 'POST',
      headers: { ...headers(role), accept: 'text/event-stream' },
      body: JSON.stringify({ text }),
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
export const createOutbound = (role: AgentRole, id: string, body: { version: number; recipientOrgIds?: string[]; quoteLines?: QuoteLine[] }) =>
  call<{ outbound: OutboundDraftView[] }>(role, `/v1/agent/conversations/${encodeURIComponent(id)}/outbound`, body);

/** 사람이 승인한 정확한 본문(판·해시)으로 승인을 남기고, 한 번만 보낸다. */
export async function approveAndSend(role: AgentRole, d: OutboundDraftView): Promise<'sent' | 'unknown'> {
  await call(role, `/v1/outbound/${encodeURIComponent(d.id)}/decision`, { decision: 'approve', epoch: d.epoch, textHash: d.textHash });
  const r = await call<{ status: string }>(role, `/v1/outbound/${encodeURIComponent(d.id)}/dispatch`, {});
  return r.status === 'sent' ? 'sent' : 'unknown';
}
