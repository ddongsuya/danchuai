import { describe, expect, it } from "vitest";
import { DOCS, retrieve } from "../src/index";
import guidelines from "../data/guidelines.json" with { type: "json" };
import { ANSWER_SET } from "./answer-set";

const chunks = guidelines.chunks as { doc: string; text: string }[];
const known = new Set(DOCS.map((d) => d.short));

describe("답 평가 세트의 정답 근거", () => {
  for (const c of ANSWER_SET) {
    it(c.q, () => {
      for (const d of c.cite) expect(known.has(d), d).toBe(true);
      for (const p of c.proof) expect(chunks.some((x) => x.doc === p.doc && p.re.test(x.text)), `${p.doc} ${p.re}`).toBe(true);
    });
  }
  it("근거가 있는 질문은 검색이 근거 문서를 찾아온다(80% 이상)", () => {
    const withCite = ANSWER_SET.filter((c) => c.cite.length);
    const misses = withCite.filter((c) => !retrieve(c.q).hits.some((h) => c.cite.includes(h.doc)));
    expect(1 - misses.length / withCite.length, misses.map((m) => m.q).join("\n")).toBeGreaterThanOrEqual(0.8);
  });
});
