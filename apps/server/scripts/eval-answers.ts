// 가이드라인 답 평가: 질문 세트(packages/knowledge/test/answer-set.ts)를 실제 모델로 답하게 하고 자동 채점한다.
// 실행: npm run eval:answers -w @danchuai/server > answers.md
// 채점: 정답 사실(must) · 틀린 말 없음(mustNot) · 근거 문서 표기(cite) · 원문 대조 검사(checkAnswer) 문제 0.
// 키는 DANCHUAI_EVAL_KEY를 먼저 쓰고, 없으면 ANTHROPIC_API_KEY. 키가 없으면 멈춘다. 답 글은 표준 출력으로만 내보낸다.
import { checkAnswer, contextBlock, DOCS, issueNote, retrieveMany } from "@danchuai/knowledge";
import { ANSWER_SET } from "../../../packages/knowledge/test/answer-set";
import { ASK_SYSTEM } from "../src/agent/prompts";
import { searchQueries } from "../src/agent/searchQueries";
import { providerFromEnv } from "../src/providers";

async function main() {
  const env = { ...process.env };
  if (env.DANCHUAI_EVAL_KEY) env.ANTHROPIC_API_KEY = env.DANCHUAI_EVAL_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  const provider = providerFromEnv(env);
  if (!provider) {
    console.error("평가용 키가 없어요(DANCHUAI_EVAL_KEY 또는 ANTHROPIC_API_KEY). 평가를 멈춰요.");
    process.exit(2);
  }
  console.log(`# 가이드라인 답 평가\n\n모델: ${provider.model}\n`);
  let pass = 0;
  let found = 0;
  for (const c of ANSWER_SET) {
    // 서비스와 같은 순서: 검색어 만들기 → 합친 검색 → 답
    const search = await searchQueries(provider, c.q);
    const evidence = retrieveMany([c.q, ...search.queries]);
    const reached = c.proof.some((p) => evidence.hits.some((h) => h.doc === p.doc && p.re.test(h.text)));
    let text = "";
    try {
      const r = await provider.complete({
        system: ASK_SYSTEM,
        messages: [{ role: "user", content: `${c.q}\n\n${contextBlock(evidence)}` }],
        maxTokens: 1200,
      });
      text = r.text;
    } catch (err) {
      console.log(`## ✗ ${c.q}\n\n호출 실패: ${(err as { status?: number }).status ?? "unknown"}\n`);
      continue;
    }
    const issues = checkAnswer(text, evidence.hits, DOCS);
    const fails: string[] = [];
    for (const re of c.must) if (!re.test(text)) fails.push(`빠진 말 ${re}`);
    for (const re of c.mustNot ?? []) if (re.test(text)) fails.push(`틀린 말 ${re}`);
    if (c.cite.length && !c.cite.some((d) => text.includes(`근거: ${d}`) || new RegExp(`근거:[^)]*${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text))) fails.push(`근거 문서 없음(${c.cite.join(" 또는 ")})`);
    if (issues.some((i) => i.kind !== "ocr_source")) fails.push("원문 대조 문제");
    if (c.proof.length && reached) found++;
    if (!fails.length) pass++;
    console.log(`## ${fails.length ? "✗" : "✓"} ${c.q}\n\n${text.trim()}\n${issues.length ? `\n${issueNote(issues)}\n` : ""}${fails.length ? `\n채점: ${fails.join(" / ")}\n` : ""}\n검색어: ${search.queries.join(" / ") || "(없음)"} · 정답 조각 전달: ${c.proof.length ? (reached ? "예" : "아니오") : "해당 없음"}\n`);
  }
  console.log(`\n**결과: ${pass}/${ANSWER_SET.length}** · 정답 조각이 모델에 전달된 질문 ${found}/${ANSWER_SET.filter((c) => c.proof.length).length}`);
}

void main();
