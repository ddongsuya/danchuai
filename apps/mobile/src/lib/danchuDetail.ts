// 2차 상세 요청(의뢰자)과 2차 회신(기관). 보낼 수 있는 때·기관·조건 칸은 단추 detail_view 가 정한다(단추 lib/detail-quote.ts).
// 여기서는 사람이 고른 값을 단추 본문으로만 옮긴다(app/api/rfq/[no]/detail, app/api/quote/[token]/detail).
// 2차 견적 금액은 기관 견적서(2차 조건으로 고친 설계)에서 단추가 채운다. 앱과 AI는 금액을 만들지 않는다.

export interface DetailField {
  key: string;
  group: string;
  label: string;
  type: string;
  options?: string[];
  current: string | null;
  /** 기관에 보내지 않는 칸(예산) */
  private: boolean;
}
export interface DetailLine {
  key: string;
  label: string;
  group: string;
  was: string;
  now: string;
}

/** 의뢰자 detail_view */
export interface RequesterDetailView {
  canSend: boolean;
  maxTargets: number;
  targets: { quoteId: string; lab: string }[];
  fields: DetailField[];
  sent: {
    replyBy: string;
    note: string;
    changed: DetailLine[];
    added: DetailLine[];
    targets: { quoteId: string; lab: string; status: string; statusLabel: string; total: number | null; weeks: number | null; respondedAt: string | null }[];
  } | null;
}

/** 기관 detail_view 의 detail */
export interface CroDetailView {
  status: 'sent' | 'submitted' | 'kept' | 'declined';
  replyBy: string;
  expired: boolean;
  closed: boolean;
  changed: DetailLine[];
  added: DetailLine[];
  first: { total: number; weeks: number | null; items: { seq: number; name: string; amount: number | null; weeks: number | null; avail: string }[] };
  reply: { total: number | null; weeks: number | null; note: string } | null;
  canReply: boolean;
}

export const CRO_STATUS_LABEL: Record<CroDetailView['status'], string> = {
  sent: '회신할 차례',
  submitted: '2차 견적 보냄',
  kept: '1차 그대로 답함',
  declined: '2차 회신 안 함',
};

type Built = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 기기 날짜로 n일 뒤 */
export const daysFrom = (n: number, now = new Date()) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));

/**
 * 2차 상세 요청 본문. 단추 규칙: 1차 견적을 낸 기관 1~3곳, 회신 기한은 내일부터 60일 안, 조건은 칸 선택지 안의 값만.
 * 바꾼 조건이나 메모 중 하나는 있어야 한다(아무것도 없으면 기관이 다시 낼 것이 없다).
 */
export function detailRequestBody(v: RequesterDetailView, i: { quoteIds: string[]; detail: Record<string, string | string[]>; replyBy: string; note: string }, now = new Date()): Built {
  const ids = [...new Set(i.quoteIds)].filter((id) => v.targets.some((t) => t.quoteId === id));
  if (ids.length < 1 || ids.length > v.maxTargets) return { ok: false, error: `1차 견적을 낸 기관 가운데 1~${v.maxTargets}곳을 골라 주세요` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.replyBy) || i.replyBy < daysFrom(1, now) || i.replyBy > daysFrom(60, now)) return { ok: false, error: '회신 기한은 내일부터 60일 안에서 골라 주세요' };
  const detail: Record<string, string | string[]> = {};
  for (const [k, val] of Object.entries(i.detail)) {
    const f = v.fields.find((x) => x.key === k);
    if (!f) continue;
    const list = Array.isArray(val) ? val : [val];
    const clean = f.options ? list.filter((x) => f.options!.includes(x)) : list.map((x) => x.trim().slice(0, 300)).filter(Boolean);
    if (!clean.length) continue;
    const next = f.type === 'chips' ? clean : clean[0];
    if ((Array.isArray(next) ? next.join(', ') : next) === (f.current ?? '')) continue;
    detail[k] = next;
  }
  const note = i.note.trim().slice(0, 2000);
  if (!Object.keys(detail).length && !note) return { ok: false, error: '바꿀 조건이나 메모를 적어 주세요' };
  return { ok: true, body: { quoteIds: ids, detail, replyBy: i.replyBy, ...(note ? { note } : {}) } };
}

