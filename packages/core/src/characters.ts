// 비서 캐릭터 10종(Muse 시안 2026-11-25, 사용자가 만든 그림 agent-characters-1125). 고르면 비서 이름도 함께 바뀐다.
// 앱과 서버가 같은 목록을 쓴다. 고른 값은 단추 계정별로 서버에 저장한다(에이전트 DB agent_prefs).

export const AGENT_CHARACTERS = [
  { id: "danchu", name: "단추", alt: "단추 로고의 둥근 네모 네 개로 빚은 고양이" },
  { id: "monggeul", name: "몽글", alt: "양" },
  { id: "golmu", name: "골무", alt: "골무" },
  { id: "toto", name: "토토", alt: "토마토 바늘꽂이" },
  { id: "bangul", name: "방울", alt: "플라스크" },
  { id: "kongi", name: "콩이", alt: "생쥐" },
  { id: "bibi", name: "비비", alt: "비글" },
  { id: "capcap", name: "캡캡", alt: "캡슐" },
  { id: "munge", name: "뭉게", alt: "구름" },
  { id: "peng", name: "펭", alt: "펭귄" },
] as const;

export type AgentCharacterId = (typeof AGENT_CHARACTERS)[number]["id"];
export type AgentCharacter = (typeof AGENT_CHARACTERS)[number];

export const DEFAULT_CHARACTER: AgentCharacterId = "danchu";

const IDS: readonly string[] = AGENT_CHARACTERS.map((c) => c.id);

export const isCharacterId = (x: unknown): x is AgentCharacterId => typeof x === "string" && IDS.includes(x);

/** 저장된 값(없거나 모르는 값이면 기본 "단추")의 캐릭터 */
export const characterOf = (id: unknown): AgentCharacter => AGENT_CHARACTERS.find((c) => c.id === id) ?? AGENT_CHARACTERS[0];
