import { EMPTY_SHEET, type ToolCall } from "@danchuai/core";
import { retrieve } from "@danchuai/knowledge";
import { describe, expect, it } from "vitest";
import { interpret, matchBasis } from "../src/agent/interpret";
import type { Conversation, Question } from "../src/agent/store";

const conv = (sheet: Partial<Conversation["sheet"]> = {}): Conversation => ({
  id: "c1", orgId: "o1", createdBy: "u1", role: "requester", mode: "request", requestId: null, danchuNo: null, quote: null,
  sheet: { ...EMPTY_SHEET, ...sheet }, messages: [], question: null, summary: null, draft: null, turns: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
});
const ask = (input: Record<string, unknown>): ToolCall => ({ id: "q", name: "ask_question", input });
const question = (r: ReturnType<typeof interpret>) => r.events.find((e) => e.event === "question")?.data as Question | undefined;

describe("질문 카드 선택지", () => {
  it("이름과 달라지는 것을 받고, 글자만 온 선택지는 이름으로 바꾼다", () => {
    const r = interpret(conv(), [ask({ field: "clinicalPlan", question: "임상 기간은요?", options: [{ label: "2주 이내", effect: "반복투여독성 2주" }, "3개월 이내"] })]);
    expect(question(r)!.options).toEqual([{ label: "2주 이내", effect: "반복투여독성 2주" }, { label: "3개월 이내" }]);
  });

  it("미정·모르겠어요는 카드가 붙이니 뺀다", () => {
    const r = interpret(conv(), [ask({ field: "priorStudies", question: "끝낸 시험은요?", options: ["아직 없음", { label: "모르겠어요" }, "미정"] })]);
    expect(question(r)!.options.map((o) => o.label)).toEqual(["아직 없음"]);
  });

  it("선택지가 미정뿐이면 질문을 내지 않는다", () => {
    const r = interpret(conv(), [ask({ field: "priorStudies", question: "끝낸 시험은요?", options: ["미정", "모르겠어요"] })]);
    expect(question(r)).toBeUndefined();
  });

  it("달라지는 것이 24자를 넘으면 받지 않는다", () => {
    const r = interpret(conv(), [ask({ field: "route", question: "경로는요?", options: [{ label: "경구", effect: "가".repeat(25) }, "정맥"] })]);
    expect(question(r)).toBeUndefined();
    expect(r.events.some((e) => e.event === "notice")).toBe(true);
  });
});

describe("어긋난 칸 다시 묻기", () => {
  it("채운 칸은 recheck일 때만 다시 묻는다", () => {
    const filled = conv({ testType: "반복투여독성 4주" });
    expect(question(interpret(filled, [ask({ field: "testType", question: "기간은요?", options: ["4주 그대로", "13주로 바꾸기"] })]))).toBeUndefined();
    const q = question(interpret(filled, [ask({ field: "testType", question: "기간은요?", options: ["4주 그대로", "13주로 바꾸기"], recheck: true })]));
    expect(q?.recheck).toBe(true);
  });

  it("빈 칸 질문에는 recheck 표시를 붙이지 않는다", () => {
    const q = question(interpret(conv(), [ask({ field: "route", question: "경로는요?", options: ["경구", "정맥"], recheck: true })]));
    expect(q?.recheck).toBeUndefined();
  });
});

describe("질문 근거", () => {
  const evidence = retrieve("clinical trial duration repeated dose toxicity ICH M3");

  it("참고자료에 있는 문서·조항만 받고 원문 앞부분을 붙인다", () => {
    const src = evidence.sources.find((s) => s.doc === "ICH M3")!;
    expect(src).toBeTruthy();
    const no = src.section.split(" ")[0]!;
    const basis = matchBasis([`ICH M3 ${no}`, "ICH S9 4.1", "식약처 없는 조항"], evidence);
    expect(basis).toHaveLength(1);
    expect(basis[0]!.doc).toBe("ICH M3");
    expect(basis[0]!.section).toBe(src.section);
    expect(basis[0]!.excerpt.length).toBeGreaterThan(0);
    expect(basis[0]!.excerpt.length).toBeLessThanOrEqual(221);
  });

  it("조항 번호는 낱말 단위로 맞춘다(5.1을 5장으로 잡지 않는다)", () => {
    const evidence = retrieve("clinical trial duration repeated dose toxicity ICH M3");
    const basis = matchBasis(["ICH M3 5.1"], evidence);
    for (const b of basis) expect(b.section.split(/\s+/)[0]).toBe("5.1");
    const chapter = evidence.sources.find((s) => s.doc === "ICH M3" && /^5\.\s/.test(s.section));
    if (chapter) expect(matchBasis(["ICH M3 5.1"], evidence).some((b) => b.section === chapter.section)).toBe(false);
  });

  it("참고자료가 없으면 근거를 붙이지 않는다", () => {
    expect(matchBasis(["ICH M3 5.1"])).toEqual([]);
    const q = question(interpret(conv(), [ask({ field: "clinicalPlan", question: "임상 기간은요?", options: ["2주 이내", "3개월 이내"], basis: ["ICH M3 5.1"] })]));
    expect(q?.basis).toBeUndefined();
  });
});
