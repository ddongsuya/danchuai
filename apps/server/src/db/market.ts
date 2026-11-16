import { randomInt } from "node:crypto";
import { computeTotals, EMPTY_SHEET, SHEET_FIELDS, type QuoteLine, type RequestSheet } from "@danchuai/core";
import type pg from "pg";
import type { Transport } from "../transport";
import { tx, UUID, type Pool } from "./pool";

// 요청 보내기·회신·선정. 서버 연결은 RLS를 우회하므로 모든 쿼리를 세션의 조직으로 거른다.
// 원칙: 기관 목록은 가나다순, 회신은 도착 순. 선정 전에는 기관 쪽 결과에 의뢰자 이름·연락처를 넣지 않는다.

export type RecipientStatus = "received" | "viewed" | "replied" | "declined" | "selected" | "not_selected";
export type RequestStatus = "draft" | "sent" | "selected" | "closed";

export interface Lab {
  id: string;
  name: string;
}

export interface QuoteView {
  lines: QuoteLine[];
  subtotalWon: number;
  totalWithVatWon: number;
  durationWeeks: number | null;
  body: string | null;
  sentAt: string;
}

export interface RequesterListItem {
  conversationId: string;
  requestId: string | null;
  title: string;
  /** drafting: 대화 중, waiting: 보낼 본문 승인 대기, sent/selected/closed: 요청 상태 */
  status: "drafting" | "waiting" | "sent" | "selected" | "closed";
  recipients: number;
  replies: number;
  updatedAt: string;
  /** 단추 요청만: 비교표가 열렸는지(열리기 전에는 기관명·금액 없음) */
  compareOpen?: boolean;
}

export interface RequesterDetail {
  id: string;
  conversationId: string | null;
  title: string;
  status: RequestStatus;
  sheet: RequestSheet;
  sentAt: string | null;
  selectedOrgId: string | null;
  recipients: Array<{
    labId: string;
    labName: string;
    status: RecipientStatus;
    receivedAt: string;
    viewedAt: string | null;
    repliedAt: string | null;
    quote: QuoteView | null;
  }>;
}

export interface LabInboxItem {
  requestId: string;
  title: string;
  status: RecipientStatus;
  dueDate: string | null;
  receivedAt: string;
  conversationId: string | null;
}

export interface LabDetail {
  requestId: string;
  title: string;
  sheet: RequestSheet;
  message: string | null;
  status: RecipientStatus;
  receivedAt: string;
  conversationId: string | null;
  myQuote: QuoteView | null;
  /** 이 기관이 선정됐을 때만 채운다 */
  requester: { orgName: string; name: string | null; email: string | null; selectedAt: string } | null;
}

export type SelectResult = "ok" | "not_found" | "not_open" | "not_replied";

export interface MarketRepo {
  labs(): Promise<Lab[]>;
  /** 모두 가입한 기관(kind = cro)이면 true */
  areLabs(ids: string[]): Promise<boolean>;
  /** 의뢰자 대화의 요청 행. 없으면 만들고, 이미 선정·종료됐으면 "closed". */
  ensureRequest(input: { conversationId: string; orgId: string; sheet: RequestSheet }): Promise<string | "closed">;
  /** 기관이 이 요청에 회신할 수 있으면 true(받은 기관이고 미선정이 아님) */
  canReply(requestId: string, labOrgId: string): Promise<boolean>;
  requesterList(orgId: string): Promise<RequesterListItem[]>;
  requesterDetail(orgId: string, requestId: string): Promise<RequesterDetail | null>;
  select(input: { orgId: string; userId: string; requestId: string; labOrgId: string }): Promise<SelectResult>;
  labInbox(labOrgId: string): Promise<LabInboxItem[]>;
  labDetail(labOrgId: string, requestId: string): Promise<LabDetail | null>;
  markViewed(labOrgId: string, requestId: string): Promise<void>;
}

export function requestTitle(sheet: Partial<RequestSheet>): string {
  const parts = [sheet.species, sheet.duration, sheet.testType].filter((s): s is string => Boolean(s && s.trim()));
  const t = parts.join(" ").trim();
  return (t || "새 요청").slice(0, 80);
}

