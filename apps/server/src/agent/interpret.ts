import { applyQuotePatch, guardDraft, mergeSheet, missingFields, redactContacts, type DanchuQuoteDraft, type DanchuQuotePatch, type RequestSheet, type ToolCall } from "@danchuai/core";
import { SCHEMAS, toolNamesFor, type ToolName } from "./tools";
import type { Conversation, Question } from "./store";

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
export function interpret(conv: Conversation, calls: readonly ToolCall[]): { conv: Conversation; events: AgentEvent[]; notes: string[] } {
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
      const q = parsed.data as Question;
      // 이미 채워진 칸은 다시 묻지 않는다.
      if (next.sheet[q.field as keyof RequestSheet]) continue;
      const question: Question = {
        field: q.field,
        question: redactContacts(q.question),
        options: q.options.map(redactContacts),
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
