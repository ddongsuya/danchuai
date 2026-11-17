import { assertReadOnlyTools, SHEET_FIELDS, type AgentToolSpec } from "@danchuai/core";
import { z } from "zod";

// 모델이 부를 수 있는 도구. 모두 "제안"이며 서버가 검사한 뒤 화면 카드로 바꾼다.
// 바깥으로 나가는 도구(보내기·승인·결제)는 없다. 이름·순서를 바꾸면 캐시 접두부가 깨진다.

const nullableText = (max: number) => z.string().max(max).nullable();

export const UpdateSheet = z
  .object(Object.fromEntries(SHEET_FIELDS.map((f) => [f, nullableText(200)])) as Record<
    (typeof SHEET_FIELDS)[number],
    ReturnType<typeof nullableText>
  >)
  .strict();

export const AskQuestion = z
  .object({
    field: z.enum(SHEET_FIELDS),
    question: z.string().min(1).max(80),
    options: z.array(z.string().min(1).max(40)).min(2).max(6),
  })
  .strict();

export const SummarizeRequest = z.object({ points: z.array(z.string().min(1).max(120)).min(1).max(6) }).strict();

export const DraftBody = z.object({ body: z.string().min(1).max(8000) }).strict();

export const SCHEMAS = {
  update_sheet: UpdateSheet,
  ask_question: AskQuestion,
  summarize_request: SummarizeRequest,
  draft_body: DraftBody,
} as const;
export type ToolName = keyof typeof SCHEMAS;

const DESCRIPTIONS: Record<ToolName, string> = {
  update_sheet:
    "사용자 말에서 확인된 요청서 칸을 채운다. 확인되지 않은 칸은 null. 회사명·연락처·금액은 넣지 않는다.",
  ask_question: "요청서의 빈 칸 하나를 묻는 질문 카드. 질문은 짧게, 선택지는 2~5개.",
  summarize_request: "기관 담당자를 위한 요청 요점 1~6개. 금액·의뢰자 신원은 넣지 않는다.",
  draft_body:
    "상대에게 보낼 본문 초안. 사람이 확인하고 승인해야 나간다. 금액 숫자·기관 비교·추천·연락처는 쓰지 않는다.",
};

function spec(name: ToolName): AgentToolSpec {
  const schema = z.toJSONSchema(SCHEMAS[name]) as Record<string, unknown>;
  delete schema.$schema;
  return { name, description: DESCRIPTIONS[name], inputSchema: schema };
}

export type Role = "requester" | "cro";

export const TOOL_NAMES: Record<Role, readonly ToolName[]> = {
  requester: ["update_sheet", "ask_question", "draft_body"],
  cro: ["summarize_request", "draft_body"],
};

export const TOOLS: Record<Role, AgentToolSpec[]> = {
  requester: TOOL_NAMES.requester.map(spec),
  cro: TOOL_NAMES.cro.map(spec),
};

// 서버가 뜰 때 한 번 더 막는다.
assertReadOnlyTools([...TOOLS.requester, ...TOOLS.cro]);