const toSheet = (s: Partial<RequestSheet> | null): RequestSheet => {
  const out = { ...EMPTY_SHEET };
  for (const f of SHEET_FIELDS) if (typeof s?.[f] === "string") out[f] = s[f]!;
  return out;
};

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

function newCode(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  let s = "";
  for (let i = 0; i < 4; i++) s += "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[randomInt(31)];
  return `R-${ymd}-${s}`;
}

type QuoteRow = {
  lines: QuoteLine[];
  subtotal_won: string;
  total_with_vat_won: string | null;
  duration_weeks: number | null;
  body: string | null;
  created_at: Date;
};
const toQuote = (q: QuoteRow | null): QuoteView | null =>
  q && {
    lines: q.lines,
    subtotalWon: Number(q.subtotal_won),
    totalWithVatWon: q.total_with_vat_won === null ? computeTotals(q.lines).totalWithVatWon : Number(q.total_with_vat_won),
    durationWeeks: q.duration_weeks,
    body: q.body,
    sentAt: iso(q.created_at)!,
  };

// 기관별 최신 회신 견적
const LATEST_QUOTE = `(select row_to_json(x) from (
  select q.lines, q.subtotal_won::text, q.total_with_vat_won::text, q.duration_weeks, q.body, q.created_at
    from quotes q where q.request_id = rr.request_id and q.org_id = rr.cro_org_id
   order by q.created_at desc limit 1) x)`;

export class PgMarketRepo implements MarketRepo {
  constructor(private readonly pool: Pool) {}

  async labs() {
    const { rows } = await this.pool.query<Lab>(`select id, name from orgs where kind = 'cro' order by name, id`);
    return rows;
  }

