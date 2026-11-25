import { describe, expect, it } from "vitest";

import { AGENT_CHARACTERS, DEFAULT_CHARACTER, characterOf, isCharacterId } from "../src/characters";

describe("비서 캐릭터", () => {
  it("10종, id와 이름이 겹치지 않고 기본은 단추", () => {
    expect(AGENT_CHARACTERS).toHaveLength(10);
    expect(new Set(AGENT_CHARACTERS.map((c) => c.id)).size).toBe(10);
    expect(new Set(AGENT_CHARACTERS.map((c) => c.name)).size).toBe(10);
    expect(characterOf(DEFAULT_CHARACTER).name).toBe("단추");
  });

  it("모르는 값은 받지 않고, 읽을 때는 기본으로", () => {
    expect(isCharacterId("bibi")).toBe(true);
    expect(isCharacterId("kit")).toBe(false);
    expect(isCharacterId(null)).toBe(false);
    expect(characterOf("kit").id).toBe("danchu");
    expect(characterOf(undefined).id).toBe("danchu");
    expect(characterOf("peng").name).toBe("펭");
  });
});
