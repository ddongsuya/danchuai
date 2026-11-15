import { describe, expect, it } from "vitest";
import { checkSentence, filterSentences } from "../src/guard";

describe("문장 점검", () => {
  it.each([
    "기관 C를 추천드려요.",
    "가장 저렴한 곳은 기관 E예요.",
    "1위는 기관 A예요.",
    "최저가 기관이에요.",
  ])("AC-09 추천·순위 문장을 잡는다: %s", (s) => {
    expect(checkSentence(s).map((i) => i.kind)).toContain("ranking");
  });

  it.each(["총액은 1억 2,400만 원이에요.", "₩86,000,000", "8,600만 정도예요."])(
    "AC-06 AI가 쓴 금액을 잡는다: %s",
    (s) => {
      expect(checkSentence(s).map((i) => i.kind)).toContain("money");
    },
  );

  it("AC-07 연락처를 잡는다", () => {
    expect(checkSentence("담당자 메일은 kim@example.com 이에요.").map((i) => i.kind)).toContain("contact");
    expect(checkSentence("010-1234-5678로 연락 주세요.").map((i) => i.kind)).toContain("contact");
  });

  it("평범한 업무 문장은 통과한다", () => {
    expect(checkSentence("반복투여 4주 시험에 회복군을 넣을까요?")).toEqual([]);
    expect(checkSentence("희망 착수는 2027년 2월이에요.")).toEqual([]);
    expect(checkSentence("유전독성 3종과 hERG를 넣었어요.")).toEqual([]);
  });

  it("걸린 문장만 빼고 나머지는 남긴다", () => {
    const r = filterSentences("제형이 비어 있어요. 기관 C를 추천드려요. 용매 후보가 있으면 알려 주세요.");
    expect(r.kept).toEqual(["제형이 비어 있어요.", "용매 후보가 있으면 알려 주세요."]);
    expect(r.dropped).toHaveLength(1);
  });

  it("'필요 없어요'처럼 문장 중간의 '요'에서 자르지 않는다", () => {
    const r = filterSentences("회복군은 필요 없어요. 다음 단계로 가요.");
    expect(r.kept).toEqual(["회복군은 필요 없어요.", "다음 단계로 가요."]);
  });
});