  async areLabs(ids: string[]) {
    if (!ids.every((id) => UUID.test(id))) return false;
    const uniq = [...new Set(ids)];
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from orgs where kind = 'cro' and id = any($1::uuid[])`,
      [uniq],
    );
    return rows[0]!.n === uniq.length;
  }

  async ensureRequest(input: { conversationId: string; orgId: string; sheet: RequestSheet }) {
    return tx(this.pool, async (c) => {
      const cur = await c.query<{ id: string; status: RequestStatus }>(
        `select id, status from requests where conversation_id = $1 and org_id = $2 for update`,
        [input.conversationId, input.orgId],
      );
      const title = requestTitle(input.sheet);
      if (cur.rows[0]) {
        const r = cur.rows[0];
        if (r.status === "selected" || r.status === "closed") return "closed" as const;
        // 보내기 전 마지막 요청서로 맞춘다(이미 받은 기관도 같은 요청을 본다).
        await c.query(`update requests set sheet = $2, title = $3 where id = $1`, [r.id, JSON.stringify(input.sheet), title]);
        return r.id;
      }
      const ins = await c.query<{ id: string }>(
        `insert into requests (org_id, code, status, sheet, title, conversation_id, reply_due)
         values ($1, $2, 'draft', $3, $4, $5, null) returning id`,
        [input.orgId, newCode(), JSON.stringify(input.sheet), title, input.conversationId],
      );
      return ins.rows[0]!.id;
    });
  }

  async canReply(requestId: string, labOrgId: string) {
    if (!UUID.test(requestId)) return false;
    const { rowCount } = await this.pool.query(
      `select 1 from request_recipients rr join requests r on r.id = rr.request_id
        where rr.request_id = $1 and rr.cro_org_id = $2
          and rr.status in ('received', 'viewed', 'replied', 'selected') and r.status in ('sent', 'selected')`,
      [requestId, labOrgId],
    );
    return rowCount === 1;
  }

  async requesterList(orgId: string) {
    const { rows } = await this.pool.query<{
      conversation_id: string;
      request_id: string | null;
      title: string | null;
      sheet: Partial<RequestSheet>;
      status: RequestStatus | null;
      waiting: boolean;
      recipients: number;
      replies: number;
      updated_at: Date;
    }>(
      `select c.id as conversation_id, r.id as request_id, r.title, coalesce(r.sheet, c.sheet) as sheet, r.status,
              (c.draft is not null and coalesce((c.draft->>'outboundCreated')::boolean, false) = false) as waiting,
              (select count(*)::int from request_recipients rr where rr.request_id = r.id) as recipients,
              (select count(*)::int from request_recipients rr where rr.request_id = r.id and rr.replied_at is not null) as replies,
              greatest(c.updated_at, coalesce(r.sent_at, c.updated_at), coalesce(r.selected_at, c.updated_at),
                       coalesce((select max(rr.replied_at) from request_recipients rr where rr.request_id = r.id), c.updated_at)) as updated_at
         from conversations c left join requests r on r.conversation_id = c.id
        where c.org_id = $1 and c.role = 'requester' and c.mode = 'request' and c.turns > 0
        order by updated_at desc limit 100`,
      [orgId],
    );
    return rows.map((r): RequesterListItem => ({
      conversationId: r.conversation_id,
      requestId: r.request_id,
      title: r.title ?? requestTitle(r.sheet ?? {}),
      status: r.status && r.status !== "draft" ? r.status : r.waiting ? "waiting" : "drafting",
      recipients: r.recipients,
      replies: r.replies,
      updatedAt: iso(r.updated_at)!,
    }));
  }

  async requesterDetail(orgId: string, requestId: string) {
    if (!UUID.test(requestId)) return null;
    const r = await this.pool.query<{
      id: string;
      conversation_id: string | null;
      title: string | null;
      status: RequestStatus;
      sheet: Partial<RequestSheet>;
      sent_at: Date | null;
      selected_org_id: string | null;
    }>(`select id, conversation_id, title, status, sheet, sent_at, selected_org_id from requests where id = $1 and org_id = $2`, [
      requestId,
      orgId,
    ]);
    const req = r.rows[0];
    if (!req) return null;
    const recips = await this.pool.query<{
      cro_org_id: string;
      name: string;
      status: RecipientStatus;
      received_at: Date;
      viewed_at: Date | null;
      replied_at: Date | null;
      quote: QuoteRow | null;
    }>(
      `select rr.cro_org_id, o.name, rr.status, rr.received_at, rr.viewed_at, rr.replied_at, ${LATEST_QUOTE} as quote
         from request_recipients rr join orgs o on o.id = rr.cro_org_id
        where rr.request_id = $1
        order by rr.replied_at asc nulls last, o.name, o.id`,
      [requestId],
    );
    const detail: RequesterDetail = {
      id: req.id,
      conversationId: req.conversation_id,
      title: req.title ?? requestTitle(req.sheet),
      status: req.status,
      sheet: toSheet(req.sheet),
      sentAt: iso(req.sent_at),
      selectedOrgId: req.selected_org_id,
      recipients: recips.rows.map((x) => ({
        labId: x.cro_org_id,
        labName: x.name,
        status: x.status,
        receivedAt: iso(x.received_at)!,
        viewedAt: iso(x.viewed_at),
        repliedAt: iso(x.replied_at),
        quote: toQuote(x.quote ? { ...x.quote, created_at: new Date(x.quote.created_at) } : null),
      })),
    };
    return detail;
  }

  async select(input: { orgId: string; userId: string; requestId: string; labOrgId: string }): Promise<SelectResult> {
    if (!UUID.test(input.requestId) || !UUID.test(input.labOrgId)) return "not_found";
    return tx(this.pool, async (c) => {
      const r = await c.query<{ status: RequestStatus }>(`select status from requests where id = $1 and org_id = $2 for update`, [
        input.requestId,
        input.orgId,
      ]);
      if (!r.rows[0]) return "not_found";
      if (r.rows[0].status !== "sent") return "not_open";
      const rr = await c.query(`select 1 from request_recipients where request_id = $1 and cro_org_id = $2 and replied_at is not null`, [
        input.requestId,
        input.labOrgId,
      ]);
      if (!rr.rowCount) return "not_replied";
      await c.query(
        `update requests set status = 'selected', selected_org_id = $2, selected_by = $3, selected_at = now() where id = $1`,
        [input.requestId, input.labOrgId, input.userId],
      );
      await c.query(
        `update request_recipients set status = case when cro_org_id = $2 then 'selected' else 'not_selected' end where request_id = $1`,
        [input.requestId, input.labOrgId],
      );
      return "ok";
    });
  }

  async labInbox(labOrgId: string) {
    const { rows } = await this.pool.query<{
      request_id: string;
      title: string | null;
      sheet: Partial<RequestSheet>;
      status: RecipientStatus;
      received_at: Date;
      conversation_id: string | null;
    }>(
      `select rr.request_id, r.title, r.sheet, rr.status, rr.received_at,
              (select c.id from conversations c where c.org_id = $1 and c.request_id = rr.request_id
                order by c.created_at desc limit 1) as conversation_id
         from request_recipients rr join requests r on r.id = rr.request_id
        where rr.cro_org_id = $1 and r.status in ('sent', 'selected', 'closed')
        order by rr.received_at desc limit 100`,
      [labOrgId],
    );
    return rows.map((r): LabInboxItem => ({
      requestId: r.request_id,
      title: r.title ?? requestTitle(r.sheet),
      status: r.status,
      dueDate: r.sheet?.dueDate ?? null,
      receivedAt: iso(r.received_at)!,
      conversationId: r.conversation_id,
    }));
  }

  async labDetail(labOrgId: string, requestId: string) {
    if (!UUID.test(requestId)) return null;
    const { rows } = await this.pool.query<{
      title: string | null;
      sheet: Partial<RequestSheet>;
      message: string | null;
      status: RecipientStatus;
      received_at: Date;
      conversation_id: string | null;
      quote: QuoteRow | null;
      selected: boolean;
      selected_at: Date | null;
      org_name: string | null;
      display_name: string | null;
      email: string | null;
    }>(
      `select r.title, r.sheet, rr.message, rr.status, rr.received_at,
              (select c.id from conversations c where c.org_id = $2 and c.request_id = r.id order by c.created_at desc limit 1) as conversation_id,
              ${LATEST_QUOTE} as quote,
              (r.selected_org_id = $2) as selected, r.selected_at,
              case when r.selected_org_id = $2 then o.name end as org_name,
              case when r.selected_org_id = $2 then m.display_name end as display_name,
              case when r.selected_org_id = $2 then u.email end as email
         from request_recipients rr
         join requests r on r.id = rr.request_id
         join orgs o on o.id = r.org_id
         left join members m on m.org_id = r.org_id and m.user_id = r.selected_by
         left join auth.users u on u.id = r.selected_by
        where rr.request_id = $1 and rr.cro_org_id = $2`,
      [requestId, labOrgId],
    );
    const x = rows[0];
    if (!x) return null;
    const detail: LabDetail = {
      requestId,
      title: x.title ?? requestTitle(x.sheet),
      sheet: toSheet(x.sheet),
      message: x.message,
      status: x.status,
      receivedAt: iso(x.received_at)!,
      conversationId: x.conversation_id,
      myQuote: toQuote(x.quote ? { ...x.quote, created_at: new Date(x.quote.created_at) } : null),
      requester:
        x.selected && x.org_name
          ? { orgName: x.org_name, name: x.display_name, email: x.email, selectedAt: iso(x.selected_at)! }
          : null,
    };
    return detail;
  }

  async markViewed(labOrgId: string, requestId: string) {
    if (!UUID.test(requestId)) return;
    await this.pool.query(
      `update request_recipients set status = 'viewed', viewed_at = now()
        where request_id = $1 and cro_org_id = $2 and status = 'received'`,
      [requestId, labOrgId],
    );
  }
}

/**
 * 앱 안 전달. 승인된 초안을 상대 조직의 받은 요청함(또는 의뢰자의 회신 목록)에 넣는다.
 * 한 트랜잭션으로 넣고, 넣지 못하면 throw(발송 결과는 unknown으로 남는다).
 */
export class InAppTransport implements Transport {
  constructor(private readonly pool: Pool) {}

  async deliver(draft: { id: string }): Promise<"sent" | "unknown"> {
    return tx(this.pool, async (c) => {
      const d = (
        await c.query<{
          kind: "request" | "reply" | "question";
          org_id: string;
          counterparty_org_id: string;
          body: string;
          conversation_id: string | null;
          quote_lines: QuoteLine[] | null;
          duration_weeks: number | null;
        }>(
          `select kind, org_id, counterparty_org_id, body, conversation_id, quote_lines, duration_weeks
             from outbound_drafts where id = $1`,
          [draft.id],
        )
      ).rows[0];
      if (!d || !d.conversation_id) throw new Error("no_source");
      if (d.kind === "request") return this.deliverRequest(c, draft.id, d);
      if (d.kind === "reply") return this.deliverReply(c, draft.id, d);
      throw new Error("unsupported_kind");
    });
  }

  private async deliverRequest(
    c: pg.PoolClient,
    draftId: string,
    d: { org_id: string; counterparty_org_id: string; body: string; conversation_id: string | null },
  ) {
    const r = await c.query<{ id: string }>(
      `select id from requests where conversation_id = $1 and org_id = $2 and status in ('draft', 'sent') for update`,
      [d.conversation_id, d.org_id],
    );
    const req = r.rows[0];
    if (!req) throw new Error("request_closed");
    const lab = await c.query(`select 1 from orgs where id = $1 and kind = 'cro'`, [d.counterparty_org_id]);
    if (!lab.rowCount) throw new Error("not_a_lab");
    // 같은 기관에 다시 보내면 아직 회신 전일 때만 본문을 바꾼다.
    await c.query(
      `insert into request_recipients (request_id, cro_org_id, message, draft_id, status, received_at)
       values ($1, $2, $3, $4, 'received', now())
       on conflict (request_id, cro_org_id) do update
         set message = excluded.message, draft_id = excluded.draft_id, received_at = now(), status = 'received', viewed_at = null
         where request_recipients.status in ('received', 'viewed')`,
      [req.id, d.counterparty_org_id, d.body, draftId],
    );
    await c.query(`update requests set status = 'sent', sent_at = coalesce(sent_at, now()) where id = $1`, [req.id]);
    return "sent" as const;
  }

  private async deliverReply(
    c: pg.PoolClient,
    draftId: string,
    d: { org_id: string; counterparty_org_id: string; body: string; conversation_id: string | null; quote_lines: QuoteLine[] | null; duration_weeks: number | null },
  ) {
    const conv = await c.query<{ request_id: string | null }>(`select request_id from conversations where id = $1 and org_id = $2`, [
      d.conversation_id,
      d.org_id,
    ]);
    const requestId = conv.rows[0]?.request_id;
    if (!requestId) throw new Error("no_request");
    const rr = await c.query(
      `select 1 from request_recipients rr join requests r on r.id = rr.request_id
        where rr.request_id = $1 and rr.cro_org_id = $2 and r.org_id = $3
          and rr.status in ('received', 'viewed', 'replied', 'selected')
        for update of rr`,
      [requestId, d.org_id, d.counterparty_org_id],
    );
    if (!rr.rowCount) throw new Error("not_open");
    const lines = d.quote_lines ?? [];
    const t = computeTotals(lines); // 금액은 코드만 계산한다
    await c.query(
      `insert into quotes (org_id, request_id, lines, subtotal_won, total_with_vat_won, duration_weeks, body, draft_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (draft_id) do nothing`,
      [d.org_id, requestId, JSON.stringify(lines), t.subtotalWon, t.totalWithVatWon, d.duration_weeks, d.body, draftId],
    );
    await c.query(
      `update request_recipients set status = case when status = 'selected' then status else 'replied' end,
              replied_at = coalesce(replied_at, now())
        where request_id = $1 and cro_org_id = $2`,
      [requestId, d.org_id],
    );
    return "sent" as const;
  }
}
