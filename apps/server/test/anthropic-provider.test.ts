import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/providers/anthropic";

// 실제 API 대신 로컬 서버로 SDK 요청 모양과 스트림 해석을 확인한다.
let server: Server;
let baseURL = "";
let lastBody: any = null;
let stopReason = "tool_use";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(sse("message_start", { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: lastBody.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 0, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 } } }));
      res.write(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
      res.write(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "정리했" } }));
      res.write(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "어요." } }));
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      res.write(sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu1", name: "ask_question", input: {} } }));
      res.write(sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"field":"route","question":"경로는요?","options":["경구","정맥"]}' } }));
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 1 }));
      res.write(sse("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 12 } }));
      res.write(sse("message_stop", { type: "message_stop" }));
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const req = (onText?: (d: string) => void) => ({
  system: "고정 프롬프트",
  messages: [{ role: "user" as const, content: "안녕하세요" }],
  tools: [{ name: "ask_question", description: "질문", inputSchema: { type: "object", properties: {}, additionalProperties: false } }],
  onText,
});

describe("AnthropicProvider (SDK)", () => {
  it("캐시·strict·eager·effort를 실어 보내고 스트림을 해석한다", async () => {
    stopReason = "tool_use";
    const p = new AnthropicProvider("claude-sonnet-5-5", "test-key", { baseURL });
    const deltas: string[] = [];
    const r = await p.complete(req((d) => deltas.push(d)));
    expect(lastBody.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(lastBody.tools[0].strict).toBe(true);
    expect(lastBody.tools[0].eager_input_streaming).toBe(true);
    expect(lastBody.tool_choice).toEqual({ type: "auto" });
    expect(lastBody.output_config).toEqual({ effort: "low" });
    expect(lastBody.stream).toBe(true);
    expect(deltas.join("")).toBe("정리했어요.");
    expect(r.text).toBe("정리했어요.");
    expect(r.toolCalls).toEqual([{ id: "tu1", name: "ask_question", input: { field: "route", question: "경로는요?", options: ["경구", "정맥"] } }]);
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 12, cacheReadTokens: 40, cacheWriteTokens: 0 });
    expect(r.stop).toBe("done");
  });

  it("도구가 없는 대화(질문하기)에는 tools·tool_choice 를 보내지 않는다", async () => {
    stopReason = "end_turn";
    await new AnthropicProvider("claude-sonnet-5-5", "k", { baseURL }).complete({ system: "질문", messages: [{ role: "user", content: "유전독성 표준 시험 조합?" }] });
    expect(lastBody).not.toHaveProperty("tools");
    expect(lastBody).not.toHaveProperty("tool_choice");
    expect(lastBody.output_config).toEqual({ effort: "low" });
    await new AnthropicProvider("claude-sonnet-5-5", "k", { baseURL }).complete({ system: "질문", messages: [{ role: "user", content: "x" }], tools: [] });
    expect(lastBody).not.toHaveProperty("tool_choice");
  });

  it("잘린 턴의 도구 입력은 버린다", async () => {
    stopReason = "max_tokens";
    const r = await new AnthropicProvider("claude-sonnet-5-5", "k", { baseURL }).complete(req());
    expect(r.stop).toBe("truncated");
    expect(r.toolCalls).toEqual([]);
  });

  it("거절은 refused", async () => {
    stopReason = "refusal";
    const r = await new AnthropicProvider("claude-sonnet-5-5", "k", { baseURL }).complete(req());
    expect(r.stop).toBe("refused");
    expect(r.toolCalls).toEqual([]);
  });
});

describe("toStrictSchema", () => {
  it("strict 도구 스키마가 받지 않는 제약을 뺀다", async () => {
    const { toStrictSchema } = await import("../src/providers/anthropic");
    const { TOOLS } = await import("../src/agent/tools");
    const all = JSON.stringify([...TOOLS.requester, ...TOOLS.cro].map((t) => toStrictSchema(t.inputSchema)));
    for (const k of ["minLength", "maxLength", "minItems", "maxItems"]) expect(all).not.toContain(`"${k}"`);
    expect(all).toContain('"additionalProperties":false');
    // 속성 이름이 제약 이름과 같아도 지우지 않는다.
    expect(toStrictSchema({ type: "object", properties: { pattern: { type: "string", maxLength: 3 } } })).toEqual({
      type: "object",
      properties: { pattern: { type: "string" } },
    });
  });
});

describe("공급사 오류 로그 값", () => {
  it("400 은 요청 모양 사유를 남기고 따옴표 안 값은 지운다. 그 밖에는 사유를 남기지 않는다", async () => {
    const { providerErrorInfo } = await import("../src/agent/routes");
    const bad = Object.assign(new Error("x"), { name: "BadRequestError", status: 400, error: { error: { type: "invalid_request_error", message: 'tool_choice may only be specified while providing tools; got "비밀 본문"' } } });
    expect(providerErrorInfo(bad)).toEqual(["BadRequestError", 400, "invalid_request_error", 'tool_choice may only be specified while providing tools; got "…"']);
    const rate = Object.assign(new Error("x"), { name: "RateLimitError", status: 429, error: { error: { type: "rate_limit_error", message: "slow down" } } });
    expect(providerErrorInfo(rate)).toEqual(["RateLimitError", 429, "rate_limit_error", ""]);
  });
});
