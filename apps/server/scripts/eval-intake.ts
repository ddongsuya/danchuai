// 견적 요청 유도 평가: 상황 10개를 실제 모델로 돌리고, 정해 둔 기준으로 자동 채점한다.
// 실행: ANTHROPIC_API_KEY=... npx tsx scripts/eval-intake.ts [시나리오 번호...] > eval.md
// 키가 없으면 멈춘다. 대화 기록은 표준 출력(마크다운)으로만 내보내고 로그 파일에 남기지 않는다.
import {
  EMPTY_SHEET,
  missingFields,
  redactContacts,
  retrievalQuery,
  sheetContext,
  SITUATION_FIELDS,
  type AgentMessage,
  type SheetField,
} from "@danchuai/core";
import { contextBlock, retrieve } from "@danchuai/knowledge";
import { interpret } from "../src/agent/interpret";
import { SYSTEM } from "../src/agent/prompts";
import type { Conversation } from "../src/agent/store";
import { TOOLS } from "../src/agent/tools";
import { providerFromEnv } from "../src/providers";

interface Scenario {
  id: number;
  name: string;
  /** 사용자 말. 앞 턴의 질문과 상관없이 정해 둔 순서로 보낸다(같은 조건으로 다시 돌리기 위해). */
  turns: string[];
  /** 첫 질문으로 괜찮은 칸. 비우면 검사하지 않는다. */
  firstAsk?: SheetField[];
  /** 첫 답에 (근거: …)가 있어야 하는지 */
  cite?: boolean;
  /** 몇 번째 턴 답에서 어긋남을 짚어야 하는지(0부터)와 그 말 */
  mismatch?: { turn: number; pattern: RegExp };
  /** 첫 턴 뒤 요청서에 들어가 있어야 하는 값 */
  sheetAfterFirst?: Partial<Record<SheetField, RegExp>>;
}

const SCENARIOS: Scenario[] = [
  {
    id: 1, name: "IND 합성의약품",
    turns: ["IND 제출 목적으로 합성의약품 독성시험 견적 받고 싶어요", "1상은 건강인 대상 2주 반복 투여 예정이에요", "아직 아무 시험도 안 했어요"],
    firstAsk: ["clinicalPlan", "priorStudies"], cite: true,
    sheetAfterFirst: { modality: /합성|저분자/, purpose: /IND|임상/ },
  },
  {
    id: 2, name: "항체 바이오 1상",
    turns: ["항체 치료제 1상 들어가려고 비임상 견적 알아보고 있어요", "1상은 3개월 반복 투여 계획이에요", "교차 반응 확인은 아직이에요"],
    firstAsk: ["clinicalPlan", "priorStudies", "species"], cite: true,
    sheetAfterFirst: { modality: /항체|바이오/ },
  },
  {
    id: 3, name: "시험을 정해 온 경우",
    turns: ["랫드 4주 반복투여 독성시험 견적 받고 싶어요", "경구로요", "GLP로 해 주세요"],
    firstAsk: ["substance", "route", "glp", "dueDate", "duration"],
    sheetAfterFirst: { species: /랫드/, testType: /반복/ },
  },
  {
    id: 4, name: "임상 기간과 어긋난 요청",
    turns: ["합성의약품 IND용 독성시험 견적이요. 1상은 3개월 반복 투여 예정이에요", "반복투여는 4주로 해 주세요"],
    cite: true, mismatch: { turn: 1, pattern: /3개월|13주|짧|맞지|부족/ },
  },
  {
    id: 5, name: "건강기능식품 개별인정",
    turns: ["건강기능식품 개별인정형 원료로 신청하려는데 독성시험 견적 받고 싶어요", "식품으로 먹은 경험은 없는 새 원료예요"],
    firstAsk: ["priorStudies", "substance", "clinicalPlan", "testType"], cite: true,
    sheetAfterFirst: { purpose: /개별인정|건강기능식품/ },
  },
  {
    id: 6, name: "줄기세포 치료제",
    turns: ["줄기세포 치료제 비임상 견적 받으려고요", "임상 1상 IND 목적이에요"],
    firstAsk: ["purpose", "clinicalPlan", "priorStudies", "route"],
    sheetAfterFirst: { modality: /세포|줄기/ },
  },
  {
    id: 7, name: "이식형 의료기기",
    turns: ["이식형 의료기기 생물학적 안전성 시험 견적이요", "30일 넘게 몸 안에 있어요"],
    firstAsk: ["duration", "clinicalPlan", "substance", "priorStudies"], cite: true,
  },
  {
    id: 8, name: "막연한 질문",
    turns: ["독성시험 견적 얼마예요?", "신약 후보물질이에요"],
    firstAsk: ["modality", "purpose"],
  },
  {
    id: 9, name: "효력 당뇨 모델",
    turns: ["당뇨병 치료제 효력시험 견적 받고 싶어요", "제2형 당뇨 쪽이에요"],
    firstAsk: ["modality", "species", "notes", "testType", "purpose"],
  },
  {
    id: 10, name: "화장품 피부자극",
    turns: ["화장품 원료 피부자극 시험 견적 받고 싶어요", "기능성화장품 심사용이에요"],
    firstAsk: ["purpose", "substance", "species", "glp"],
  },
];

