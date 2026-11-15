import type { ApprovalDecision, OutboundDraft } from "@danchuai/core";

export interface DraftSource {
  conversationId: string;
  version: number;
  /** 기관 회신: 사람이 넣은 견적 줄. 발송 때 서버가 합계를 계산해 quotes로 옮긴다. */
  quoteLines?: Array<{ label: string; amountWon: number }>;
  durationWeeks?: number;
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
}

/** 테스트·로컬용. 운영은 Postgres(supabase/migrations) 구현으로 바꾼다. */
export class MemoryOutboundRepo implements OutboundRepo {
  private drafts = new Map<string, OutboundDraft>();
  private decisions: ApprovalDecision[] = [];

  seed(d: OutboundDraft) {
    this.drafts.set(d.id, { ...d });
  }
  private sources = new Set<string>();
  async insertBatch(drafts: OutboundDraft[], source?: DraftSource) {
    const keys = source ? drafts.map((d) => `${source.conversationId}:${source.version}:${d.counterpartyOrgId}`) : [];
    if (keys.some((k) => this.sources.has(k)) || drafts.some((d) => this.drafts.has(d.id))) return false;
    keys.forEach((k) => this.sources.add(k));
    drafts.forEach((d) => this.drafts.set(d.id, { ...d }));
    return true;
  }
  async get(id: string) {
    const d = this.drafts.get(id);
    return d ? { ...d } : null;
  }
  async saveIf(next: OutboundDraft, expect: { epoch: number; status: OutboundDraft["status"] }) {
    const cur = this.drafts.get(next.id);
    if (!cur || cur.epoch !== expect.epoch || cur.status !== expect.status) return false;
    this.drafts.set(next.id, { ...next });
    return true;
  }
  async saveDecision(d: ApprovalDecision) {
    this.decisions.push({ ...d });
  }
  async latestApproval(draftId: string) {
    const list = this.decisions.filter((d) => d.draftId === draftId && d.decision === "approve");
    return list.at(-1) ?? null;
  }
}
