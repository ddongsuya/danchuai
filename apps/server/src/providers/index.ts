import { readProviderConfig, type LlmProvider } from "@danchuai/core";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

/** 환경 변수로 공급사를 고른다. 설정이 없으면 undefined(에이전트 대화 503). */
export function providerFromEnv(env: Record<string, string | undefined>): LlmProvider | undefined {
  let cfg;
  try {
    cfg = readProviderConfig(env);
  } catch {
    return undefined;
  }
  return cfg.provider === "anthropic"
    ? new AnthropicProvider(cfg.model, cfg.apiKey)
    : new OpenAIProvider(cfg.model, cfg.apiKey);
}
