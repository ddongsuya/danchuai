import { EMPTY_SHEET, type RequestSheet } from "@danchuai/core";
import type { Conversation, ConversationRepo, RequestDirectory } from "../agent/store";
import { askTitle, TURN_LOCK_MS, type AskListItem, type SourceView } from "../agent/store";
import { tx, UUID, type Pool } from "./pool";

type Row = {
  id: string;
  org_id: string;
  created_by: string;
  role: "requester" | "cro";
  mode: "request" | "ask" | "assist";
  request_id: string | null;
  danchu_rfq_no: string | null;
  quote: Conversation["quote"];
  sheet: Partial<RequestSheet>;
  question: Conversation["question"];
  summary: string[] | null;
  draft: Conversation["draft"];
  turns: number;
  input_tokens: string;
  output_tokens: string;
  cache_read_tokens: string;
  cache_write_tokens: string;
};

const toSheet = (j: Partial<RequestSheet> | null): RequestSheet => ({ ...EMPTY_SHEET, ...(j ?? {}) });

const COLS = `id, org_id, created_by, role, mode, request_id, danchu_rfq_no, quote, sheet, question, summary, draft, turns,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens`;

export class PgConversationRepo implements ConversationRepo {
  constructor(private readonly pool: Pool) {}

  async create(c: Conversation) {
    await this.pool.query(
      `insert into conversations (id, org_id, created_by, role, mode, request_id, danchu_rfq_no, quote, sheet)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [c.id, c.orgId, c.createdBy, c.role, c.mode, c.requestId, c.danchuNo, c.quote && JSON.stringify(c.quote), JSON.stringify(c.sheet)],
    );
  }

  async get(id: string): Promise<Conversation | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<Row>(`select ${COLS} from conversations where id = $1`, [id]);
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  async findDanchu(orgId: string, userId: string, no: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLS} from conversations
        where org_id = $1 and created_by = $2 and role = 'cro' and danchu_rfq_no = $3
        order by updated_at desc limit 1`,
      [orgId, userId, no],
    );
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  async latestAssist(orgId: string, userId: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLS} from conversations
        where org_id = $1 and created_by = $2 and mode = 'assist'
        order by updated_at desc limit 1`,
      [orgId, userId],
    );
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  private async hydrate(r: Row): Promise<Conversation> {
    const id = r.id;
    const msgs = await this.pool.query<{ role: "user" | "assistant"; body: string; sources: SourceView[] | null }>(
      `select role, body, sources from messages where conversation_id = $1 and org_id = $2 order by id`,
      [id, r.org_id],
    );
    return {
      id: r.id,
      orgId: r.org_id,
      createdBy: r.created_by,
      role: r.role,
      mode: r.mode,
      requestId: r.request_id,
      danchuNo: r.danchu_rfq_no,
      quote: r.quote,
      sheet: toSheet(r.sheet),
      messages: msgs.rows.map((m) => ({ role: m.role, content: m.body, ...(m.sources?.length ? { sources: m.sources } : {}) })),
      question: r.question,
      summary: r.summary,
      draft: r.draft,
      turns: r.turns,
      usage: {
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        cacheReadTokens: Number(r.cache_read_tokens),
        cacheWriteTokens: Number(r.cache_write_tokens),
      },
    };
  }

  async save(c: Conversation) {
    await tx(this.pool, async (db) => {
      const up = await db.query(
        `update conversations set sheet = $3, question = $4, summary = $5, draft = $6, turns = $7,
                input_tokens = $8, output_tokens = $9, cache_read_tokens = $10, cache_write_tokens = $11,
                quote = $12, danchu_rfq_no = $13, updated_at = now()
          where id = $1 and org_id = $2`,
        [
          c.id,
          c.orgId,
          JSON.stringify(c.sheet),
          c.question && JSON.stringify(c.question),
          c.summary && JSON.stringify(c.summary),
          c.draft && JSON.stringify(c.draft),
          c.turns,
          c.usage.inputTokens,
          c.usage.outputTokens,
          c.usage.cacheReadTokens,
          c.usage.cacheWriteTokens,
          c.quote && JSON.stringify(c.quote),
          c.danchuNo,
        ],
      );
      if (up.rowCount !== 1) throw new Error("conversation_missing");
      // 메시지는 덧붙이기만 한다. 저장된 수 다음부터 넣는다.
      const { rows } = await db.query<{ n: string }>(
        `select count(*) as n from messages where conversation_id = $1 and org_id = $2`,
        [c.id, c.orgId],
      );
      const fresh = c.messages.slice(Number(rows[0]!.n));
      for (const m of fresh) {
        await db.query(`insert into messages (conversation_id, org_id, role, body, sources) values ($1, $2, $3, $4, $5)`, [
          c.id,
          c.orgId,
          m.role,
          m.content,
          m.sources?.length ? JSON.stringify(m.sources) : null,
        ]);
      }
    });
  }

  async listAsks(orgId: string, userId: string, limit: number): Promise<AskListItem[]> {
    const { rows } = await this.pool.query<{ id: string; body: string | null; updated_at: Date }>(
      `select c.id, c.updated_at,
              (select m.body from messages m where m.conversation_id = c.id and m.org_id = c.org_id and m.role = 'user' order by m.id limit 1) as body
         from conversations c
        where c.org_id = $1 and c.created_by = $2 and c.mode = 'ask' and c.turns > 0
        order by c.updated_at desc limit $3`,
      [orgId, userId, limit],
    );
    return rows.map((r) => ({ id: r.id, title: askTitle([{ role: "user", content: r.body ?? "" }]), updatedAt: r.updated_at.toISOString() }));
  }

  async lockTurn(id: string, orgId: string) {
    if (!UUID.test(id)) return false;
    const r = await this.pool.query(
      `update conversations set turn_started_at = now()
        where id = $1 and org_id = $2
          and (turn_started_at is null or turn_started_at < now() - make_interval(secs => $3))`,
      [id, orgId, TURN_LOCK_MS / 1000],
    );
    return r.rowCount === 1;
  }

  async unlockTurn(id: string) {
    await this.pool.query(`update conversations set turn_started_at = null where id = $1`, [id]);
  }
}

export class PgRequestDirectory implements RequestDirectory {
  constructor(private readonly pool: Pool) {}
  async forCro(requestId: string, croOrgId: string) {
    if (!UUID.test(requestId)) return null;
    const { rows } = await this.pool.query<{ sheet: Partial<RequestSheet>; org_id: string }>(
      `select r.sheet, r.org_id from requests r
         join request_recipients rr on rr.request_id = r.id and rr.cro_org_id = $2
        where r.id = $1 and r.status in ('sent', 'selected') and rr.status <> 'not_selected'`,
      [requestId, croOrgId],
    );
    const r = rows[0];
    return r ? { sheet: toSheet(r.sheet), requesterOrgId: r.org_id } : null;
  }
}
