// 단추 연동 기관 견적(말로 맡기는 견적 2단계). 확인 카드에 그릴 줄과 단추로 보낼 본문을 만든다.
// 단추 회신 구조(items/common/steps/note)를 그대로 쓴다. 금액은 부가세 별도(단추 비교표 기준).
// 레거시 견적 입력(quoteForm·QuoteEditor, quoteLines + 부가세 10%)은 단추 연동 모드에서 쓰지 않는다.
// 금액은 코드가 정한다: 단추가 시험 목록 단가로 계산한 값(바꾸지 않음) 또는 담당자가 카드에서 넣은 값. AI가 쓴 금액은 없다.
import { buildQuoteBody, parseWonInput, quoteSubmittedNow, type DanchuAvail, type DanchuQuoteDraft } from '@danchuai/core';

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
