import { EMPTY_SHEET, type CompletionRequest, type CompletionResult, type LlmProvider, type ToolCall } from "@danchuai/core";
import { describe, expect, it } from "vitest";
import { FOLLOW_UP, MarkupFilter, runToolTurn, stripToolMarkup } from "../src/agent/repair";
import type { Conversation } from "../src/agent/store";

/** 정해 둔 답을 차례로 돌려주는 가짜 공급사 */
class Fake implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model = "fake";
  calls: CompletionRequest[] = [];
  constructor(private steps: { text?: string; toolCalls?: ToolCall[]; stop?: CompletionResult["stop"] }[]) {}
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(req);
    const s = this.steps.shift() ?? {};
    const text = s.text ?? "";
    for (const ch of text.match(/.{1,3}/gsu) ?? []) req.onText?.(ch);
    return {
      text,
      toolCalls: s.toolCalls ?? [],
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      stop: s.stop ?? "done",
      provider: "anthropic",
      model: "fake",
    };
  }
}

const conv = (role: "requester" | "cro" = "requester"): Conversation => ({
  id: "c", orgId: "o", createdBy: "u", role, mode: "request", requestId: null, danchuNo: null, quote: null,
  sheet: { ...EMPTY_SHEET }, messages: [], question: null, summary: null, draft: null, turns: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
});
const request = (): CompletionRequest => ({ system: "s", messages: [{ role: "user", content: "견적 받고 싶어요" }], maxTokens: 100 });
const sheetCall: ToolCall = {
  id: "1",
  name: "update_sheet",
  input: { ...Object.fromEntries(Object.keys(EMPTY_SHEET).map((k) => [k, null])), modality: "합성의약품" },
};
const askCall: ToolCall = { id: "2", name: "ask_question", input: { field: "purpose", question: "어디에 제출하나요?", options: ["IND", "미정"] } };

describe("도구 태그 거르기", () => {
  it("태그가 처음 나오는 곳부터 자른다", () => {
    expect(stripToolMarkup("확인했어요.\n<invoke name=\"update_sheet\">\n<parameter name=\"x\">1</parameter></invoke>")).toBe("확인했어요.");
    expect(stripToolMarkup("먼저 정할게요.\n<ask_question>\n<field>modality</field>")).toBe("먼저 정할게요.");
    expect(stripToolMarkup("표 1 <참고> 원문이에요")).toBe("표 1 <참고> 원문이에요");
  });

  it("스트리밍 중 조각으로 나뉜 태그도 보내지 않는다", () => {
    const f = new MarkupFilter();
    const out = ["확인", "했어요. <in", "voke name=", "\"x\">값</invoke>"].map((d) => f.push(d)).join("") + f.flush();
    expect(out).toBe("확인했어요. ");
  });

  it("태그가 아닌 꺾쇠는 그대로 보낸다", () => {
    const f = new MarkupFilter();
    const out = ["농도 <", "10 mg 이에요"].map((d) => f.push(d)).join("") + f.flush();
    expect(out).toBe("농도 <10 mg 이에요");
  });
});

describe("질문 없이 끝난 의뢰자 턴", () => {
  it("요청서만 고치고 질문이 없으면 한 번 더 불러 질문을 받는다", async () => {
    const p = new Fake([{ toolCalls: [sheetCall] }, { toolCalls: [askCall] }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request() });
    expect(p.calls).toHaveLength(2);
    expect(r.retried).toBe(true);
    expect(r.conv.sheet.modality).toBe("합성의약품");
    expect(r.events.some((e) => e.event === "question")).toBe(true);
    // 다시 부를 때는 서버 안내와 최신 요청서를 붙이고, 보낸 시스템·도구는 그대로다
    const last = p.calls[1]!.messages.at(-1)!.content;
    expect(last).toContain(FOLLOW_UP);
    expect(last).toContain("합성의약품");
    expect(p.calls[1]!.system).toBe("s");
    expect(r.usage.inputTokens).toBe(20);
  });

  it("도구를 글에 태그로 썼으면 거르고 다시 부른다", async () => {
    const texts: string[] = [];
    const p = new Fake([{ text: "확인할게요.\n<ask_question>\n<field>purpose</field>" }, { toolCalls: [sheetCall, askCall] }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request(), onText: (d) => texts.push(d) });
    expect(r.leaked).toBe(true);
    expect(r.retried).toBe(true);
    expect(r.text).toBe("확인할게요.");
    expect(texts.join("")).not.toContain("<");
    expect(r.events.some((e) => e.event === "question")).toBe(true);
  });

  it("질문을 글로만 쓰고 끝내면 다시 부른다", async () => {
    const p = new Fake([{ text: "원료가 어떤 경우에 해당하나요?" }, { toolCalls: [askCall] }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request() });
    expect(r.retried).toBe(true);
  });

  it("도구 없이 글로 답한 가이드라인 답은 다시 부르지 않는다", async () => {
    const p = new Fake([{ text: "표준 조합은 두 가지예요(근거: ICH S2 2.2)." }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request() });
    expect(p.calls).toHaveLength(1);
    expect(r.retried).toBe(false);
  });

  it("질문이 있거나 기관 대화면 다시 부르지 않는다", async () => {
    const a = new Fake([{ toolCalls: [sheetCall, askCall] }]);
    expect((await runToolTurn({ provider: a, conv: conv(), request: request() })).retried).toBe(false);
    const b = new Fake([{ text: "요점을 정리했어요." }]);
    expect((await runToolTurn({ provider: b, conv: conv("cro"), request: request() })).retried).toBe(false);
  });

  it("다시 부르기는 한 번뿐이고, 실패해도 첫 응답은 남긴다", async () => {
    const p = new Fake([{ toolCalls: [sheetCall] }, { toolCalls: [sheetCall] }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request() });
    expect(p.calls).toHaveLength(2);
    expect(r.conv.sheet.modality).toBe("합성의약품");

    const failing: LlmProvider = {
      name: "anthropic", model: "fake",
      complete: async (req) => {
        if (req.messages.length > 1) throw new Error("boom");
        return { text: "", toolCalls: [sheetCall], usage: { inputTokens: 1, outputTokens: 1 }, stop: "done", provider: "anthropic", model: "fake" };
      },
    };
    const f = await runToolTurn({ provider: failing, conv: conv(), request: request() });
    expect(f.conv.sheet.modality).toBe("합성의약품");
  });

  it("잘린 응답은 다시 부르지 않는다", async () => {
    const p = new Fake([{ toolCalls: [], text: "", stop: "truncated" }]);
    const r = await runToolTurn({ provider: p, conv: conv(), request: request() });
    expect(p.calls).toHaveLength(1);
    expect(r.stop).toBe("truncated");
  });
});
