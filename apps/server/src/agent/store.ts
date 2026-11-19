import type { AgentMessage, DanchuQuoteBrief, DanchuQuoteDraft, RequestSheet, Usage } from "@danchuai/core";
import type { Role } from "./tools";

export type ConversationMode = "request" | "ask";

/** 답이 인용한 가이드라인 원문(화면에 다시 보여 주려고 답과 함께 저장한다) */
export interface SourceView {
  doc: string;
  name: string;
  section: string;
  url: string | null;
  version: string;
}

/** 저장하는 대화 글. 모델에 보낼 때는 role·content만 쓴다. */
export interface StoredMessage extends AgentMessage {
  sources?: SourceView[];
}

/** 지난 질문 목록의 한 줄 */
export interface AskListItem {
  id: string;
  title: string;
  updatedAt: string;
}

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
  /** 기관 대화일 때 받은 요청(레거시 에이전트 DB 요청, uuid) */
  requestId: string | null;
  /**
   * 단추 연동: 대화가 다루는 단추 요청 번호(DC-...). 기관 견적 대화는 받은 요청, 의뢰자 대화는 단추에 접수된 뒤 받은 번호.
   * 단추 연동 기관 대화는 requestId 대신 이것을 쓴다(말로 맡기는 견적 2단계).
   */
  danchuNo: string | null;
  /** 단추 연동 기관 견적 초안(단추 회신 구조, 부가세 별도). 금액은 단추 계산 또는 담당자 입력만 */
  quote: DanchuQuoteDraft | null;
  sheet: RequestSheet;
  /** 모델에 다시 보내는 기록. 사용자 글은 연락처를 지운 뒤 저장한다. */
  messages: StoredMessage[];
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
  /** 이 사용자가 연 질문 대화(글이 있는 것만, 최근 순) */
  listAsks(orgId: string, userId: string, limit: number): Promise<AskListItem[]>;
  /** 이 사용자가 이 단추 요청으로 연 기관 견적 대화(가장 최근 것). 다시 열면 이어서 쓴다 */
  findDanchu(orgId: string, userId: string, no: string): Promise<Conversation | null>;
}

/** 지난 질문 제목: 첫 질문 글 한 줄 */
export const askTitle = (messages: readonly AgentMessage[]) =>
  (messages.find((m) => m.role === "user")?.content ?? "").split("\n")[0]!.slice(0, 80);

export const TURN_LOCK_MS = 120_000;

export class MemoryConversationRepo implements ConversationRepo {
  private items = new Map<string, Conversation>();
  private touched = new Map<string, number>();
  async findDanchu(orgId: string, userId: string, no: string) {
    const hit = [...this.items.values()]
      .filter((c) => c.orgId === orgId && c.createdBy === userId && c.role === "cro" && c.danchuNo === no)
      .sort((a, b) => (this.touched.get(b.id) ?? 0) - (this.touched.get(a.id) ?? 0))[0];
    return hit ? structuredClone(hit) : null;
  }
  async listAsks(orgId: string, userId: string, limit: number) {
    return [...this.items.values()]
      .filter((c) => c.orgId === orgId && c.createdBy === userId && c.mode === "ask" && c.messages.length)
      .sort((a, b) => (this.touched.get(b.id) ?? 0) - (this.touched.get(a.id) ?? 0))
      .slice(0, limit)
      .map((c) => ({ id: c.id, title: askTitle(c.messages), updatedAt: new Date(this.touched.get(c.id) ?? 0).toISOString() }));
  }
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
    this.touched.set(c.id, Math.max(Date.now(), (Math.max(0, ...this.touched.values()) + 1)));
  }
}

/** 단추 요청 조회 실패 코드(단추 입구의 오류 코드 그대로) */
export type DanchuLookupError = "unauthorized" | "forbidden" | "org_not_ready" | "plan_required" | "not_found" | "rate_limited" | "unavailable";

/** 기관이 받은 요청을 찾는다. 그 기관에 보낸 요청이 아니면 null. */
export interface RequestDirectory {
  forCro(requestId: string, croOrgId: string): Promise<{ sheet: RequestSheet; requesterOrgId: string } | null>;
  /**
   * 단추 연동: 받은 단추 요청(DC-...)의 요청서 전체와 회신 초안. 사용자 단추 토큰으로 단추에서 읽는다.
   * 어느 기관의 요청인지는 단추가 토큰으로 정한다(다른 기관 요청은 not_found).
   */
  forDanchu?(no: string, authorization: string | undefined): Promise<{ ok: true; brief: DanchuQuoteBrief } | { ok: false; error: DanchuLookupError }>;
}

/** 단추 연동 모드의 요청 찾기: DC-... 는 단추 입구(croQuote)로, 그 밖에는 레거시 저장소로 */
export class DanchuRequestDirectory implements RequestDirectory {
  constructor(
    private readonly api: { croQuote(token: string, no: string): Promise<{ ok: true; data: DanchuQuoteBrief } | { ok: false; error: DanchuLookupError }> },
    private readonly legacy?: RequestDirectory,
  ) {}
  async forCro(requestId: string, croOrgId: string) {
    return this.legacy ? this.legacy.forCro(requestId, croOrgId) : null;
  }
  async forDanchu(no: string, authorization: string | undefined) {
    // 단추 입구와 같은 토큰 모양(danchuAuth BEARER)만 넘긴다
    const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorization ?? "")?.[1];
    if (!token) return { ok: false as const, error: "unauthorized" as const };
    const r = await this.api.croQuote(token, no);
    return r.ok ? { ok: true as const, brief: r.data } : r;
  }
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
