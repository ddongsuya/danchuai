import type { ApprovalDecision, OutboundDraft } from "@danchuai/core";
import type { DraftSource, OutboundRepo } from "../repo";
import { tx, UUID, type Pool } from "./pool";

type Row = {
  id: string;
  org_id: string;
  counterparty_org_id: string;
  kind: OutboundDraft["kind"];
  body: string;
  body_sha256: string;
  epoch: number;
  status: OutboundDraft["status"];
};

const toDraft = (r: Row): OutboundDraft => ({
  id: r.id,
  orgId: r.org_id,
  counterpartyOrgId: r.counterparty_org_id,
  kind: r.kind,
  text: r.body,
  textHash: r.body_sha256,
  epoch: r.epoch,
  status: r.status,
});

export class PgOutboundRepo implements OutboundRepo {
  constructor(private readonly pool: Pool) {}

  async get(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<Row>(
      `select id, org_id, counterparty_org_id, kind, body, body_sha256, epoch, status from outbound_drafts where id = $1`,
      [id],
    );
    return rows[0] ? toDraft(rows[0]) : null;
  }

  async insertBatch(drafts: OutboundDraft[], source?: DraftSource) {
    try {
      await tx(this.pool, async (db) => {
        for (const d of drafts) {
          await db.query(
            `insert into outbound_drafts (id, org_id, counterparty_org_id, kind, body, body_sha256, epoch, status, conversation_id, draft_version, quote_lines, duration_weeks)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              d.id, d.orgId, d.counterpartyOrgId, d.kind, d.text, d.textHash, d.epoch, d.status,
              source?.conversationId ?? null, source?.version ?? null,
              source?.quoteLines ? JSON.stringify(source.quoteLines) : null, source?.durationWeeks ?? null,
            ],
          );
        }
      });
      return true;
    } catch (e) {
      // 같은 판 중복(unique_violation)만 false. 나머지는 그대로 올린다.
      if ((e as { code?: string }).code === "23505") return false;
      // 없는 기관(foreign_key_violation)은 요청 오류로 돌려준다.
      if ((e as { code?: string }).code === "23503") throw Object.assign(new Error("unknown_recipient"), { status: 400 });
      throw e;
    }
  }

  async saveIf(next: OutboundDraft, expect: { epoch: number; status: OutboundDraft["status"] }) {
    const r = await this.pool.query(
      `update outbound_drafts set body = $2, body_sha256 = $3, epoch = $4, status = $5, updated_at = now()
        where id = $1 and org_id = $6 and epoch = $7 and status = $8`,
      [next.id, next.text, next.textHash, next.epoch, next.status, next.orgId, expect.epoch, expect.status],
    );
    return r.rowCount === 1;
  }

  async saveDecision(d: ApprovalDecision) {
    await this.pool.query(
      `insert into approvals (draft_id, org_id, decided_by, decision, epoch, body_sha256)
       select id, org_id, $2, $3, $4, $5 from outbound_drafts where id = $1`,
      [d.draftId, d.decidedBy, d.decision, d.epoch, d.textHash],
    );
  }

  async latestApproval(draftId: string): Promise<ApprovalDecision | null> {
    if (!UUID.test(draftId)) return null;
    const { rows } = await this.pool.query<{ decided_by: string; epoch: number; body_sha256: string }>(
      `select decided_by, epoch, body_sha256 from approvals
        where draft_id = $1 and decision = 'approve' order by id desc limit 1`,
      [draftId],
    );
    const r = rows[0];
    return r ? { draftId, decidedBy: r.decided_by, decision: "approve", epoch: r.epoch, textHash: r.body_sha256 } : null;
  }

  async saveResult(draftId: string, result: unknown) {
    await this.pool.query(`update outbound_drafts set result = $2, updated_at = now() where id = $1`, [draftId, JSON.stringify(result ?? null)]);
  }

  async getResult(draftId: string): Promise<unknown> {
    if (!UUID.test(draftId)) return null;
    const { rows } = await this.pool.query<{ result: unknown }>(`select result from outbound_drafts where id = $1`, [draftId]);
    return rows[0]?.result ?? null;
  }
}
