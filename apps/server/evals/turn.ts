// promptfoo exec 공급자: 운영 서버와 같은 한 턴을 실제 모델로 한 번 돌리고, 사용자에게 보이는 것만 표준 출력으로 낸다.
// promptfoo가 넘기는 첫 인자(프롬프트)는 {"mode":"ask|request","role":"requester|cro","text":"..."} JSON이다.
// 키는 eval-intake.ts와 같다: DANCHUAI_EVAL_KEY를 먼저, 없으면 ANTHROPIC_API_KEY. 대화 내용은 파일로 남기지 않는다.
import { EMPTY_SHEET, redactContacts, retrievalQuery, sheetContext } from "@danchuai/core";
import { contextBlock, retrieve } from "@danchuai/knowledge";
import { runToolTurn } from "../src/agent/repair";
import { ASK_SYSTEM, SYSTEM } from "../src/agent/prompts";
import type { Conversation, Question } from "../src/agent/store";
import type { Role } from "../src/agent/tools";
import { TOOLS } from "../src/agent/tools";
import { providerFromEnv } from "../src/providers";

interface Input {
  mode: "ask" | "request";
  role: Role;
  text: string;
}

async function main() {
  const input = JSON.parse(process.argv[2] ?? "{}") as Input;
  const env: Record<string, string | undefined> = { ...process.env };
  if (env.DANCHUAI_EVAL_KEY) env.ANTHROPIC_API_KEY = env.DANCHUAI_EVAL_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  const provider = providerFromEnv(env);
  if (!provider) {
    console.error("평가용 키가 없어요(DANCHUAI_EVAL_KEY 또는 ANTHROPIC_API_KEY).");
    process.exit(2);
  }

  const conv: Conversation = {
    id: "eval-safety", orgId: "eval", createdBy: "eval", role: input.role, mode: input.mode, requestId: null,
    danchuNo: null, quote: null, sheet: { ...EMPTY_SHEET }, messages: [], question: null, summary: null, draft: null, turns: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  // 운영 서버처럼 모델에 가기 전에 연락처를 지운다.
  const user = redactContacts(input.text);

  if (input.mode === "ask") {
    const evidence = retrieve(user);
    const r = await provider.complete({ system: ASK_SYSTEM, messages: [{ role: "user", content: `${user}\n\n${contextBlock(evidence)}` }], maxTokens: 1500 });
    process.stdout.write(r.text.trim());
    return;
  }

  const evidence = retrieve(retrievalQuery(user, conv.sheet));
  const result = await runToolTurn({
    provider,
    conv,
    request: {
      system: SYSTEM[input.role],
      messages: [{ role: "user", content: `${user}\n\n${sheetContext(conv.sheet)}\n\n${contextBlock(evidence)}` }],
      tools: TOOLS[input.role],
      maxTokens: 1500,
    },
    evidence,
  });
  // 사용자가 보게 되는 것: 답 글, 질문·선택지, 요약, 본문 초안
  const out = [result.text, ...result.notes];
  for (const e of result.events) {
    if (e.event === "question") {
      const q = e.data as Question;
      out.push(`[질문] ${q.question}`, `[선택지] ${q.options.map((o) => (o.effect ? `${o.label}(${o.effect})` : o.label)).join(" / ")}`);
    } else if (e.event === "summary") out.push(`[요약] ${JSON.stringify(e.data)}`);
    else if (e.event === "draft") out.push(`[본문] ${(e.data as { body?: string }).body ?? JSON.stringify(e.data)}`);
  }
  process.stdout.write(out.filter(Boolean).join("\n"));
}

main().catch((e: unknown) => {
  console.error("eval_turn_failed", e instanceof Error ? e.name : "unknown");
  process.exit(1);
});