/** 2차 회신 본문. revise 는 시험 줄 번호만 보내고 금액은 단추가 견적서에서 채운다 */
/** 2차 회신 확인 시트가 보이는 줄(견적서 판 기준). 금액은 단추 제출 미리보기 값 그대로, 합계는 코드가 낸다 */
export interface ReviseLine {
  seq: number;
  name: string;
  avail: string;
  /** 보낼 금액(원). 불가 줄은 null */
  amount: number | null;
  firstAmount: number | null;
}
export type RevisePreview = { updatedAt: string; rows: { seq: number; amount: number | null; weeks: number | null }[]; mismatched: number[] };
export interface ReviseCheck {
  lines: ReviseLine[];
  total: number;
  /** 금액이 없는 줄(불가 제외) */
  missing: number[];
  /** 요청서와 시험 이름이 달라진 줄(불가 제외) */
  mismatched: number[];
}

const live = (avail: string) => avail !== '불가';

/** 1차 견적 줄 + 견적서 제출 미리보기 → 2차 회신에 나갈 줄 */
export function reviseCheck(v: CroDetailView, p: RevisePreview): ReviseCheck {
  const rows = new Map(p.rows.map((r) => [r.seq, r]));
  const bad = new Set(p.mismatched);
  const lines = v.first.items.map((it): ReviseLine => {
    const a = rows.get(it.seq)?.amount;
    return { seq: it.seq, name: it.name, avail: it.avail, amount: live(it.avail) && !bad.has(it.seq) && a != null && a > 0 ? a : null, firstAmount: it.amount };
  });
  const on = lines.filter((l) => live(l.avail));
  return {
    lines,
    total: on.reduce((t, l) => t + (l.amount ?? 0), 0),
    missing: on.filter((l) => l.amount == null && !bad.has(l.seq)).map((l) => l.seq),
    mismatched: on.filter((l) => bad.has(l.seq)).map((l) => l.seq),
  };
}

/**
 * 2차 회신 본문. 고쳐 보내기(revise)는 사람이 본 견적서 판(docUpdatedAt)과 줄 금액을 함께 보낸다.
 * 그사이 견적서가 바뀌었거나 금액이 다르면 단추가 막고(changed), 시트가 새 금액을 다시 보여 준 뒤 다시 승인받는다.
 */
export function detailReplyBody(v: CroDetailView, mode: 'revise' | 'keep' | 'decline', note: string, preview?: RevisePreview): Built {
  if (!v.canReply) return { ok: false, error: '지금은 회신할 수 없어요' };
  const n = note.trim().slice(0, 2000);
  const tail = n ? { note: n } : {};
  if (mode !== 'revise') return { ok: true, body: { mode, ...tail } };
  if (!preview) return { ok: false, error: '견적서를 불러온 뒤 보내 주세요' };
  const c = reviseCheck(v, preview);
  if (c.mismatched.length) return { ok: false, error: `요청서와 시험 이름이 다른 줄이 ${c.mismatched.length}개 있어요` };
  if (c.missing.length) return { ok: false, error: `금액 없는 줄이 ${c.missing.length}개 있어요` };
  const weeks = new Map(preview.rows.map((r) => [r.seq, r.weeks]));
  const items = c.lines.map((l) => {
    const w = weeks.get(l.seq);
    return { seq: l.seq, avail: l.avail, amount: l.amount == null ? '' : String(l.amount), weeks: w == null ? '' : String(w) };
  });
  return { ok: true, body: { mode, items, ...tail, docUpdatedAt: preview.updatedAt } };
}
