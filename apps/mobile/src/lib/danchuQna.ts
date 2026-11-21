// 질의응답(의뢰자·기관). 목록·가림·질의할 수 있는 때는 단추 qna_view 가 정한다(단추 lib/qna-data.ts).
// 여기서는 사람이 쓴 글을 단추 본문 모양으로만 옮긴다(app/api/rfq/[no]/qna, app/api/quote/[token]/qna).
// 선정 전 연락처는 단추가 가려서 준다. 앱은 원문을 따로 갖지 않는다.

export interface QnaItem {
  id: string;
  direction: 'cro' | 'sponsor';
  topic: string;
  test: string | null;
  body: string;
  bodyMasked: boolean;
  at: string;
  answer: string | null;
  answerMasked: boolean;
  answeredAt: string | null;
  scope: 'private' | 'all' | null;
  /** 의뢰자 화면: 기관 표시명(비교표 전 기관 A·B). 기관 화면 공개 답변: 빈 문자열 */
  party: string;
  inviteId: string;
  toAnswer: boolean;
}

/** 단추 qna_view 응답. 의뢰자는 items·targets, 기관은 mine·shared */
export interface QnaView {
  qna: {
    items?: QnaItem[];
    targets?: { inviteId: string; label: string }[];
    mine?: QnaItem[];
    shared?: QnaItem[];
    canAsk: boolean;
    canAnswer: boolean;
    pending: number;
    replyBy: string | null;
    tests: { seq: number; name: string }[];
  };
  topics: { id: string; label: string }[];
}

export const QNA_MAX = 1000;

type Built = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

const text = (s: string): string | null => {
  const t = s.trim();
  return t.length >= 1 && t.length <= QNA_MAX ? t : null;
};

/** 질의 본문. 의뢰자는 받을 기관(inviteId)이 있어야 한다 */
export function askBody(role: 'requester' | 'cro', i: { inviteId?: string | null; topic: string | null; testSeq?: number | null; body: string }): Built {
  if (role === 'requester' && !i.inviteId) return { ok: false, error: '질의할 기관을 골라 주세요' };
  if (!i.topic) return { ok: false, error: '주제를 골라 주세요' };
  const b = text(i.body);
  if (!b) return { ok: false, error: i.body.trim() ? `${QNA_MAX}자까지 적을 수 있어요` : '질의 내용을 적어 주세요' };
  return { ok: true, body: { ...(role === 'requester' ? { inviteId: i.inviteId } : {}), topic: i.topic, ...(i.testSeq ? { testSeq: i.testSeq } : {}), body: b } };
}

/** 답변 본문. 의뢰자는 공개 범위(질의 기관만·참여 기관 전체)를 고른다 */
export function answerBody(role: 'requester' | 'cro', i: { questionId: string; answer: string; scope?: 'private' | 'all' | null }): Built {
  const a = text(i.answer);
  if (!a) return { ok: false, error: i.answer.trim() ? `${QNA_MAX}자까지 적을 수 있어요` : '답변을 적어 주세요' };
  if (role === 'requester' && !i.scope) return { ok: false, error: '공개 범위를 골라 주세요' };
  return { ok: true, body: { questionId: i.questionId, answer: a, ...(role === 'requester' ? { scope: i.scope } : {}) } };
}

/** 화면에 보일 질의 목록(최근 순). 기관은 우리 질의응답 뒤에 공개 답변 */
export function qnaItems(v: QnaView): QnaItem[] {
  return [...(v.qna.items ?? []), ...(v.qna.mine ?? []), ...(v.qna.shared ?? [])];
}
