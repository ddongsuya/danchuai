import { applyQuotePatch, guardDraft, mergeSheet, missingFields, redactContacts, type DanchuQuoteDraft, type DanchuQuotePatch, type RequestSheet, type ToolCall } from "@danchuai/core";
import { NOTES_DOC, type Retrieved } from "@danchuai/knowledge";
import { SCHEMAS, toolNamesFor, type ToolName } from "./tools";
import type { Conversation, Question, QuestionBasis, QuestionOption } from "./store";

export type AgentEvent =
  | { event: "sheet"; data: { sheet: RequestSheet; missing: string[] } }
  | { event: "question"; data: Question }
  | { event: "summary"; data: { points: string[] } }
  | { event: "draft"; data: { body: string; dropped: number; version: number } }
  | { event: "quote"; data: { quote: DanchuQuoteDraft; changed: number } }
  | { event: "notice"; data: { code: "draft_blocked" | "tool_rejected" } };

/**
 * 모델이 제안한 도구 호출을 검사해 화면 이벤트로 바꾼다.
 * 역할에 없는 도구, 스키마에 안 맞는 입력은 버린다(프롬프트만 믿지 않는다).
 * 같은 도구는 한 턴에 한 번만 받는다.
 */
export function interpret(conv: Conversation, calls: readonly ToolCall[], evidence?: Retrieved): { conv: Conversation; events: AgentEvent[]; notes: string[] } {
  const allowed = new Set<string>(toolNamesFor(conv));
  const seen = new Set<string>();
  const events: AgentEvent[] = [];
  const notes: string[] = [];
  let next: Conversation = { ...conv };

  // 요청서를 먼저 반영해야 질문·본문이 최신 빈 칸을 본다.
  const ordered = [...calls].sort((a, b) => order(a.name) - order(b.name));
  for (const call of ordered) {
    if (!allowed.has(call.name) || seen.has(call.name)) {
      events.push({ event: "notice", data: { code: "tool_rejected" } });
      continue;
    }
    seen.add(call.name);
    const name = call.name as ToolName;
    const parsed = SCHEMAS[name].safeParse(call.input);
    if (!parsed.success) {
      events.push({ event: "notice", data: { code: "tool_rejected" } });
      continue;
    }

    if (name === "update_sheet") {
      next = { ...next, sheet: mergeSheet(next.sheet, parsed.data as Record<string, unknown>) };
      events.push({ event: "sheet", data: { sheet: next.sheet, missing: missingFields(next.sheet) } });
      notes.push("(요청서 갱신)");
    } else if (name === "ask_question") {
      const q = parsed.data as { field: string; question: string; options: (string | QuestionOption)[]; basis?: string[]; recheck?: boolean };
      const filled = !!next.sheet[q.field as keyof RequestSheet];
      // 이미 채워진 칸은 다시 묻지 않는다. 상황과 어긋나 다시 묻는 질문(recheck)만 받는다.
      if (filled && !q.recheck) continue;
      const options = q.options
        .map((o) => (typeof o === "string" ? { label: o } : o))
        .map((o) => ({ label: redactContacts(o.label), ...(o.effect ? { effect: redactContacts(o.effect) } : {}) }))
        // "미정"은 카드가 늘 붙인다. 모델이 넣은 미정·모르겠어요는 뺀다.
        .filter((o) => !UNSURE.test(o.label.trim()));
      if (!options.length) continue;
      const basis = matchBasis(q.basis ?? [], evidence);
      const question: Question = {
        field: q.field,
        question: redactContacts(q.question),
        options,
        ...(basis.length ? { basis } : {}),
        ...(filled ? { recheck: true } : {}),
      };
      next = { ...next, question };
      events.push({ event: "question", data: question });
      notes.push(`(질문: ${question.question})`);
    } else if (name === "summarize_request") {
      const raw = (parsed.data as { points: string[] }).points;
      const points = raw.flatMap((p) => {
        const g = guardDraft(p);
        return g.ok ? [g.body] : [];
      });
      if (points.length) {
        next = { ...next, summary: points };
        events.push({ event: "summary", data: { points } });
        notes.push("(요청 요약)");
      }
    } else if (name === "update_quote") {
      // 단추 견적 초안: 금액은 손대지 않는다(applyQuotePatch). 없는 항목·틀린 값은 버린다.
      if (!next.quote) {
        events.push({ event: "notice", data: { code: "tool_rejected" } });
        continue;
      }
      const { draft, changed } = applyQuotePatch(next.quote, parsed.data as DanchuQuotePatch);
      if (changed) {
        next = { ...next, quote: draft };
        events.push({ event: "quote", data: { quote: draft, changed } });
        notes.push("(견적 초안 갱신)");
      }
    } else if (name === "draft_body") {
      // 의뢰자는 빈 칸이 있는 동안 본문을 만들지 않는다.
      if (next.role === "requester" && missingFields(next.sheet).length) continue;
      const g = guardDraft((parsed.data as { body: string }).body);
      if (!g.ok) {
        events.push({ event: "notice", data: { code: "draft_blocked" } });
        continue;
      }
      const version = (next.draft?.version ?? 0) + 1;
      next = { ...next, draft: { body: g.body, dropped: g.dropped, version, outboundCreated: false }, question: null };
      events.push({ event: "draft", data: { body: g.body, dropped: g.dropped, version } });
      notes.push("(본문 초안)");
    }
  }
  return { conv: next, events, notes };
}

