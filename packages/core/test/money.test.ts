import { describe, expect, it } from "vitest";
import { computeTotals, formatWonShort } from "../src/money";

describe("computeTotals", () => {
  it("항목 합계와 부가세를 원 단위 정수로 계산한다", () => {
    const t = computeTotals([
      { label: "반복투여 4주", amountWon: 86_000_000 },
      { label: "유전독성 3종", amountWon: 21_000_000 },
      { label: "hERG", amountWon: 9_000_000 },
      { label: "조제물 분석", amountWon: 8_000_000 },
    ]);
    expect(t).toEqual({ subtotalWon: 124_000_000, vatWon: 12_400_000, totalWithVatWon: 136_400_000 });
  });
  it("음수·소수·NaN 금액은 거부한다", () => {
    expect(() => computeTotals([{ label: "x", amountWon: -1 }])).toThrow(RangeError);
    expect(() => computeTotals([{ label: "x", amountWon: 1.5 }])).toThrow(RangeError);
    expect(() => computeTotals([{ label: "x", amountWon: Number.NaN }])).toThrow(RangeError);
  });
  it("빈 견적은 0원", () => {
    expect(computeTotals([]).subtotalWon).toBe(0);
  });
});

describe("formatWonShort", () => {
  it.each([
    [124_000_000, "1억 2,400만"],
    [86_000_000, "8,600만"],
    [100_000_000, "1억"],
    [35_000, "3만 5,000원"],
    [0, "0원"],
  ])("%d → %s", (won, out) => {
    expect(formatWonShort(won)).toBe(out);
  });
});
