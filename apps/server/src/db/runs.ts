import type { AssistRun, RunRepo } from "../runs";
import { UUID, type Pool } from "./pool";

type Row = {
  id: string;
  org_id: string;
  user_id: string;
  conversation_id: string | null;
  action: string;
  label: string;
  outcome: AssistRun["outcome"];
  danchu_log_id: string | null;
  undoable: boolean;
  undone_at: Date | string | null;
  created_at: Date | string;
};
const COLS = "id, org_id, user_id, conversation_id, action, label, outcome, danchu_log_id, undoable, undone_at, created_at";
const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : v);
const toRun = (r: Row): AssistRun => ({
  id: r.id,
  orgId: r.org_id,
  userId: r.user_id,
  conversationId: r.conversation_id,
  action: r.action,
  label: r.label,
  outcome: r.outcome,
  danchuLogId: r.danchu_log_id,
  undoable: r.undoable,
  undoneAt: r.undone_at ? iso(r.undone_at) : null,
  createdAt: iso(r.created_at),
});

export class PgRunRepo implements RunRepo {
  constructor(private readonly pool: Pool) {}

  async insert(r: AssistRun) {
    await this.pool.query(
      `insert into assist_runs (id, org_id, user_id, conversation_id, action, label, outcome, danchu_log_id, undoable, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [r.id, r.orgId, r.userId, r.conversationId, r.action, r.label.slice(0, 60), r.outcome, r.danchuLogId, r.undoable, r.createdAt],
    );
  }

  async get(id: string, orgId: string, userId: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<Row>(`select ${COLS} from assist_runs where id = $1 and org_id = $2 and user_id = $3`, [id, orgId, userId]);
    return rows[0] ? toRun(rows[0]) : null;
  }

  async markUndone(id: string, at: string) {
    const r = await this.pool.query(`update assist_runs set undone_at = $2 where id = $1 and undone_at is null`, [id, at]);
    return (r.rowCount ?? 0) > 0;
  }

  async clearUndone(id: string) {
    await this.pool.query(`update assist_runs set undone_at = null where id = $1`, [id]);
  }

  async recent(orgId: string, userId: string, limit: number) {
    const { rows } = await this.pool.query<Row>(`select ${COLS} from assist_runs where org_id = $1 and user_id = $2 order by created_at desc limit $3`, [orgId, userId, limit]);
    return rows.map(toRun);
  }
}
