// 기관 견적 입력(사람이 넣는 항목·금액·기간). 금액은 원 단위 정수만 받는다. 합계는 computeTotals가 낸다.
import type { QuoteLine } from '@danchuai/core';

export interface QuoteRow {
  key: string;
  label: string;
  amount: string;
}

export const MAX_ROWS = 30;
const MAX_WON = 1_000_000_000_000;

/** "82,000,000" → 82000000. 숫자·쉼표·공백 말고 다른 글자가 있거나 범위를 넘으면 null */
export function parseWon(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n <= MAX_WON ? n : null;
}

/** 입력 중인 금액에 쉼표를 넣는다(숫자만 남긴다) */
export function groupDigits(text: string): string {
  const d = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function parseWeeks(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 1 && n <= 520 ? n : null;
}

export type RowError = 'label' | 'amount' | null;

/** 빈 줄(항목·금액 모두 비움)은 건너뛴다. 하나라도 틀리면 lines는 null */
export function readQuote(rows: QuoteRow[]): { lines: QuoteLine[] | null; errors: Record<string, RowError> } {
  const errors: Record<string, RowError> = {};
  const lines: QuoteLine[] = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label && !r.amount.trim()) continue;
    const amountWon = parseWon(r.amount);
    if (!label || label.length > 60) errors[r.key] = 'label';
    else if (amountWon === null || amountWon === 0) errors[r.key] = 'amount';
    else lines.push({ label, amountWon });
  }
  const ok = !Object.keys(errors).length && lines.length > 0 && lines.length <= MAX_ROWS;
  return { lines: ok ? lines : null, errors };
}
