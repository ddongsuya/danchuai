import type { AgentMessage, RequestSheet, Usage } from "@danchuai/core";
import type { Role } from "./tools";

export interface Question {
  field: string;
  question: string;
  options: string[];
}

export interface Conversation {
  id: string;
  orgId: string;
  role: Role;
  /** 기관 대화일 때 받은 요청 */
  requestId: string | null;
  sheet: RequestSheet;
  /** 모델에 다시 보내는 기록. 사용자 글은 연락처를 지운 뒤 저장한다. */
  messages: AgentMessage[];
  question: Question | null;
  summary: string[] | null;
  /** 점검을 통과한 본문. 보내기 초안은 이 본문으로만 만든다. */
  draft: { body: string; dropped: number; version: number; outboundCreated: boolean } | null;
  turns: number;
  usage: Required<Usage>;
}

export interface ConversationRepo {
  create(c: Conversation): Promise<void>;
  get(id: string): Promise<Conversation | null>;
  save(c: Conversation): Promise<void>;
}

export class MemoryConversationRepo implements ConversationRepo {
  private items = new Map<string, Conversation>();
  async create(c: Conversation) {
    this.items.set(c.id, structuredClone(c));
  }
  async get(id: string) {
    const c = this.items.get(id);
    return c ? structuredClone(c) : null;
  }
  async save(c: Conversation) {
    this.items.set(c.id, structuredClone(c));
  }
}

/** 기관이 받은 요청을 찾는다. 그 기관에 보낸 요청이 아니면 null. */
export interface RequestDirectory {
  forCro(requestId: string, croOrgId: string): Promise<{ sheet: RequestSheet; requesterOrgId: string } | null>;
}

export class MemoryRequestDirectory implements RequestDirectory {
  constructor(
    private readonly items: Record<string, { sheet: RequestSheet; requesterOrgId: string; sentTo: string[] }> = {},
  ) {}
  async forCro(requestId: string, croOrgId: string) {
    const r = this.items[requestId];
    if (!r || !r.sentTo.includes(croOrgId)) return null;
    return { sheet: { ...r.sheet }, requesterOrgId: r.requesterOrgId };
  }
}