const BANNED = [/추천/, /\d[\d,]*\s*(원|만원|억)/];

interface TurnLog { user: string; text: string; question: { field: string; question: string; options: string[] } | null; sheet: Record<string, string | null> }

async function run(s: Scenario, provider: NonNullable<ReturnType<typeof providerFromEnv>>) {
  let conv: Conversation = {
    id: `eval-${s.id}`, orgId: "eval", createdBy: "eval", role: "requester", mode: "request", requestId: null,
    sheet: { ...EMPTY_SHEET }, messages: [], question: null, summary: null, draft: null, turns: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  const history: AgentMessage[] = [];
  const logs: TurnLog[] = [];
  for (const raw of s.turns) {
    const user = redactContacts(raw);
    const evidence = retrieve(retrievalQuery(user, conv.sheet));
    const result = await provider.complete({
      system: SYSTEM.requester,
      messages: [...history, { role: "user", content: `${user}\n\n${sheetContext(conv.sheet)}\n\n${contextBlock(evidence)}` }],
      tools: TOOLS.requester,
      maxTokens: 1200,
    });
    const out = interpret(conv, result.toolCalls);
    conv = out.conv;
    const asked = out.events.find((e) => e.event === "question");
    logs.push({
      user: raw,
      text: result.text.trim(),
      question: asked ? (asked.data as TurnLog["question"]) : null,
      sheet: { ...conv.sheet },
    });
    history.push({ role: "user", content: user }, { role: "assistant", content: [result.text.trim(), ...out.notes].join("\n") });
  }
  return logs;
}

function grade(s: Scenario, logs: TurnLog[]) {
  const checks: [string, boolean][] = [];
  const all = logs.map((l) => [l.text, l.question?.question ?? "", ...(l.question?.options ?? [])].join(" ")).join(" ");
  checks.push(["추천·금액 표현 없음", !BANNED.some((r) => r.test(all))]);
  checks.push(["선택지 6개 이하", logs.every((l) => !l.question || l.question.options.length <= 6)]);
  const first = logs[0]!;
  if (s.firstAsk) checks.push([`첫 질문 칸 ∈ {${s.firstAsk.join(", ")}}`, !!first.question && s.firstAsk.includes(first.question.field as SheetField)]);
  if (s.cite) checks.push(["첫 두 턴 안에 (근거: …)", logs.slice(0, 2).some((l) => /\(근거:/.test(l.text))]);
  if (s.mismatch) {
    const l = logs[s.mismatch.turn];
    checks.push(["어긋남 짚기", !!l && s.mismatch.pattern.test(`${l.text} ${l.question?.question ?? ""}`)]);
  }
  for (const [f, re] of Object.entries(s.sheetAfterFirst ?? {})) checks.push([`첫 턴 뒤 ${f} 채움`, re!.test(first.sheet[f] ?? "")]);
  const situationQs = logs.filter((l) => l.question && (SITUATION_FIELDS as readonly string[]).includes(l.question.field));
  checks.push(["상황 질문에 미정·모르겠어요 선택지", situationQs.every((l) => l.question!.options.some((o) => /미정|모르/.test(o)))]);
  return checks;
}

async function main() {
  const provider = providerFromEnv(process.env);
  if (!provider) {
    console.error("AI 공급사 설정이 없어요(ANTHROPIC_API_KEY 등). 평가를 멈춰요.");
    process.exit(2);
  }
  const pick = process.argv.slice(2).map(Number).filter(Boolean);
  const list = pick.length ? SCENARIOS.filter((s) => pick.includes(s.id)) : SCENARIOS;
  let pass = 0, total = 0;
  console.log(`# 견적 요청 유도 평가\n\n모델: ${provider.model}\n`);
  for (const s of list) {
    let logs: TurnLog[];
    try {
      logs = await run(s, provider);
    } catch (e) {
      console.log(`## ${s.id}. ${s.name}\n\n실행 실패: ${(e as Error).message}\n`);
      continue;
    }
    const checks = grade(s, logs);
    pass += checks.filter(([, ok]) => ok).length;
    total += checks.length;
    console.log(`## ${s.id}. ${s.name}\n`);
    console.log(checks.map(([n, ok]) => `- ${ok ? "통과" : "실패"} ${n}`).join("\n"), "\n");
    for (const l of logs) {
      console.log(`**사용자** ${l.user}\n\n**에이전트** ${l.text || "(글 없음)"}\n`);
      if (l.question) console.log(`> 질문(${l.question.field}): ${l.question.question}\n> 선택지: ${l.question.options.join(" / ")}\n`);
    }
    const filled = Object.entries(logs.at(-1)!.sheet).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(`요청서: ${filled || "(비어 있음)"} / 남은 필수 칸: ${missingFields(logs.at(-1)!.sheet as never).join(", ") || "없음"}\n`);
  }
  console.log(`\n합계: ${pass}/${total} 통과`);
}

main();
