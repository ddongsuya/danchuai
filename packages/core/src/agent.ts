// 에이전트 한 턴에서 코드가 맡는 부분: 요청서 칸, 빈 칸 판단, 연락처 가리기, 본문 점검, 금액 줄.
// 모델은 이 함수들의 입력을 제안할 뿐이고, 결과는 항상 여기서 다시 만든다.

import { filterSentences } from "./guard";
import { computeTotals, formatWonShort, type QuoteLine } from "./money";

/** 요청서 칸. 회사명·연락처 칸은 일부러 두지 않는다(선정 전 신원 보호). */
export const SHEET_FIELDS = [
  // 상황: 시험 구성을 정하는 근거. 비어 있어도 보낼 수 있지만, 에이전트가 먼저 파악한다.
  "modality",
  "purpose",
  "clinicalPlan",
  "priorStudies",
  // 요청 내용
  "testType",
  "substance",
  "species",
  "route",
  "duration",
  "glp",
  "dueDate",
  "notes",
] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];
export type RequestSheet = Record<SheetField, string | null>;

export const SHEET_LABELS: Record<SheetField, string> = {
  modality: "물질 종류",
  purpose: "제출 목적",
  clinicalPlan: "임상 계획",
  priorStudies: "끝낸 시험",
  testType: "시험 종류",
  substance: "시험물질",
  species: "동물 종",
  route: "투여 경로",
  duration: "투여 기간",
  glp: "GLP 여부",
  dueDate: "회신 기한",
  notes: "기타",
};

/** 상황 칸. 요청서 상태를 모델에 넘길 때 따로 묶는다. */
export const SITUATION_FIELDS: readonly SheetField[] = ["modality", "purpose", "clinicalPlan", "priorStudies"];

/** 비어 있으면 질문해야 하는 칸(상황 칸과 notes는 선택). */
const REQUIRED: readonly SheetField[] = ["testType", "substance", "species", "route", "duration", "glp", "dueDate"];

export const EMPTY_SHEET: RequestSheet = Object.freeze(
  Object.fromEntries(SHEET_FIELDS.map((f) => [f, null])) as RequestSheet,
);

const MAX_FIELD = 200;
const MAX_BODY = 4000;

/** 제안된 칸만 반영한다. 모르는 칸·빈 값은 버리고 길이를 자른다. */
export function mergeSheet(sheet: RequestSheet, patch: Partial<Record<string, unknown>>): RequestSheet {
  const next: RequestSheet = { ...sheet };
  for (const f of SHEET_FIELDS) {
    const v = patch[f];
    if (typeof v !== "string") continue;
    const t = redactContacts(v).trim().slice(0, MAX_FIELD);
    if (t) next[f] = t;
  }
  return next;
}

export function missingFields(sheet: RequestSheet): SheetField[] {
  return REQUIRED.filter((f) => !sheet[f]);
}

/** 모델에 넘기는 요청서 상태. 매 턴 바뀌므로 캐시 접두부 뒤(마지막 사용자 메시지)에 붙인다. */
export function sheetContext(sheet: RequestSheet): string {
  const situation = SITUATION_FIELDS.map((f) => `${f}: ${sheet[f] || "(모름)"}`);
  const filled = SHEET_FIELDS.filter((f) => !SITUATION_FIELDS.includes(f) && sheet[f]).map((f) => `${f}: ${sheet[f]}`);
  const missing = missingFields(sheet);
  return [
    "<요청서>",
    "상황:",
    ...situation,
    "요청 내용:",
    ...(filled.length ? filled : ["(비어 있음)"]),
    `빈 칸: ${missing.length ? missing.join(", ") : "없음"}`,
    "</요청서>",
  ].join("\n");
}

/** 원문 검색어. 이번 말만으로는 "2주요"처럼 맥락이 빠지므로 상황 칸과 시험 종류를 덧붙인다. */
export function retrievalQuery(text: string, sheet: RequestSheet): string {
  const ctx = [...SITUATION_FIELDS, "testType" as const].map((f) => sheet[f]).filter((v): v is string => Boolean(v && v.trim()));
  return [text, ...ctx].join(" ").slice(0, 600);
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/gu;
const PHONE = /(?<!\d)0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/gu;

/** 메일·전화번호를 지운다. 모델 입력과 요청서 값에 쓴다. */
export function redactContacts(text: string): string {
  return text.replace(EMAIL, "[연락처 생략]").replace(PHONE, "[연락처 생략]");
}

export type GuardedDraft = { ok: true; body: string; dropped: number } | { ok: false; dropped: number };

/** 상대에게 나갈 AI 본문. 금액·순위·추천·연락처 문장을 빼고, 남는 게 없으면 만들지 않는다. */
export function guardDraft(text: string): GuardedDraft {
  const { kept, dropped } = filterSentences(text.slice(0, MAX_BODY * 2));
  let body = "";
  for (const s of kept) {
    const next = body ? `${body} ${s}` : s;
    if (next.length > MAX_BODY) break;
    body = next;
  }
  return body ? { ok: true, body, dropped: dropped.length } : { ok: false, dropped: dropped.length };
}

const won = (n: number) => {
  const s = formatWonShort(n);
  return s.endsWith("원") ? s : `${s}원`;
};

/** 기관 회신의 금액 줄. 사람이 넣은 항목 금액으로 코드가 계산한다. */
export function amountBlock(lines: readonly QuoteLine[]): string {
  const t = computeTotals(lines);
  return [
    ...lines.map((l) => `${l.label} ${won(l.amountWon)}`),
    `공급가액 ${won(t.subtotalWon)}`,
    `부가세 ${won(t.vatWon)}`,
    `견적 총액(부가세 포함) ${won(t.totalWithVatWon)}`,
  ].join("\n");
}
