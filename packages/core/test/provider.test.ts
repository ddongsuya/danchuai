import { describe, expect, it } from "vitest";
import { assertReadOnlyTools, readProviderConfig } from "../src/provider";

describe("공급사 설정", () => {
  it("기본은 anthropic + claude-sonnet-5-5", () => {
    expect(readProviderConfig({ ANTHROPIC_API_KEY: "k" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      apiKey: "k",
    });
  });
  it("AC-10 환경 변수만으로 openai로 바꾼다", () => {
    const c = readProviderConfig({ AGENT_PROVIDER: "openai", OPENAI_API_KEY: "k", AGENT_MODEL: "m" });
    expect(c.provider).toBe("openai");
    expect(c.model).toBe("m");
  });
  it("키나 모델이 빠지면 어느 변수인지 알려 준다", () => {
    expect(() => readProviderConfig({})).toThrow("ANTHROPIC_API_KEY");
    expect(() => readProviderConfig({ AGENT_PROVIDER: "openai", OPENAI_API_KEY: "k" })).toThrow("AGENT_MODEL");
    expect(() => readProviderConfig({ AGENT_PROVIDER: "x" })).toThrow("AGENT_PROVIDER");
  });
});

describe("도구 제한", () => {
  it("AC-02 보내기·승인 계열 도구는 넣을 수 없다", () => {
    expect(() =>
      assertReadOnlyTools([{ name: "send_request", description: "", inputSchema: {} }]),
    ).toThrow();
    expect(() =>
      assertReadOnlyTools([{ name: "read_rate_card", description: "", inputSchema: {} }]),
    ).not.toThrow();
  });
});
