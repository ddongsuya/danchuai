// 단추 연동 기관 견적(말로 맡기는 견적 2단계). 확인 카드에 그릴 줄과 단추로 보낼 본문을 만든다.
// 단추 회신 구조(items/common/steps/note)를 그대로 쓴다. 금액은 부가세 별도(단추 비교표 기준).
// 레거시 견적 입력(quoteForm·QuoteEditor, quoteLines + 부가세 10%)은 단추 연동 모드에서 쓰지 않는다.
// 금액은 코드가 정한다: 단추가 시험 목록 단가로 계산한 값(바꾸지 않음) 또는 담당자가 카드에서 넣은 값. AI가 쓴 금액은 없다.
// 2026-11-20부터 제출 금액은 단추 견적서 툴 계산값만(단추 #141·#142). 확인 카드는 아래 "견적서 기준 제출" 함수를 쓴다.
import { buildQuoteBody, parseWonInput, quoteSubmittedNow, type DanchuAvail, type DanchuQuoteBuild, type DanchuQuoteDraft } from '@danchuai/core';

export { buildQuoteBody, parseWonInput, quoteSubmittedNow, type DanchuQuoteDraft };

/** 확인 카드 한 줄. source: danchu = 단추 계산, saved = 단추에 저장된 금액(웹에서 넣은 값), manual = 카드에서 넣을 줄 */
export interface ReviewLine {
  seq: number;
  name: string;
  avail: DanchuAvail;
  amount: number | null;
  weeks: number | null;
  source: 'danchu' | 'saved' | 'manual';
  reason: string;
}

const needsAmount = (a: DanchuAvail) => a === '가능' || a === '조건부 가능';

/** 초안 → 카드 줄. 요청서 항목 순서 그대로 */
export function reviewLines(d: DanchuQuoteDraft): ReviewLine[] {
  const priced = new Set(d.priced);
  const rows = new Map(d.rows.map((r) => [r.seq, r]));
  return d.items.map((it) => {
    const has = priced.has(it.seq);
    return {
      seq: it.seq,
      name: rows.get(it.seq)?.name ?? `항목 ${it.seq}`,
      avail: it.avail,
      amount: has && needsAmount(it.avail) ? Number(it.amount) : null,
      weeks: it.weeks ? Number(it.weeks) : null,
      source: has ? (it.source === 'catalog' || it.source === 'learned' ? 'danchu' : 'saved') : 'manual',
      reason: it.reason ?? '',
    };
  });
}

/** 카드 아래 버튼 문구: 제출할 수 없으면 무엇이 남았는지 */
export function blockedLabel(d: DanchuQuoteDraft, manual: Readonly<Record<number, string>>): string | null {
  const b = buildQuoteBody(d, manual, true);
  if (b.ok) return null;
  if (b.missingAvail.length) return `가능 여부 ${b.missingAvail.length}개 미정`;
  if (b.missingAmount.length) return `금액 ${b.missingAmount.length}줄 남음`;
  return '착수 가능일 미정';
}

/** 입력 중 표시: 세 자리마다 쉼표 */
export function formatWonInput(input: string): string {
  const n = parseWonInput(input);
  return n == null ? '' : n.toLocaleString('ko-KR');
}

/* ── 견적서 기준 제출 (2026-11-20, 단추 #141·#142) ──
 * 단추는 제출 금액을 견적서 툴 계산값으로만 채운다. 확인 카드는 단추 제출 미리보기(quote_submit_preview)를 그대로 보이고,
 * 제출 때 미리보기의 견적서 판(docUpdatedAt)을 함께 보낸다. 그사이 견적서가 바뀌면 단추가 막는다(사람이 본 금액만 나간다). */

/** 단추 제출 미리보기(quote_submit 이 줄마다 채울 금액, 할인 반영, 부가세 별도) */
export interface QuoteSubmitPreview {
  docId: string;
  docNo: string;
  updatedAt: string;
  /** 단추 견적서 툴 화면 */
  path: string;
  rows: { seq: number; amount: number | null; weeks: number | null; extra: Record<string, string>; tests: { uid: string; title: string; total: number; manual: boolean }[] }[];
  discount: number;
  mismatched: number[];
  unlinked: string[];
}

/** 의뢰자에게 함께 가는 설계 설명 칸(단추 replyExtra·kdExtra). 금액 칸(cost_*)은 원 단위 숫자 */
const EXTRA_LABEL: Record<string, string> = {
  exp_why: '설계',
  exp_asks: '확인할 것',
  exp_groups: '군 구성',
  exp_schedule: '일정',
  exp_endpoints: '평가 항목',
  exp_samples: '검체',
  exp_val: '분석법',
  exp_options: '옵션',
  cost_animal: '동물·모델 유발',
  cost_dosing: '투여·관찰',
  cost_eval: '평가·분석',
  cost_path: '병리',
  cost_report: '보고서·통계',
};

export type DocLineState = 'off' | 'undecided' | 'mismatched' | 'priced' | 'manual' | 'no_test';

