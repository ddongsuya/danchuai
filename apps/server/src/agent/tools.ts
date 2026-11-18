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

// 단추 기관 견적 초안 고치기(말로 맡기는 견적 2단계). 금액 칸은 없다: 금액은 단추 계산 또는 담당자가 확인 카드에서 넣는다.
const ymdOrEmpty = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
export const UpdateQuote = z
  .object({
    items: z
      .array(
        z
          .object({
            seq: z.number().int().min(1).max(999),
            avail: z.enum(["가능", "조건부 가능", "불가"]).optional(),
            weeks: z.union([z.string().regex(/^\d{0,3}$/), z.null()]).optional(),
            reason: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .max(60)
      .optional(),
    common: z
      .object({
        startDate: ymdOrEmpty.optional(),
        validUntil: ymdOrEmpty.optional(),
        payTerms: z.string().max(60).optional(),
        substanceQty: z.string().max(120).optional(),
        reportLang: z.enum(["", "국문", "영문", "국문 + 영문 번역", "일문"]).optional(),
      })
      .strict()
      .optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const SCHEMAS = {
  update_sheet: UpdateSheet,
  ask_question: AskQuestion,
  summarize_request: SummarizeRequest,
  draft_body: DraftBody,
  update_quote: UpdateQuote,
} as const;
export type ToolName = keyof typeof SCHEMAS;

const DESCRIPTIONS: Record<ToolName, string> = {
  update_sheet:
    "사용자 말에서 확인된 요청서 칸을 채운다. 확인되지 않은 칸은 null. 회사명·연락처·금액은 넣지 않는다.",
  ask_question: "요청서의 빈 칸 하나를 묻는 질문 카드. 질문은 짧게, 선택지는 2~5개.",
  summarize_request: "기관 담당자를 위한 요청 요점 1~6개. 금액·의뢰자 신원은 넣지 않는다.",
  draft_body:
    "상대에게 보낼 본문 초안. 사람이 확인하고 승인해야 나간다. 금액 숫자·기관 비교·추천·연락처는 쓰지 않는다.",
  update_quote:
    "견적 초안에서 담당자 말로 확인된 칸만 고친다: 항목별 가능 여부·기간(주)·사유, 착수 가능일·견적 유효기간(YYYY-MM-DD)·결제 조건·시험물질 필요량·보고서 언어, 전달 사항. 금액은 넣지 않는다. 짐작으로 채우지 않는다.",
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

/** 단추 연동 기관 견적 대화. 회신 본문 대신 단추 견적 초안을 고친다(제출은 사람이 확인 카드에서) */
export const CRO_DANCHU_TOOL_NAMES: readonly ToolName[] = ["summarize_request", "update_quote"];
export const CRO_DANCHU_TOOLS: AgentToolSpec[] = CRO_DANCHU_TOOL_NAMES.map(spec);

/** 이 대화에서 모델이 부를 수 있는 도구 이름 */
export const toolNamesFor = (c: { role: Role; danchuNo: string | null }): readonly ToolName[] =>
  c.role === "cro" && c.danchuNo ? CRO_DANCHU_TOOL_NAMES : TOOL_NAMES[c.role];
export const toolsFor = (c: { role: Role; danchuNo: string | null }): AgentToolSpec[] => (c.role === "cro" && c.danchuNo ? CRO_DANCHU_TOOLS : TOOLS[c.role]);

// 서버가 뜰 때 한 번 더 막는다.
assertReadOnlyTools([...TOOLS.requester, ...TOOLS.cro, ...CRO_DANCHU_TOOLS]);
