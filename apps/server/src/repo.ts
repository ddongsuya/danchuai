import type { ApprovalDecision, OutboundDraft } from "@danchuai/core";

export interface DraftSource {
  conversationId: string;
  /** 본문 초안의 판. 단추 동작(kind danchu)은 판 없이 대화만 잇는다(한 대화에서 여러 동작) */
  version?: number;
  /** 기관 회신: 사람이 넣은 견적 줄. 발송 때 서버가 합계를 계산해 quotes로 옮긴다. */
  quoteLines?: Array<{ label: string; amountWon: number }>;
  durationWeeks?: number;
}

/** 보낸 것 기록 한 줄(단추 동작). 본문 원문과 단추 응답을 그대로 준다. 화면이 필요한 것만 고른다 */
export interface SentRow {
  id: string;
  status: OutboundDraft["status"];
  text: string;
  updatedAt: string;
  /** 승인한 사람과 시각(승인 전이면 null) */
  decidedBy: string | null;
  decidedAt: string | null;
  result: unknown;
}

export interface OutboundRepo {
  get(id: string): Promise<OutboundDraft | null>;
  /**
   * 새 초안 여러 개를 한꺼번에 넣는다. source가 있으면 같은 대화·같은 판·같은 상대에는 한 번만 들어간다.
   * 이미 있으면 아무것도 넣지 않고 false.
   */
  insertBatch(drafts: OutboundDraft[], source?: DraftSource): Promise<boolean>;
  /** 기대한 판(epoch)과 상태일 때만 저장한다. 동시에 두 요청이 와도 하나만 이긴다. */
  saveIf(next: OutboundDraft, expect: { epoch: number; status: OutboundDraft["status"] }): Promise<boolean>;
  saveDecision(d: ApprovalDecision): Promise<void>;
  latestApproval(draftId: string): Promise<ApprovalDecision | null>;
  /** 단추 동작(kind danchu)의 단추 응답. 다른 종류는 쓰지 않는다 */
  saveResult(draftId: string, result: unknown): Promise<void>;
  getResult(draftId: string): Promise<unknown>;
  /** 초안을 만든 대화. 없으면 null(대화 없이 만든 단추 동작 등) */
  conversationOf(draftId: string): Promise<string | null>;
  /** 이 조직의 단추 동작 최근 것부터(초안만 있고 승인하지 않은 것은 빼고) */
  listDanchuSent(orgId: string, limit: number): Promise<SentRow[]>;
}

/** 테스트·로컬용. 운영은 Postgres(supabase/migrations) 구현으로 바꾼다. */
export class MemoryOutboundRepo implements OutboundRepo {
  private drafts = new Map<string, OutboundDraft>();
  private decisions: ApprovalDecision[] = [];
  private results = new Map<string, unknown>();
  private touched = new Map<string, string>();
  private seq = 0;
  /** 메모리 구현의 시각: 같은 밀리초에도 순서가 남게 한 칸씩 늘린다 */
  private now() {
    return new Date(Date.UTC(2026, 0, 1) + ++this.seq * 1000).toISOString();
  }
  async listDanchuSent(orgId: string, limit: number) {
    const rows: SentRow[] = [];
    for (const d of this.drafts.values()) {
      if (d.orgId !== orgId || d.kind !== "danchu" || d.status === "drafted") continue;
      const a = [...this.decisions].reverse().find((x) => x.draftId === d.id);
      rows.push({ id: d.id, status: d.status, text: d.text, updatedAt: this.touched.get(d.id) ?? "", decidedBy: a?.decidedBy ?? null, decidedAt: a ? (this.touched.get(`${d.id}:decided`) ?? null) : null, result: this.results.get(d.id) ?? null });
    }
    return rows.sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1)).slice(0, limit);
  }
  async saveResult(id: string, result: unknown) {
    this.results.set(id, result);
  }
  async getResult(id: string) {
    return this.results.get(id) ?? null;
  }

  seed(d: OutboundDraft) {
    this.drafts.set(d.id, { ...d });
  }
  private sources = new Set<string>();
  private convOf = new Map<string, string>();
  async insertBatch(drafts: OutboundDraft[], source?: DraftSource) {
    // 같은 판·같은 상대에는 한 번만(판이 없는 단추 동작은 여러 번 만들 수 있다. DB unique 와 같은 규칙)
    const keys = source && source.version != null ? drafts.map((d) => `${source.conversationId}:${source.version}:${d.counterpartyOrgId}`) : [];
    if (keys.some((k) => this.sources.has(k)) || drafts.some((d) => this.drafts.has(d.id))) return false;
    keys.forEach((k) => this.sources.add(k));
    drafts.forEach((d) => this.drafts.set(d.id, { ...d }));
    if (source) drafts.forEach((d) => this.convOf.set(d.id, source.conversationId));
    return true;
  }
  async conversationOf(id: string) {
    return this.convOf.get(id) ?? null;
  }
  async get(id: string) {
    const d = this.drafts.get(id);
    return d ? { ...d } : null;
  }
  async saveIf(next: OutboundDraft, expect: { epoch: number; status: OutboundDraft["status"] }) {
    const cur = this.drafts.get(next.id);
    if (!cur || cur.epoch !== expect.epoch || cur.status !== expect.status) return false;
    this.drafts.set(next.id, { ...next });
    this.touched.set(next.id, this.now());
    return true;
  }
  async saveDecision(d: ApprovalDecision) {
    this.decisions.push({ ...d });
    this.touched.set(`${d.draftId}:decided`, this.now());
  }
  async latestApproval(draftId: string) {
    const list = this.decisions.filter((d) => d.draftId === draftId && d.decision === "approve");
    return list.at(-1) ?? null;
  }
}
