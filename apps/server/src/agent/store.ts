import type { AgentMessage, RequestSheet, Usage } from "@danchuai/core";
import type { Role } from "./tools";

export type ConversationMode = "request" | "ask";

export interface Question {
  field: string;
  question: string;
  options: string[];
}

export interface Conversation {
  id: string;
  orgId: string;
  /** 대화를 연 사용자(세션의 userId) */
  createdBy: string;
  role: Role;
  /** request: 견적 요청·회신 대화, ask: 가이드라인 질문 대화(요청서·도구 없음) */
  mode: ConversationMode;
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
  /** 상태를 저장하고, 새로 늘어난 메시지만 덧붙인다(메시지는 지우거나 고치지 않는다). */
  save(c: Conversation): Promise<void>;
  /** 한 대화에 한 턴만. 잡으면 true. 오래된 잠금(2분)은 넘겨받는다. */
  lockTurn(id: string, orgId: string): Promise<boolean>;
  unlockTurn(id: string): Promise<void>;
}

export const TURN_LOCK_MS = 120_000;

export class MemoryConversationRepo implements ConversationRepo {
  private items = new Map<string, Conversation>();
  private locks = new Map<string, number>();
  async lockTurn(id: string, orgId: string) {
    const c = this.items.get(id);
    if (!c || c.orgId !== orgId) return false;
    const at = this.locks.get(id);
    if (at !== undefined && Date.now() - at < TURN_LOCK_MS) return false;
    this.locks.set(id, Date.now());
    return true;
  }
  async unlockTurn(id: string) {
    this.locks.delete(id);
  }
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
