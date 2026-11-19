import { missingFields, sheetContext, type AgentMessage, type CompletionRequest, type LlmProvider, type Usage } from "@danchuai/core";
import { interpret, type AgentEvent } from "./interpret";
import type { Conversation } from "./store";

// 모델이 가끔 (1) 도구 호출을 답 글에 태그로 써 버리거나 (2) 빈 칸이 남았는데 다음 질문 없이 턴을 끝낸다.
// 지시문만으로는 다 막히지 않아서(2026-11-17 평가) 서버가 바로잡는다.
// (1) 태그가 보이는 곳부터 글을 자르고, 스트리밍 중에도 사용자에게 보내지 않는다.
// (2) 의뢰자 요청 대화에서 질문·본문이 없고 빈 칸이 남으면 한 번만 다시 불러 다음 질문을 받는다.

const TOOL_TAG = /<\/?(?:function_calls|invoke|parameter|update_sheet|ask_question|draft_body|summarize_request|update_quote)\b/;

/** 도구 태그가 처음 나오는 곳부터 잘라 낸다. */
export function stripToolMarkup(text: string): string {
  const i = text.search(TOOL_TAG);
  return (i === -1 ? text : text.slice(0, i)).trimEnd();
}

/** 스트리밍 글에서 도구 태그를 거른다. 태그일 수도 있는 "<" 뒤는 판단될 때까지 잠깐 붙잡아 둔다. */
export class MarkupFilter {
  private held = "";
  private cut = false;
  push(delta: string): string {
    if (this.cut) return "";
    this.held += delta;
    const i = this.held.search(TOOL_TAG);
    if (i !== -1) {
      this.cut = true;
      const out = this.held.slice(0, i);
      this.held = "";
      return out;
    }
    const lt = this.held.lastIndexOf("<");
    // 가장 긴 태그 이름("<summarize_request")보다 짧고 아직 닫히지 않았으면 기다린다.
    if (lt !== -1 && this.held.length - lt < 20 && !this.held.slice(lt).includes(">")) {
      const out = this.held.slice(0, lt);
      this.held = this.held.slice(lt);
      return out;
    }
    const out = this.held;
    this.held = "";
    return out;
  }
  flush(): string {
    if (this.cut) return "";
    const out = this.held;
    this.held = "";
    return out;
  }
}

/** 다시 부를 때 붙이는 서버 안내. 사용자 말이 아니라는 것을 밝힌다. */
export const FOLLOW_UP =
  "<서버 안내>사용자 메시지가 아니에요. 바로 앞 응답에 다음 질문이 없었어요. 앞 답을 되풀이하지 말고, 요청서 빈 칸 가운데 지금 물어야 할 것 하나를 ask_question 도구로 내세요. 확인된 값이 남아 있으면 update_sheet도 함께 부르세요. 글은 쓰지 않아도 돼요.</서버 안내>";

export function needsNextQuestion(conv: Conversation, events: readonly AgentEvent[]): boolean {
  return (
    conv.role === "requester" &&
    conv.mode !== "ask" &&
    !events.some((e) => e.event === "question" || e.event === "draft") &&
    missingFields(conv.sheet).length > 0
  );
}

export interface TurnResult {
  text: string;
  conv: Conversation;
  events: AgentEvent[];
  notes: string[];
  usage: Required<Usage>;
  stop: "done" | "truncated" | "refused";
  /** 질문이 없어 한 번 더 불렀는지 */
  retried: boolean;
  /** 모델이 도구 태그를 글에 썼는지(거르기 전 기준) */
  leaked: boolean;
}

/**
 * 도구가 있는 대화(의뢰자·기관)의 한 턴. 공급사를 부르고, 도구 호출을 해석하고, 위 두 경우를 바로잡는다.
 * onText에는 태그를 거른 글만 간다.
 */
export async function runToolTurn(args: {
  provider: LlmProvider;
  conv: Conversation;
  request: CompletionRequest;
  onText?: (delta: string) => void;
}): Promise<TurnResult> {
  const { provider, conv, request, onText } = args;
  const filter = new MarkupFilter();
  const first = await provider.complete({ ...request, onText: onText && ((d) => emit(onText, filter.push(d))) });
  if (onText) emit(onText, filter.flush());
  const firstText = stripToolMarkup(first.text.trim());
  const a = interpret(conv, first.toolCalls);
  const usage = addUsage(zero(), first.usage);
  let leaked = TOOL_TAG.test(first.text);
  // 도구 없이 글로만 답한 턴은 가이드라인 답으로 본다(지시문 7번: 요청서 진행은 다음 턴).
  // 다만 글이 물음으로 끝나면 질문을 도구 대신 글에 쓴 것이라 다시 부른다.
  const guidelineAnswer = !leaked && first.toolCalls.length === 0 && !!firstText && !/[?？]\s*$/.test(firstText);

  if (first.stop !== "done" || request.signal?.aborted || guidelineAnswer || !needsNextQuestion(a.conv, a.events)) {
    return { text: firstText, conv: a.conv, events: a.events, notes: a.notes, usage, stop: first.stop, retried: false, leaked };
  }

  const messages: AgentMessage[] = [
    ...request.messages,
    { role: "assistant", content: [firstText, ...a.notes].filter(Boolean).join("\n") || "(요청서 확인)" },
    { role: "user", content: `${FOLLOW_UP}\n\n${sheetContext(a.conv.sheet)}` },
  ];
  let second;
  try {
    second = await provider.complete({ ...request, messages, onText: undefined });
  } catch {
    // 다시 부르기가 실패해도 첫 응답은 살린다.
    return { text: firstText, conv: a.conv, events: a.events, notes: a.notes, usage, stop: first.stop, retried: true, leaked };
  }
  addUsage(usage, second.usage);
  leaked ||= TOOL_TAG.test(second.text);
  const secondText = second.stop === "done" ? stripToolMarkup(second.text.trim()) : "";
  const b = second.stop === "done" ? interpret(a.conv, second.toolCalls) : { conv: a.conv, events: [], notes: [] };
  if (onText && secondText) onText(firstText ? `\n\n${secondText}` : secondText);
  return {
    text: [firstText, secondText].filter(Boolean).join("\n\n"),
    conv: b.conv,
    events: [...a.events, ...b.events],
    notes: [...a.notes, ...b.notes],
    usage,
    stop: "done",
    retried: true,
    leaked,
  };
}

function emit(onText: (d: string) => void, s: string) {
  if (s) onText(s);
}
function zero(): Required<Usage> {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}
function addUsage(into: Required<Usage>, u: Usage): Required<Usage> {
  into.inputTokens += u.inputTokens;
  into.outputTokens += u.outputTokens;
  into.cacheReadTokens += u.cacheReadTokens ?? 0;
  into.cacheWriteTokens += u.cacheWriteTokens ?? 0;
  return into;
}
