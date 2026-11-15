import type { CompletionRequest, CompletionResult, LlmProvider } from "@danchuai/core";

// OpenAI Chat Completions를 fetch로 부른다. 모델 이름은 AGENT_MODEL로 정한다.
export class OpenAIProvider implements LlmProvider {
  readonly name = "openai" as const;
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com",
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: req.maxTokens ?? 1024,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        tools: req.tools?.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const body = (await res.json()) as {
      choices: Array<{
        message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = body.choices[0]?.message;
    return {
      text: msg?.content ?? "",
      toolCalls: (msg?.tool_calls ?? []).map((t) => ({
        id: t.id,
        name: t.function.name,
        input: safeJson(t.function.arguments),
      })),
      usage: { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens },
      provider: this.name,
      model: this.model,
    };
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
