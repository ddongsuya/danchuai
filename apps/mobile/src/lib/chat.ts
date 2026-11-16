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

/** 답이 인용한 가이드라인 원문(서버 sources 이벤트) */
export interface SourceRef {
  doc: string;
  name: string;
  section: string;
  url: string | null;
  version: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  /** 답이 인용한 원문. 흐르는 동안 받은 것을 답이 끝날 때 붙인다. */
  sources?: SourceRef[];
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
  /** 지금 흐르는 답의 출처 */
  pendingSources: SourceRef[];
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
  pendingSources: [],
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

/** 출처는 모양이 맞는 것만, 원문 주소는 https만 받는다. */
function asSources(items: unknown): SourceRef[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.doc === 'string')
    .slice(0, 8)
    .map((x) => ({
      doc: String(x.doc),
      name: typeof x.name === 'string' ? x.name : String(x.doc),
      section: typeof x.section === 'string' ? x.section : '',
      url: typeof x.url === 'string' && x.url.startsWith('https://') ? x.url : null,
      version: typeof x.version === 'string' ? x.version : '',
    }));
}

/** 흐르던 답을 대화에 내려놓는다. */
function settle(s: ChatState, at: number): ChatState {
  const text = s.streaming.trim();
  return {
    ...s,
    status: 'idle',
    step: null,
    streaming: '',
    pendingSources: [],
    messages: text
      ? [...s.messages, { id: `a${at}`, role: 'agent', text, ...(s.pendingSources.length ? { sources: s.pendingSources } : {}) }]
      : s.messages,
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
        pendingSources: [],
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
        case 'sources':
          return { ...s, pendingSources: asSources(d.items) };
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
