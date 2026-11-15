import { EMPTY_SHEET, type RequestSheet } from "@danchuai/core";
import type { Conversation, ConversationRepo, RequestDirectory } from "../agent/store";
import { TURN_LOCK_MS } from "../agent/store";
import { tx, UUID, type Pool } from "./pool";

type Row = {
  id: string;
  org_id: string;
  created_by: string;
  role: "requester" | "cro";
  request_id: string | null;
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

export class PgConversationRepo implements ConversationRepo {
  constructor(private readonly pool: Pool) {}

  async create(c: Conversation) {
    await this.pool.query(
      `insert into conversations (id, org_id, created_by, role, request_id, sheet)
       values ($1, $2, $3, $4, $5, $6)`,
      [c.id, c.orgId, c.createdBy, c.role, c.requestId, JSON.stringify(c.sheet)],
    );
  }

  async get(id: string): Promise<Conversation | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<Row>(
      `select id, org_id, created_by, role, request_id, sheet, question, summary, draft, turns,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
         from conversations where id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const msgs = await this.pool.query<{ role: "user" | "assistant"; body: string }>(
      `select role, body from messages where conversation_id = $1 and org_id = $2 order by id`,
      [id, r.org_id],
    );
    return {
      id: r.id,
      orgId: r.org_id,
      createdBy: r.created_by,
      role: r.role,
      requestId: r.request_id,
      sheet: toSheet(r.sheet),
      messages: msgs.rows.map((m) => ({ role: m.role, content: m.body })),
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
                input_tokens = $8, output_tokens = $9, cache_read_tokens = $10, cache_write_tokens = $11, updated_at = now()
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
        await db.query(`insert into messages (conversation_id, org_id, role, body) values ($1, $2, $3, $4)`, [
          c.id,
          c.orgId,
          m.role,
          m.content,
        ]);
      }
    });
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
        where r.id = $1 and r.status = 'sent'`,
      [requestId, croOrgId],
    );
    const r = rows[0];
    return r ? { sheet: toSheet(r.sheet), requesterOrgId: r.org_id } : null;
  }
}
