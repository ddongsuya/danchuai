// 대화 화면 상태. 서버 이벤트를 받아 바꾸는 순수 함수라 테스트할 수 있다.
import { SHEET_LABELS, type DanchuQuoteDraft, type RequestSheet } from '@danchuai/core';

export type ChatErrorCode =
  | 'agent_unavailable'
  | 'turn_limit'
  | 'turn_in_progress'
  | 'refused'
  | 'truncated'
  | 'provider_error'
  | 'network'
  | 'unauthorized'
  /** 단추 견적 대화를 열 수 없다(참여 전·불참·회신 닫힘·찾을 수 없음 등) */
  | 'quote_unavailable'
  /** 기관 비서: 되돌릴 수 없다(이미 되돌림·기간 지남·그 뒤 바뀜) */
  | 'undo_unavailable'
  /** 계정·기관 AI 이용량 상한(서버 usage_limit) */
  | 'usage_limit'
  /** 서비스의 AI 사용 한도·크레딧이 다 됨(공급사 쪽) */
  | 'ai_quota';

/** 기관 비서가 단추에서 바로 실행한 것 한 장(서버 action 이벤트). at: 이 카드가 붙는 메시지 자리 */
export interface ActionCard {
  key: string;
  at: number;
  label: string;
  outcome: 'done' | 'failed' | 'unknown' | 'skipped' | 'pending';
  message: string | null;
  runId: string | null;
  undoable: boolean;
  undone: boolean;
  /** outcome pending(권한 "매번 묻기"): 허용하면 앱이 이 동작·본문으로 단추를 부른다 */
  ask?: { action: string; body: Record<string, unknown> } | null;
}

/** 기관 비서 찾기 카드(서버 lookup 이벤트). 카드가 이 입력으로 단추를 직접 읽는다(결과는 모델·대화 기록에 없다) */
export interface LookupCard {
  key: string;
  at: number;
  action: string;
  label: string;
  body: Record<string, unknown>;
}

export interface QuestionOption {
  label: string;
  /** 고르면 요청서에서 달라지는 것(짧게). 근거가 있을 때만 온다 */
  effect?: string;
}

/** 질문의 근거 원문 조각(서버가 검색한 조각과 맞춘 것만) */
export interface QuestionBasis extends SourceRef {
  excerpt: string;
}

export interface AgentQuestion {
  field: string;
  question: string;
  options: QuestionOption[];
  basis?: QuestionBasis[];
  /** 이미 채운 칸을 다시 묻는 질문(상황과 어긋남) */
  recheck?: boolean;
}

/** 카드가 맨 아래 줄로 따로 두는 답. 선택지에 섞여 오면 뺀다 */
const UNSURE = /^(미정|모름|모르겠어요|잘 모르겠어요|아직 몰라요|아직 미정|미정이에요|미정으로 두기)$/;

/** 서버 질문을 모양이 맞는 것만 받는다. 예전 기록의 문자열 선택지도 받는다 */
export function asQuestion(q: unknown): AgentQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const x = q as Record<string, unknown>;
  if (typeof x.field !== 'string' || typeof x.question !== 'string' || !Array.isArray(x.options)) return null;
  const options = x.options
    .map((o): QuestionOption | null => {
      if (typeof o === 'string') return { label: o };
      if (o && typeof o === 'object' && typeof (o as QuestionOption).label === 'string') {
        const { label, effect } = o as QuestionOption;
        return typeof effect === 'string' && effect ? { label, effect } : { label };
      }
      return null;
    })
    .filter((o): o is QuestionOption => !!o && !UNSURE.test(o.label.trim()));
  if (!options.length) return null;
  const basis = (Array.isArray(x.basis) ? x.basis : []).slice(0, 3).flatMap((b): QuestionBasis[] => {
    const [ref] = asSources([b]);
    const excerpt = (b as { excerpt?: unknown }).excerpt;
    return ref ? [{ ...ref, excerpt: typeof excerpt === 'string' ? excerpt.slice(0, 400) : '' }] : [];
  });
  return {
    field: x.field,
    question: x.question,
    options,
    ...(basis.length ? { basis } : {}),
    ...(x.recheck === true ? { recheck: true } : {}),
  };
}

const LABELS = new Set<string>(Object.values(SHEET_LABELS));

/** 질문 카드로 보낸 답("임상 계획: 3개월 이내")을 칸 이름과 값으로 나눈다. 말풍선이 칸 이름을 작게 위에 쓴다 */
export function splitAnswer(text: string): { field: string; value: string } | null {
  const i = text.indexOf(': ');
  if (i < 1) return null;
  const field = text.slice(0, i);
  const value = text.slice(i + 2).trim();
  return LABELS.has(field) && value ? { field, value } : null;
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
  /** 단추 연동 기관 견적 초안(서버 quote 이벤트·대화 열기). 금액은 단추 계산값 */
  quote: DanchuQuoteDraft | null;
  /** 기관 비서 실행 카드(이번에 연 동안 받은 것) */
  actions: ActionCard[];
  /** 기관 비서 찾기 카드(이번에 연 동안 받은 것) */
  lookups: LookupCard[];
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
  quote: null,
  actions: [],
  lookups: [],
};

