import { describe, expect, it } from "vitest";
import { applyQuotePatch, buildQuoteBody, parseWonInput, quoteContext, quoteDraftFromBrief, quoteSubmittedNow, type DanchuQuoteBrief } from "../src/danchuQuote";

const BRIEF: DanchuQuoteBrief = {
  no: "DC-2026-0142",
  state: "open",
  closedReason: null,
  request: {
    full: true,
    substance: "후보물질 A",
    categories: ["일반독성"],
    overview: [["의뢰 목적", "IND"]],
    rows: [
      { seq: 1, category: "일반독성", name: "랫드 4주 반복투여독성", cond: "경구" },
      { seq: 2, category: "일반독성", name: "TK 분석", cond: "" },
      { seq: 3, category: "효력", name: "대장염(DSS) 효력시험", cond: "" },
    ],
    common: [["시험 투여경로", "경구"]],
    situation: [],
    ask: ["회복군 운영 방식"],
    replyBy: "2026-11-30",
    authorities: ["식약처"],
    translation: false,
    files: [],
  },
  draft: {
    status: "draft",
    prefilled: true,
    items: [
      { seq: 1, avail: "가능", amount: "48500000", weeks: "14", source: "catalog", design: { route: "경구" } },
      { seq: 2, avail: "가능", amount: "6200000", weeks: "6", source: "catalog" },
    ],
    note: "",
    common: { validUntil: "", startDate: "", payTerms: "", substanceQty: "", reportLang: "", includes: ["QA 점검"] },
    steps: [],
    pdfName: "",
  },
};

describe("단추 견적 초안", () => {
  it("요청서 항목 순서대로, 초안에 없는 항목은 빈 칸. 단추가 금액을 준 항목만 priced", () => {
    const d = quoteDraftFromBrief(BRIEF);
    expect(d.items.map((i) => i.seq)).toEqual([1, 2, 3]);
    expect(d.items[2]).toMatchObject({ seq: 3, avail: "", amount: "" });
    expect(d.priced).toEqual([1, 2]);
    expect(d.items[0]!.design).toEqual({ route: "경구" });
  });

  it("AI 제안은 가능 여부·기간·사유·조건·전달 사항만. 금액·없는 항목·틀린 값은 버린다", () => {
    const d = quoteDraftFromBrief(BRIEF);
    const { draft, changed } = applyQuotePatch(d, {
      items: [
        { seq: 3, avail: "조건부 가능", weeks: "10", reason: "모델 확인 필요" },
        { seq: 9, avail: "가능" },
        { seq: 1, weeks: "열네" },
        { seq: 2, amount: "1" } as never,
      ],
      common: { startDate: "2026-12-01", validUntil: "12월 말", reportLang: "중국어" },
      note: "회복군은 4주 운영해요. 총액은 5천만 원이에요.",
    });
    expect(changed).toBe(5);
    expect(draft.version).toBe(2);
    expect(draft.items[2]).toMatchObject({ avail: "조건부 가능", weeks: "10", reason: "모델 확인 필요" });
    expect(draft.items[0]!.weeks).toBe("14");
    expect(draft.items[1]!.amount).toBe("6200000");
    expect(draft.common).toMatchObject({ startDate: "2026-12-01", validUntil: "", reportLang: "" });
    // 금액이 든 문장은 빠진다
    expect(draft.note).toBe("회복군은 4주 운영해요.");
  });

  it("제출한 판 뒤에 고치면 다시 제출할 것으로 본다", () => {
    const d = { ...quoteDraftFromBrief(BRIEF), submittedVersion: 1 };
    expect(quoteSubmittedNow(d)).toBe(true);
    expect(quoteSubmittedNow(applyQuotePatch(d, { note: "회복군 4주" }).draft)).toBe(false);
  });

  it("단추 저장값의 null 은 다시 보낼 수 있는 모양으로 맞춘다", () => {
    const b = { ...BRIEF, draft: { ...BRIEF.draft!, items: [{ seq: 1, avail: null, amount: null, weeks: null, reason: null } as never] } };
    const d = quoteDraftFromBrief(b);
    expect(d.items[0]).toEqual({ seq: 1, avail: "", amount: "", weeks: "" });
    expect(d.priced).toEqual([]);
  });

  it("바뀐 것이 없으면 판을 올리지 않는다", () => {
    const d = quoteDraftFromBrief(BRIEF);
    expect(applyQuotePatch(d, { items: [{ seq: 1, avail: "가능" }] })).toEqual({ draft: d, changed: 0 });
  });

  it("본문: 단추 금액 + 담당자 입력, 불가는 금액 없음, 부가세 없이 합계", () => {
    const d = applyQuotePatch(quoteDraftFromBrief(BRIEF), { items: [{ seq: 3, avail: "조건부 가능", weeks: "10" }], common: { startDate: "2026-12-01" } }).draft;
    const miss = buildQuoteBody(d, {}, true);
    expect(miss).toEqual({ ok: false, missingAmount: [3], missingAvail: [], missingStart: false });
    const ok = buildQuoteBody(d, { 3: "32,000,000", 1: "1" }, true);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.total).toBe(86_700_000);
    expect(ok.body.items.map((i) => i.amount)).toEqual(["48500000", "6200000", "32000000"]);
    expect(ok.body.items[0]!.design).toEqual({ route: "경구" });
    expect(ok.body.common.includes).toEqual(["QA 점검"]);
    const no = applyQuotePatch(d, { items: [{ seq: 3, avail: "불가" }] }).draft;
    const b = buildQuoteBody(no, {}, true);
    expect(b.ok && b.body.items[2]!.amount).toBe("");
    expect(b.ok && b.total).toBe(54_700_000);
  });

  it("제출은 가능 여부·착수 가능일이 있어야 하고, 임시 저장은 빈 칸을 허용한다", () => {
    const d = quoteDraftFromBrief(BRIEF);
    expect(buildQuoteBody(d, {}, true)).toMatchObject({ ok: false, missingAvail: [3], missingStart: true });
    expect(buildQuoteBody(d, {}, false).ok).toBe(true);
  });

  it("입력 금액은 숫자만", () => {
    expect(parseWonInput("3,200만")).toBe(3200);
    expect(parseWonInput("없음")).toBeNull();
    expect(parseWonInput("1".repeat(14))).toBeNull();
  });

  it("모델 맥락에는 금액 숫자가 없다", () => {
    const text = quoteContext(quoteDraftFromBrief(BRIEF));
    expect(text).not.toMatch(/48500000|6200000|4,850/);
    expect(text).toContain("단추 금액 있음");
    expect(text).toContain("3. 대장염(DSS) 효력시험 | 가능 여부: 미정");
  });
});
