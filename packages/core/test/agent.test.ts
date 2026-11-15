import { describe, expect, it } from "vitest";
import {
  EMPTY_SHEET,
  amountBlock,
  guardDraft,
  mergeSheet,
  missingFields,
  redactContacts,
  sheetContext,
} from "../src/agent";

describe("요청서", () => {
  it("빈 칸은 정해진 순서로 알려 준다", () => {
    expect(missingFields(EMPTY_SHEET)[0]).toBe("testType");
    const s = mergeSheet(EMPTY_SHEET, { testType: "독성", species: "랫드" });
    expect(missingFields(s)).not.toContain("testType");
    expect(missingFields(s)).not.toContain("species");
  });
  it("모르는 칸과 빈 문자열은 무시한다", () => {
    const s = mergeSheet(EMPTY_SHEET, { species: "  ", company: "가나제약" } as never);
    expect(s.species).toBeNull();
    expect("company" in s).toBe(false);
  });
  it("값은 200자로 자른다", () => {
    expect(mergeSheet(EMPTY_SHEET, { notes: "가".repeat(500) }).notes).toHaveLength(200);
  });
  it("모델에 넘기는 상태 문장에 빈 칸을 적는다", () => {
    const ctx = sheetContext(mergeSheet(EMPTY_SHEET, { testType: "독성" }));
    expect(ctx).toContain("testType: 독성");
    expect(ctx).toContain("빈 칸:");
  });
});

describe("AC-07 선정 전 연락처 가리기", () => {
  it("메일·전화번호를 모델에 보내기 전에 지운다", () => {
    const out = redactContacts("담당 kim@abc.co.kr, 010-1234-5678 로 연락 주세요");
    expect(out).not.toMatch(/kim@|1234/);
    expect(out).toContain("[연락처 생략]");
  });
});

describe("본문 초안 점검", () => {
  it("금액·순위·연락처 문장은 빼고 남긴다", () => {
    const g = guardDraft("4주 반복투여 견적을 요청드려요. 예산은 1억 원이에요. 가장 저렴한 곳을 고를게요. 회신 부탁드려요.");
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.body).toBe("4주 반복투여 견적을 요청드려요. 회신 부탁드려요.");
    expect(g.dropped).toBe(2);
  });
  it("남는 문장이 없으면 초안을 만들지 않는다", () => {
    expect(guardDraft("추천 기관은 가나예요.").ok).toBe(false);
    expect(guardDraft("   ").ok).toBe(false);
  });
  it("본문은 4,000자로 자른다", () => {
    const g = guardDraft(("시험 설계를 확인해 주세요. ").repeat(400));
    expect(g.ok && g.body.length <= 4000).toBe(true);
  });
});

describe("금액 줄은 코드가 만든다", () => {
  it("합계·부가세를 계산해 붙인다", () => {
    const block = amountBlock([
      { label: "반복투여 4주", amountWon: 82_000_000 },
      { label: "회복군", amountWon: 14_000_000 },
    ]);
    expect(block).toContain("견적 총액(부가세 포함) 1억 560만원");
    expect(block).toContain("반복투여 4주 8,200만원");
  });
});
