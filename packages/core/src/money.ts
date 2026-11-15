// 금액은 항상 원 단위 정수로 다룬다. AI가 쓴 금액은 쓰지 않고, 이 함수로만 계산한다.

export interface QuoteLine {
  label: string;
  /** 원 단위 정수 */
  amountWon: number;
}

export interface QuoteTotals {
  subtotalWon: number;
  vatWon: number;
  totalWithVatWon: number;
}

export function assertWon(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field}: 0 이상의 원 단위 정수여야 해요 (${value})`);
  }
}

export function computeTotals(lines: readonly QuoteLine[], vatRate = 0.1): QuoteTotals {
  let subtotalWon = 0;
  lines.forEach((line, i) => {
    assertWon(line.amountWon, `lines[${i}].amountWon`);
    subtotalWon += line.amountWon;
  });
  if (!Number.isSafeInteger(subtotalWon)) throw new RangeError("합계가 너무 커요");
  const vatWon = Math.round(subtotalWon * vatRate);
  return { subtotalWon, vatWon, totalWithVatWon: subtotalWon + vatWon };
}

/** 1억 2,400만 / 8,600만 / 3,500원 처럼 한국식으로 줄여 쓴다. 만 원 미만이 있으면 원까지 적는다. */
export function formatWonShort(won: number): string {
  assertWon(won, "won");
  if (won === 0) return "0원";
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  const rest = won % 10_000;
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest) parts.push(`${rest.toLocaleString("ko-KR")}원`);
  return parts.join(" ");
}