const ORDER: Record<string, number> = { update_sheet: 0, update_quote: 0, summarize_request: 1, ask_question: 2, draft_body: 3 };
const order = (n: string) => ORDER[n] ?? 9;

/** 카드가 따로 붙이는 "미정" 줄과 겹치는 선택지 */
export const UNSURE = /^(미정|모름|모르겠어요|잘 모르겠어요|아직 몰라요|아직 미정|미정이에요|미정으로 두기)$/;

/** 조항 이름의 앞 번호("5.1 Clinical Development Trials" → "5.1", "제2조(적용범위)" → "제2조"). 괄호 제목은 뗀다 */
const sectionNo = (section: string) => (section.trim().split(/[\s(（]+/)[0] ?? "").replace(/[.:]+$/, "");

/** 근거 글에서 문서 이름 뒤의 낱말들("ICH M3 5.1 표 1" → ["5.1", "표", "1"]). 끝 마침표는 뗀다 */
const tokensAfter = (b: string, doc: string) => b.slice(b.indexOf(doc) + doc.length).split(/[\s,()（）]+/).map((t) => t.replace(/[.:]+$/, "")).filter(Boolean);

/**
 * 모델이 적은 근거("ICH M3 5.1")를 이번 턴 참고자료 조각과 맞춘다. 문서 이름과 조항 번호가 모두 맞는 원문만 받는다.
 * 정리본은 원문이 아니라 뺀다. 참고자료에 없는 근거는 버린다(짐작한 근거를 보여 주지 않는다).
 */
export function matchBasis(basis: readonly string[], evidence?: Retrieved): QuestionBasis[] {
  if (!evidence) return [];
  const out: QuestionBasis[] = [];
  const seen = new Set<number>();
  for (const raw of basis) {
    // "별표 3"·"제 2 조"처럼 띄어 쓴 조항도 조각 이름("별표3", "제2조")과 맞춘다
    const b = raw.replace(/\s+/g, " ").trim().replace(/(별표|별지)\s+(\d)/g, "$1$2").replace(/제\s*(\d+)\s*조/g, "제$1조");
    const i = evidence.sources.findIndex((s, k) => !seen.has(k) && s.doc !== NOTES_DOC && b.includes(s.doc) && sectionNo(s.section) !== "" && tokensAfter(b, s.doc).includes(sectionNo(s.section)));
    if (i < 0) continue;
    seen.add(i);
    const s = evidence.sources[i]!;
    const text = evidence.hits[i]?.text.replace(/\s+/g, " ").trim() ?? "";
    out.push({ doc: s.doc, name: s.name, section: s.section, url: s.url, version: s.version, excerpt: text.length > 220 ? `${text.slice(0, 220)}…` : text });
  }
  return out;
}
