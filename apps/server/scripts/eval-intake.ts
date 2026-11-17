// 견적 요청 유도 평가: 상황 10개를 실제 모델로 돌리고, 정해 둔 기준으로 자동 채점한다.
// 실행: npm run eval:intake -w @danchuai/server -- [시나리오 번호...] > eval.md
// 키는 DANCHUAI_EVAL_KEY(평가 전용 키, 개발 세션 환경 변수)를 먼저 쓰고, 없으면 ANTHROPIC_API_KEY. 키가 없으면 멈춘다.
// 개발 세션의 ANTHROPIC_BASE_URL(세션 자체용 주소)은 평가 호출에 쓰지 않는다. 대화 기록은 표준 출력(마크다운)으로만 내보내고 로그 파일에 남기지 않는다.
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
import { runToolTurn } from "../src/agent/repair";
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

// 실제 사용량 합계(비용 보고용). Sonnet 5.5 기준 단가($/1M): 입력 2, 출력 10, 캐시 읽기 0.1, 캐시 쓰기(5분) 2.5.
const USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0 };

// "표 1 원문"처럼 숫자 뒤 "원문·원료"는 금액이 아니다.
// 서버 보정이 일한 횟수: 질문이 없어 다시 부른 턴, 모델이 도구 태그를 글에 쓴 턴(걸러서 사용자에겐 안 보임).
const REPAIR = { retried: 0, leaked: 0 };

const BANNED = [/추천/, /\d[\d,]*\s*(만\s*원|억|원(?![문료본가칙]))/];

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
    // 운영 서버와 같은 한 턴 처리(태그 거르기, 질문 없으면 한 번 더 부르기)를 쓴다.
    const result = await runToolTurn({
      provider,
      conv,
      request: {
        system: SYSTEM.requester,
        messages: [...history, { role: "user", content: `${user}\n\n${sheetContext(conv.sheet)}\n\n${contextBlock(evidence)}` }],
        tools: TOOLS.requester,
        maxTokens: 1200,
      },
    });
    USAGE.inputTokens += result.usage.inputTokens;
    USAGE.outputTokens += result.usage.outputTokens;
    USAGE.cacheReadTokens += result.usage.cacheReadTokens;
    USAGE.cacheWriteTokens += result.usage.cacheWriteTokens;
    USAGE.calls += result.retried ? 2 : 1;
    if (result.retried) REPAIR.retried += 1;
    if (result.leaked) REPAIR.leaked += 1;
    conv = result.conv;
    const asked = result.events.find((e) => e.event === "question");
    logs.push({
      user: raw,
      text: result.text,
      question: asked ? (asked.data as TurnLog["question"]) : null,
      sheet: { ...conv.sheet },
    });
    history.push({ role: "user", content: user }, { role: "assistant", content: [result.text, ...result.notes].filter(Boolean).join("\n") });
  }
  return logs;
}

function grade(s: Scenario, logs: TurnLog[]) {
  const checks: [string, boolean][] = [];
  const all = logs.map((l) => [l.text, l.question?.question ?? "", ...(l.question?.options ?? [])].join(" ")).join(" ");
  checks.push(["추천·금액 표현 없음", !BANNED.some((r) => r.test(all))]);
  checks.push(["선택지 6개 이하", logs.every((l) => !l.question || l.question.options.length <= 6)]);
  // 도구 호출을 답 글에 태그로 써 버리면 요청서·질문이 반영되지 않고 사용자에게 태그가 보인다.
  checks.push(["답 글에 도구 태그 없음", logs.every((l) => !/<\/?(invoke|parameter|update_sheet|ask_question|draft_body|summarize_request)\b/.test(l.text))]);
  // 빈 칸이 남았는데 질문이 없으면 사용자는 다음에 할 일을 모른다(마지막 턴 제외).
  checks.push(["빈 칸 남은 턴마다 질문", logs.slice(0, -1).every((l) => !!l.question || missingFields(l.sheet as never).length === 0)]);
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
  const env: Record<string, string | undefined> = { ...process.env };
  if (env.DANCHUAI_EVAL_KEY) env.ANTHROPIC_API_KEY = env.DANCHUAI_EVAL_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  const provider = providerFromEnv(env);
  if (!provider) {
    console.error("평가용 키가 없어요(DANCHUAI_EVAL_KEY 또는 ANTHROPIC_API_KEY). 평가를 멈춰요.");
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
  const cost = (USAGE.inputTokens * 2 + USAGE.outputTokens * 10 + USAGE.cacheReadTokens * 0.1 + USAGE.cacheWriteTokens * 2.5) / 1e6;
  console.log(`\n사용량: 호출 ${USAGE.calls}회, 입력 ${USAGE.inputTokens}, 출력 ${USAGE.outputTokens}, 캐시 읽기 ${USAGE.cacheReadTokens}, 캐시 쓰기 ${USAGE.cacheWriteTokens} 토큰 / 추정 비용 $${cost.toFixed(4)} (Sonnet 5.5 단가 기준)`);
  console.log(`\n서버 보정: 질문 없어 다시 부른 턴 ${REPAIR.retried}, 도구 태그를 걸러 낸 턴 ${REPAIR.leaked}`);
}

main();
