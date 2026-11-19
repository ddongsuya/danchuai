// 답 글 검사: (근거: 문서 조항)이 실제로 받은 원문 조각을 가리키는지, 그 문장의 숫자가 그 조각에 있는지 본다.
// AI가 원문에 없는 기간·용량·동물 수를 지어내거나 받지 않은 문서를 근거로 붙이는 것을 잡는다.
import type { Hit } from "./search";

export interface DocLike {
  short: string;
  license?: string;
}

export interface AnswerIssue {
  kind: "unknown_source" | "number_not_in_source" | "ocr_source";
  /** 근거 표기 안의 문서 이름(unknown_source는 표기 그대로) */
  doc: string;
  /** 문제 된 숫자(number_not_in_source) */
  numbers?: string[];
  /** 그 근거가 붙은 문장 */
  sentence: string;
}

const CITE = /\(근거:\s*([^)]+)\)/g;
const ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV" };
// ICH 영어 원문은 작은 수를 낱말로 쓴다(two species, three months).
const WORD: Record<string, string> = {
  "1": "one|single", "2": "two|both|twice", "3": "three", "4": "four", "5": "five", "6": "six",
  "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve",
};

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ");

/** 글 속 숫자(쉼표 자리 표시 제거). 문서 이름 속 숫자(ICH M3, OECD TG 407 같은 이름 자체)는 뺀다. */
export function numbersIn(text: string, docNames: readonly string[] = []): string[] {
  let t = norm(text);
  for (const d of docNames) t = t.split(d).join(" ");
  t = t.replace(/\bICH [A-Z]\d+[A-Z]?(\(R\d\))?/g, " ").replace(/별표\s*\d+(의\d+)?/g, " ");
  const out = new Set<string>();
  for (const m of t.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, ""));
  return [...out];
}

function hasNumber(text: string, n: string): boolean {
  const t = norm(text).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const re = new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}(?![\\d]|\\.\\d)`);
  if (re.test(t)) return true;
  const w = WORD[n];
  if (w && new RegExp(`\\b(${w})\\b`, "i").test(t)) return true;
  const r = ROMAN[n];
  return r ? new RegExp(`\\b(Phase|phase|단계|상)\\s*${r}\\b`).test(t) || new RegExp(`\\b${r}\\s*(상|단계)`).test(t) : false;
}

/** 근거 표기 한 개("ICH M3 5.1, 식약처 독성시험기준 별표2")에서 아는 문서 이름을 길게 맞는 순으로 찾는다. */
function citedDocs(cite: string, docs: readonly DocLike[]): { docs: string[]; unknown: string[] } {
  const names = [...docs.map((d) => d.short)].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  const unknown: string[] = [];
  for (const part of cite.split(/[,;]|\s및\s/).map((p) => p.trim()).filter(Boolean)) {
    const d = names.find((n) => part.startsWith(n));
    if (d) {
      if (!found.includes(d)) found.push(d);
    } else if (!/^\d/.test(part) && !/^(별표|제\d|부록|Note|Table|표)/.test(part)) unknown.push(part);
  }
  return { docs: found, unknown };
}

/**
 * 답 글을 근거 표기 단위로 나눠 검사한다.
 * - 받은 조각에 없는 문서를 근거로 붙였으면 unknown_source
 * - 근거가 붙은 문장의 숫자가 그 문서의 받은 조각 어디에도 없으면 number_not_in_source
 * - 근거 문서가 스캔본 OCR 글이면 ocr_source(수치는 원본 확인 필요)
 */
export function checkAnswer(text: string, hits: readonly Hit[], docs: readonly DocLike[]): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const byDoc = new Map<string, string[]>();
  for (const h of hits) byDoc.set(h.doc, [...(byDoc.get(h.doc) ?? []), h.text]);
  const ocr = new Set(docs.filter((d) => d.license?.includes("OCR")).map((d) => d.short));
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    // 근거 표기 바로 앞 문장(근거가 마침표 뒤에 붙은 경우도 그 앞 문장)
    const segment = text.slice(Math.max(text.lastIndexOf("\n", m.index - 1) + 1, last), m.index);
    const parts = segment.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    const sentence = parts.at(-1) ?? text.slice(last, m.index).trim().split("\n").filter(Boolean).at(-1) ?? "";
    last = m.index + m[0].length;
    const { docs: cited, unknown } = citedDocs(m[1]!, docs);
    for (const u of unknown) issues.push({ kind: "unknown_source", doc: u, sentence });
    const received = cited.filter((d) => byDoc.has(d));
    for (const d of cited.filter((d) => !byDoc.has(d))) issues.push({ kind: "unknown_source", doc: d, sentence });
    if (!received.length) continue;
    const pool = received.flatMap((d) => byDoc.get(d)!).join("\n");
    const missing = numbersIn(sentence, docs.map((d) => d.short)).filter((n) => !hasNumber(pool, n));
    if (missing.length) issues.push({ kind: "number_not_in_source", doc: received.join(", "), numbers: missing, sentence });
    for (const d of received.filter((d) => ocr.has(d))) issues.push({ kind: "ocr_source", doc: d, sentence });
  }
  return issues;
}

/** 검사 결과를 답 끝에 붙일 짧은 안내 글로 만든다(없으면 빈 글). */
export function issueNote(issues: readonly AnswerIssue[]): string {
  if (!issues.length) return "";
  const lines: string[] = [];
  const nums = issues.filter((i) => i.kind === "number_not_in_source");
  const unknown = [...new Set(issues.filter((i) => i.kind === "unknown_source").map((i) => i.doc))];
  const ocr = [...new Set(issues.filter((i) => i.kind === "ocr_source").map((i) => i.doc))];
  for (const i of nums) lines.push(`- 원문 조각에서 확인되지 않은 숫자: ${i.numbers!.join(", ")} (${i.doc})`);
  if (unknown.length) lines.push(`- 이번에 찾은 원문에 없는 근거 표기: ${unknown.join(", ")}`);
  if (ocr.length) lines.push(`- 스캔본을 글자로 읽은 문서라 수치는 원본 확인 필요: ${ocr.join(", ")}`);
  return `원문 대조 결과\n${lines.join("\n")}`;
}
