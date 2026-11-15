import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, LlmProvider, StopKind } from "@danchuai/core";

// Claude Messages API(공식 SDK). 한 턴에 한 번 부르고, 답 글자는 스트리밍으로 흘린다.
// 도구 입력은 이 파일이 아니라 서버의 도구 해석(agent/tools.ts)에서 zod로 다시 검사한다.
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
    opts: { baseURL?: string; effort?: "low" | "medium" | "high" } = {},
  ) {
    // SDK 기본 재시도(2회)는 일시 오류(429·5xx·연결)만 다시 시도한다. 인증·검증 오류는 바로 실패.
    this.client = new Anthropic({ apiKey, baseURL: opts.baseURL, maxRetries: 2, timeout: 60_000 });
    this.effort = opts.effort ?? "low";
  }
  private readonly effort: "low" | "medium" | "high";

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 1200,
        // 시스템 프롬프트·도구는 매 턴 같다. 접두부 캐시가 맞도록 바뀌는 값은 넣지 않는다.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: req.messages,
        tools: req.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          strict: true,
          eager_input_streaming: true,
        })),
        // Sonnet 5.5 / Opus 5.5는 강제 tool_choice를 받지 않는다. auto + strict.
        tool_choice: { type: "auto" },
        output_config: { effort: this.effort },
      },
      { signal: req.signal as AbortSignal | undefined },
    );
    if (req.onText) stream.on("text", (d) => req.onText?.(d));
    const msg = await stream.finalMessage();

    const stop: StopKind =
      msg.stop_reason === "refusal" ? "refused" : msg.stop_reason === "max_tokens" ? "truncated" : "done";
    return {
      text: msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
      // 잘리거나 거절된 턴의 도구 입력은 미완성일 수 있으니 버린다.
      toolCalls:
        stop === "done"
          ? msg.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : []))
          : [],
      usage: {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
      },
      stop,
      provider: this.name,
      model: this.model,
    };
  }
}
