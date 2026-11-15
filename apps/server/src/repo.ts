import type { ApprovalDecision, OutboundDraft } from "@danchuai/core";

export interface OutboundRepo {
  get(id: string): Promise<OutboundDraft | null>;
  /** 새 초안. 같은 id가 있으면 실패한다. */
  insert(d: OutboundDraft): Promise<void>;
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
  async insert(d: OutboundDraft) {
    if (this.drafts.has(d.id)) throw new Error("duplicate_draft");
    this.drafts.set(d.id, { ...d });
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
