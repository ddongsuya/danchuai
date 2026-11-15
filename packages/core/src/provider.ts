// AI 공급사 교체형 어댑터의 공통 모양. 실제 호출은 서버(apps/server)에만 둔다. 앱에는 API 키가 없다.

export type ProviderName = "anthropic" | "openai";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolSpec {
  name: string;
  description: string;
  /** JSON Schema */
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  system: string;
  messages: AgentMessage[];
  tools?: AgentToolSpec[];
  maxTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  provider: ProviderName;
  model: string;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
}

/** 환경 변수에서 공급사 설정을 읽는다. 빠진 값이 있으면 어느 변수인지 알려 준다. */
export function readProviderConfig(env: Record<string, string | undefined>): ProviderConfig {
  const provider = (env.AGENT_PROVIDER ?? "anthropic") as ProviderName;
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`AGENT_PROVIDER는 anthropic 또는 openai여야 해요 (지금: ${provider})`);
  }
  const keyVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const apiKey = env[keyVar];
  if (!apiKey) throw new Error(`${keyVar}가 없어요`);
  const model = env.AGENT_MODEL ?? (provider === "anthropic" ? "claude-sonnet-5-5" : undefined);
  if (!model) throw new Error("AGENT_MODEL이 없어요 (openai는 모델 이름을 꼭 정해야 해요)");
  return { provider, model, apiKey };
}

/** 에이전트가 쓸 수 있는 도구는 읽기·초안뿐이다. 보내기 도구는 정의하지 않는다. */
export const FORBIDDEN_TOOL_PREFIXES = ["send", "dispatch", "approve", "pay", "sign"] as const;

export function assertReadOnlyTools(tools: readonly AgentToolSpec[]): void {
  for (const t of tools) {
    if (FORBIDDEN_TOOL_PREFIXES.some((p) => t.name.toLowerCase().startsWith(p))) {
      throw new Error(`에이전트 도구에 보내기·승인 계열(${t.name})을 넣을 수 없어요`);
    }
  }
}
