import { describe, expect, it } from "vitest";
import { citedSources, contextBlock, DOCS, REFERENCE, referenceBlock, retrieve, tokenize } from "../src/index";
import { EVAL } from "./eval-set";

describe("tokenize", () => {
  it("한글은 두 글자씩, 영어는 단어로 자른다", () => {
    expect(tokenize("유전독성 genotoxicity tests")).toEqual(["genotoxicity", "test", "유전", "전독", "독성"]);
  });
});

describe("retrieve 정확도 질문 세트", () => {
  const results = EVAL.map((e) => {
    const want = typeof e.doc === "string" ? [e.doc] : e.doc;
    const got = retrieve(e.q).hits.map((h) => h.doc);
    return { q: e.q, want, got, ok: got.some((d) => want.includes(d)) };
  });
  const rate = results.filter((r) => r.ok).length / results.length;

  it("상위 근거에 정답 문서가 들어오는 비율 90% 이상", () => {
    const misses = results.filter((r) => !r.ok).map((r) => `${r.q} → ${r.got.join(", ")}`);
    expect(rate, misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  it("관계없는 질문엔 근거를 넘기지 않는다", () => {
    expect(retrieve("오늘 점심 메뉴 추천").hits).toHaveLength(0);
  });
});

describe("근거 블록과 인용", () => {
  it("문서 이름으로 묶고, 답이 인용한 문서의 출처만 돌려준다", () => {
    const r = retrieve("유전독성 표준 시험 조합");
    expect(contextBlock(r)).toMatch(/^<참고자료>\n<조각 문서="/);
    expect(contextBlock(r)).toContain('<조각 문서="ICH S2"');
    const used = citedSources("표준 조합은 세 가지예요(근거: ICH S2 2.2). 다시 ICH S2.", r.sources);
    expect(used.map((s) => s.doc)).toEqual(["ICH S2"]);
    expect(used[0]!.url).toMatch(/^https:\/\//);
  });
});

describe("원문 범위와 저작권", () => {
  it("OECD 원문은 싣지 않는다", () => {
    for (const d of DOCS.filter((x) => x.by === "OECD")) expect(d.chunks).toBe(0);
  });
  it("ICH 조각은 ICH 저작권 표기를 단다", () => {
    for (const d of DOCS.filter((x) => x.by === "ICH" && x.chunks > 0)) expect(d.license).toMatch(/© ICH/);
  });
});

describe("단추 공개 기준 자료", () => {
  it("요청서 15분야와 시험 묶음 7개, 효력 영역이 있다", () => {
    expect(REFERENCE.categories).toHaveLength(15);
    expect(REFERENCE.packages).toHaveLength(7);
    expect(REFERENCE.efficacy.areas.length).toBeGreaterThan(10);
  });
  it("원문과 어긋난 묶음 항목은 고쳐 둔다", () => {
    const text = referenceBlock();
    expect(text).not.toMatch(/경피·피부[^\n]*TG 420/);
    expect(text).not.toMatch(/바이오의약품 IND[\s\S]*?ICH S8 면역독성[\s\S]*?<\/시험 묶음>/);
    expect(REFERENCE.corrections.length).toBeGreaterThan(0);
  });
  it("기관 단가·회원 자료는 들어 있지 않다", () => {
    const all = JSON.stringify(REFERENCE);
    expect(all).not.toMatch(/std_price|amountWon|price|단가|@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
