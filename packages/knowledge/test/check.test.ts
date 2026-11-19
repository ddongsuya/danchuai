import { describe, expect, it } from "vitest";
import { checkAnswer, DOCS, issueNote, numbersIn, retrieve } from "../src/index";
import type { Hit } from "../src/search";

const hit = (doc: string, text: string): Hit => ({ id: `${doc}-0`, doc, section: "s", text, score: 10 });
const docs = [{ short: "ICH M3" }, { short: "식약처 독성시험기준" }, { short: "식약처 의약품등의 독성시험기준 해설서", license: "스캔본을 OCR로 읽은 글" }];

describe("numbersIn", () => {
  it("문서 이름·별표 번호 속 숫자는 빼고 쉼표 자리 표시를 없앤다", () => {
    expect(numbersIn("ICH M3 기준 2,000 mg/kg, 식약처 독성시험기준 별표2", ["식약처 독성시험기준"])).toEqual(["2000"]);
  });
});

describe("checkAnswer", () => {
  const hits = [
    hit("ICH M3", "Table 1. Up to 2 weeks ... two mammalian species ... Phase III trials ... 1,000 mg/kg"),
    hit("식약처 독성시험기준", "반복투여독성시험 ... 4주 ... 13주"),
  ];
  it("원문 조각에 있는 숫자(낱말·로마 숫자·쉼표 포함)는 통과", () => {
    const t = "임상 2주까지는 반복투여 2주 시험으로 돼요(근거: ICH M3 Table 1). 동물은 2종이고 3상 전 1000 mg/kg이 상한이에요. (근거: ICH M3 5.1)";
    expect(checkAnswer(t, hits, docs)).toEqual([]);
  });
  it("원문에 없는 숫자를 잡는다", () => {
    const t = "국내 기준은 28일 반복투여예요(근거: 식약처 독성시험기준 별표2).";
    const r = checkAnswer(t, hits, docs);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "number_not_in_source", numbers: ["28"] });
  });
  it("받지 않은 문서를 근거로 붙이면 잡는다", () => {
    const r = checkAnswer("유전독성은 2종 배터리예요(근거: ICH S2 2.1).", hits, [...docs, { short: "ICH S2" }]);
    expect(r[0]).toMatchObject({ kind: "unknown_source", doc: "ICH S2" });
  });
  it("모르는 문서 이름도 잡는다", () => {
    const r = checkAnswer("기간은 4주예요(근거: OECD TG 407).", hits, docs);
    expect(r[0]).toMatchObject({ kind: "unknown_source", doc: "OECD TG 407" });
  });
  it("스캔본 문서 근거는 원본 확인 필요로 표시", () => {
    const r = checkAnswer("4주예요(근거: 식약처 의약품등의 독성시험기준 해설서 3.1).", [hit("식약처 의약품등의 독성시험기준 해설서", "4주")], docs);
    expect(r.map((i) => i.kind)).toEqual(["ocr_source"]);
    expect(issueNote(r)).toContain("원본 확인 필요");
  });
  it("문제가 없으면 안내 글도 없다", () => {
    expect(issueNote([])).toBe("");
  });
});

describe("실제 조각으로 검사", () => {
  it("M3 반복투여 질문: 조각 숫자로 쓴 답은 통과, 바꾼 숫자는 잡는다", () => {
    const r = retrieve("임상 1상 2주 투여 전에 필요한 반복투여독성시험 기간");
    const m3 = r.hits.find((h) => h.doc === "ICH M3");
    expect(m3).toBeTruthy();
    const ok = `2주 임상까지는 설치류·비설치류 2주 반복투여로 돼요(근거: ICH M3 ${m3!.section}).`;
    const bad = `2주 임상까지는 설치류·비설치류 17주 반복투여로 돼요(근거: ICH M3 ${m3!.section}).`;
    expect(checkAnswer(ok, r.hits, DOCS)).toEqual([]);
    expect(checkAnswer(bad, r.hits, DOCS)[0]).toMatchObject({ kind: "number_not_in_source", numbers: ["17"] });
  });
});

describe("가운뎃점이 든 문서 이름", () => {
  it("문서 이름 속 · 로 나누지 않는다", () => {
    const d = [{ short: "식약처 세포·유전자치료제 초기 임상시험 디자인 가이드라인" }];
    const h = [hit(d[0]!.short, "3.3 비임상")];
    expect(checkAnswer("고려해요(근거: 식약처 세포·유전자치료제 초기 임상시험 디자인 가이드라인 3.3).", h, d)).toEqual([]);
  });
});
