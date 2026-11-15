// 대화 화면 상태. 서버 이벤트를 받아 바꾸는 순수 함수라 테스트할 수 있다.
import type { RequestSheet } from '@danchuai/core';

export type ChatErrorCode =
  | 'agent_unavailable'
  | 'turn_limit'
  | 'turn_in_progress'
  | 'refused'
  | 'truncated'
  | 'provider_error'
  | 'network'
  | 'unauthorized';

export interface AgentQuestion {
  field: string;
  question: string;
  options: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

export interface ChatState {
  conversationId: string | null;
  role: 'requester' | 'cro' | null;
  messages: ChatMessage[];
  status: 'idle' | 'starting' | 'streaming';
  step: string | null;
  streaming: string;
  sheet: RequestSheet | null;
  missing: string[];
  question: AgentQuestion | null;
  summary: string[] | null;
  draft: { body: string; dropped: number; version: number } | null;
  error: ChatErrorCode | null;
  /** 마지막으로 보낸 글. 오류가 나면 다시 보내기에 쓴다. */
  lastText: string | null;
  /** 이 초안은 이미 보내기 장부에 올라갔다(다시 보내지 않는다) */
  draftSent: boolean;
}

export const initialChat: ChatState = {
  conversationId: null,
  role: null,
  messages: [],
  status: 'idle',
  step: null,
  streaming: '',
  sheet: null,
  missing: [],
  question: null,
  summary: null,
  draft: null,
  error: null,
  lastText: null,
  draftSent: false,
};

export type ChatAction =
  | {
      type: 'opened';
      id: string;
      role: 'requester' | 'cro';
      sheet: RequestSheet;
      missing: string[];
      /** 이어서 열 때 서버가 돌려준 기록 */
      messages?: { role: 'user' | 'assistant'; text: string }[];
      question?: AgentQuestion | null;
      summary?: string[] | null;
      draft?: { body: string; dropped: number; version: number; sent?: boolean } | null;
    }
  | { type: 'open_failed'; code: ChatErrorCode }
  | { type: 'send'; text: string; at: number }
  | { type: 'server'; event: string; data: any }
  | { type: 'ended'; at: number }
  | { type: 'failed'; code: ChatErrorCode; at: number };

const KNOWN: readonly string[] = ['agent_unavailable', 'turn_limit', 'turn_in_progress', 'refused', 'truncated', 'provider_error', 'unauthorized'];
const asCode = (c: unknown): ChatErrorCode => (typeof c === 'string' && KNOWN.includes(c) ? (c as ChatErrorCode) : 'provider_error');

/** 흐르던 답을 대화에 내려놓는다. */
function settle(s: ChatState, at: number): ChatState {
  const text = s.streaming.trim();
  return {
    ...s,
    status: 'idle',
    step: null,
    streaming: '',
    messages: text ? [...s.messages, { id: `a${at}`, role: 'agent', text }] : s.messages,
  };
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'opened':
      return {
        ...s,
        conversationId: a.id,
        role: a.role,
        sheet: a.sheet,
        missing: a.missing,
        status: 'idle',
        error: null,
        messages: (a.messages ?? []).map((m, i) => ({ id: `h${i}`, role: m.role === 'user' ? 'user' : 'agent', text: m.text })),
        question: a.question ?? null,
        summary: a.summary ?? null,
        draft: a.draft ? { body: a.draft.body, dropped: a.draft.dropped, version: a.draft.version } : null,
        draftSent: Boolean(a.draft?.sent),
      };
    case 'open_failed':
      return { ...s, status: 'idle', error: a.code };
    case 'send':
      return {
        ...s,
        status: 'streaming',
        error: null,
        question: null,
        streaming: '',
        lastText: a.text,
        messages: [...s.messages, { id: `u${a.at}`, role: 'user', text: a.text }],
      };
    case 'server': {
      const d = a.data ?? {};
      switch (a.event) {
        case 'step':
          return { ...s, step: String(d.label ?? '') };
        case 'text':
          return { ...s, streaming: s.streaming + String(d.delta ?? '') };
        case 'sheet':
          return { ...s, sheet: d.sheet, missing: d.missing ?? [] };
        case 'question':
          return { ...s, question: d };
        case 'summary':
          return { ...s, summary: d.points ?? null };
        case 'draft':
          return { ...s, draft: { body: d.body, dropped: d.dropped ?? 0, version: d.version }, draftSent: false };
        case 'error':
          return { ...s, error: asCode(d.code) };
        default:
          return s;
      }
    }
    case 'ended':
      return settle(s, a.at);
    case 'failed':
      return { ...settle(s, a.at), error: a.code };
  }
}
