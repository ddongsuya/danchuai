import type { CompletionRequest, CompletionResult, LlmProvider } from "@danchuai/core";

// Claude Messages API를 fetch로 직접 부른다(SDK 없이, 의존성 최소화).
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.anthropic.com",
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        // 시스템 프롬프트는 매 요청 같으므로 캐시한다
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: req.messages,
        tools: req.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const body = (await res.json()) as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: body.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      toolCalls: body.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input })),
      usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
      provider: this.name,
      model: this.model,
    };
  }
}