export interface DocLine {
  seq: number;
  name: string;
  avail: DanchuAvail;
  /** 제출할 금액(단추 계산). priced 줄만 */
  amount: number | null;
  weeks: number | null;
  reason: string;
  state: DocLineState;
  /** 의뢰자에게 함께 가는 설계 설명([라벨, 글]) */
  extra: [string, string][];
  /** 금액을 사람이 넣는 견적서 시험(manual 줄) */
  manual: { uid: string; title: string }[];
}

/** 초안 + 제출 미리보기 → 카드 줄. 요청서 항목 순서 그대로 */
export function docLines(d: DanchuQuoteDraft, p: QuoteSubmitPreview): DocLine[] {
  const rows = new Map(d.rows.map((r) => [r.seq, r]));
  const prev = new Map(p.rows.map((r) => [r.seq, r]));
  const bad = new Set(p.mismatched);
  return d.items.map((it) => {
    const r = prev.get(it.seq);
    const live = needsAmount(it.avail);
    const state: DocLineState = it.avail === '불가' ? 'off' : !it.avail ? 'undecided' : bad.has(it.seq) ? 'mismatched' : r?.amount != null && r.amount > 0 ? 'priced' : r?.tests.some((t) => t.manual) ? 'manual' : 'no_test';
    const extra = state === 'priced' && r
      ? Object.entries(r.extra)
          .filter(([k, v]) => EXTRA_LABEL[k] && v.trim())
          .map(([k, v]): [string, string] => [EXTRA_LABEL[k], k.startsWith('cost_') && /^\d+$/.test(v) ? `${Number(v).toLocaleString('ko-KR')}원` : v])
      : [];
    return {
      seq: it.seq,
      name: rows.get(it.seq)?.name ?? `항목 ${it.seq}`,
      avail: it.avail,
      amount: state === 'priced' && live ? (r?.amount ?? null) : null,
      weeks: r?.weeks ?? (it.weeks ? Number(it.weeks) : null),
      reason: it.reason ?? '',
      state,
      extra,
      manual: state === 'manual' ? (r?.tests ?? []).filter((t) => t.manual).map(({ uid, title }) => ({ uid, title })) : [],
    };
  });
}

export type DocQuoteBuild =
  | { ok: true; body: Extract<DanchuQuoteBuild, { ok: true }>['body'] & { docUpdatedAt?: string }; total: number }
  | { ok: false; missingAvail: number[]; missingAmount: number[]; mismatched: number[]; missingStart: boolean };

/**
 * 견적서 기준 회신 본문. 줄 금액·기간은 제출 미리보기 값 그대로(단추가 같은 계산으로 다시 채운다).
 * 제출(forSubmit)은 견적서 판을 함께 보내고, 가능 여부·금액·착수 가능일이 모두 있고 이름이 달라진 줄이 없어야 한다.
 */
export function docQuoteBody(d: DanchuQuoteDraft, p: QuoteSubmitPreview, forSubmit: boolean): DocQuoteBuild {
  const prev = new Map(p.rows.map((r) => [r.seq, r]));
  const bad = new Set(p.mismatched);
  const amounts: Record<number, string> = {};
  for (const r of p.rows) if (r.amount != null && r.amount > 0 && !bad.has(r.seq)) amounts[r.seq] = String(r.amount);
  const draft: DanchuQuoteDraft = {
    ...d,
    priced: [],
    items: d.items.map((it) => {
      const w = prev.get(it.seq)?.weeks;
      return w != null && needsAmount(it.avail) ? { ...it, weeks: String(w) } : it;
    }),
  };
  const b = buildQuoteBody(draft, amounts, forSubmit);
  const mismatched = d.items.filter((it) => needsAmount(it.avail) && bad.has(it.seq)).map((it) => it.seq);
  if (!b.ok) return { ...b, mismatched };
  if (forSubmit && mismatched.length) return { ok: false, missingAvail: [], missingAmount: [], mismatched, missingStart: false };
  return { ok: true, body: forSubmit ? { ...b.body, docUpdatedAt: p.updatedAt } : b.body, total: b.total };
}

/** 카드 아래 버튼 문구: 제출할 수 없으면 무엇이 남았는지 */
export function docBlockedLabel(b: DocQuoteBuild): string | null {
  if (b.ok) return null;
  if (b.missingAvail.length) return `가능 여부 ${b.missingAvail.length}개 미정`;
  if (b.mismatched.length) return `시험 이름 ${b.mismatched.length}줄 다름`;
  if (b.missingAmount.length) return `금액 ${b.missingAmount.length}줄 남음`;
  return '착수 가능일 미정';
}

/** 지금 견적서 금액이 단추에 제출한 금액과 같은가(제출 뒤 견적서를 고쳤으면 다시 제출할 수 있다) */
export function sameAsSubmitted(d: DanchuQuoteDraft, p: QuoteSubmitPreview): boolean {
  const prev = new Map(p.rows.map((r) => [r.seq, r.amount]));
  return d.items.filter((it) => needsAmount(it.avail)).every((it) => String(prev.get(it.seq) ?? '') === it.amount);
}