export type ChatAction =
  | {
      type: 'opened';
      id: string;
      role: 'requester' | 'cro';
      sheet: RequestSheet;
      missing: string[];
      /** 이어서 열 때 서버가 돌려준 기록 */
      messages?: { role: 'user' | 'assistant'; text: string; sources?: unknown }[];
      question?: unknown;
      summary?: string[] | null;
      draft?: { body: string; dropped: number; version: number; sent?: boolean } | null;
      quote?: DanchuQuoteDraft | null;
    }
  | { type: 'open_failed'; code: ChatErrorCode }
  | { type: 'send'; text: string; at: number }
  | { type: 'server'; event: string; data: any }
  | { type: 'undone'; runId: string }
  | { type: 'patchAction'; key: string; patch: Partial<ActionCard> }
  | { type: 'ended'; at: number }
  | { type: 'failed'; code: ChatErrorCode; at: number };

const KNOWN: readonly string[] = ['agent_unavailable', 'turn_limit', 'turn_in_progress', 'refused', 'truncated', 'provider_error', 'unauthorized', 'quote_unavailable', 'undo_unavailable', 'usage_limit', 'ai_quota'];
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
        messages: (a.messages ?? []).map((m, i) => {
          const sources = m.role === 'user' ? [] : asSources(m.sources);
          return { id: `h${i}`, role: m.role === 'user' ? 'user' : 'agent', text: m.text, ...(sources.length ? { sources } : {}) };
        }),
        question: asQuestion(a.question),
        summary: a.summary ?? null,
        draft: a.draft ? { body: a.draft.body, dropped: a.draft.dropped, version: a.draft.version } : null,
        draftSent: Boolean(a.draft?.sent),
        quote: a.quote ?? null,
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
          return { ...s, question: asQuestion(d) };
        case 'summary':
          return { ...s, summary: d.points ?? null };
        case 'draft':
          return { ...s, draft: { body: d.body, dropped: d.dropped ?? 0, version: d.version }, draftSent: false };
        case 'sources':
          return { ...s, pendingSources: asSources(d.items) };
        case 'quote':
          return d.quote && typeof d.quote === 'object' ? { ...s, quote: d.quote as DanchuQuoteDraft } : s;
        case 'action': {
          const run = d.run && typeof d.run === 'object' ? (d.run as { id?: unknown; undoable?: unknown }) : null;
          const ask = d.outcome === 'pending' && typeof d.action === 'string' && /^[a-z][a-z_]{1,39}$/.test(d.action) && d.body && typeof d.body === 'object' && !Array.isArray(d.body) ? { action: d.action, body: d.body as Record<string, unknown> } : null;
          const outcome = ask ? 'pending' : ['done', 'failed', 'unknown', 'skipped'].includes(d.outcome) ? (d.outcome as ActionCard['outcome']) : 'unknown';
          const card: ActionCard = {
            key: `x${s.actions.length}`,
            // 답이 내려오면 이 턴의 답 자리(사용자 글 다음)
            at: s.messages.length,
            label: typeof d.label === 'string' ? d.label.slice(0, 60) : '동작',
            outcome,
            message: typeof d.message === 'string' ? d.message.slice(0, 120) : null,
            runId: run && typeof run.id === 'string' ? run.id : null,
            undoable: !!run && run.undoable === true,
            undone: false,
            ask,
          };
          return { ...s, actions: [...s.actions, card] };
        }
        case 'lookup': {
          if (typeof d.action !== 'string' || !/^[a-z][a-z_]{1,39}$/.test(d.action) || !d.body || typeof d.body !== 'object' || Array.isArray(d.body)) return s;
          const card: LookupCard = { key: `l${s.lookups.length}`, at: s.messages.length, action: d.action, label: typeof d.label === 'string' ? d.label.slice(0, 60) : '찾기', body: d.body as Record<string, unknown> };
          return { ...s, lookups: [...s.lookups, card] };
        }
        case 'error':
          return { ...s, error: asCode(d.code) };
        default:
          return s;
      }
    }
    case 'patchAction':
      return { ...s, actions: s.actions.map((c) => (c.key === a.key ? { ...c, ...a.patch } : c)) };
    case 'undone':
      return { ...s, actions: s.actions.map((c) => (c.runId === a.runId ? { ...c, undone: true, undoable: false } : c)) };
    case 'ended':
      return settle(s, a.at);
    case 'failed':
      // 서버가 먼저 보낸 오류(사용 한도 등)가 있으면 그것을 둔다. 스트림이 끊긴 것(network)으로 덮지 않는다
      return { ...settle(s, a.at), error: s.error ?? a.code };
  }
}
