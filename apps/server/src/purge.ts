// 탈퇴·동의 철회 때 에이전트 대화·승인 기록 지우기 (2026-11-19, 단추 처리방침 3항).
// - 단추가 탈퇴·철회를 받으면 POST /internal/danchu/purge 로 알린다(단추 lib/agent-purge.ts).
//   서명: HMAC-SHA256(AGENT_PURGE_SECRET, `${timestamp}.${본문}`) 16진수, x-danchu-timestamp(초)·x-danchu-signature 머리글.
//   5분 안의 요청만 받는다. 여러 번 받아도 결과가 같다.
// - 에이전트 앱에서 철회하면(/account/consent/revoke) 같은 지우기를 바로 한다.
// 지우는 것: 그 사람이 연 대화(메시지·단계 포함), 그 대화의 보내기 초안(승인·발송 기록 포함),
//   의뢰자 작업 공간(user:<id>)의 초안 전부, 그 사람이 승인한 대화 없는 단추 동작 초안.
//   같은 기관 동료의 초안에 남긴 승인은 기관 기록이라 두고 결정자만 비운다.
// 탈퇴면 더해서: 에이전트 쪽 동의 사본, 계정별 이용량, 의뢰자 작업 공간 이름(이름·이메일일 수 있다).
import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Pool } from "./db/pool";
import { tx } from "./db/pool";

export type PurgeReason = "account_deleted" | "consent_revoked";
export const PURGE_WINDOW_SEC = 300;

export interface PurgeCounts {
  conversations: number;
  drafts: number;
}

export interface PurgeRepo {
  purge(userId: string, reason: PurgeReason): Promise<PurgeCounts>;
}

export function purgeSignature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** 서명과 시각을 확인한다. 맞으면 true */
export function verifyPurge(secret: string, timestamp: string | undefined, signature: string | undefined, body: string, nowSec: number): boolean {
  if (!secret || !timestamp || !signature || !/^\d{9,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > PURGE_WINDOW_SEC) return false;
  const want = Buffer.from(purgeSignature(secret, timestamp, body), "hex");
  const got = Buffer.from(signature, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

const Body = z.object({ userId: z.string().uuid(), reason: z.enum(["account_deleted", "consent_revoked"]) }).strict();

/** 단추 → 에이전트 삭제 요청. secret 이 없으면 503(설정 전에는 받지 않는다) */
export function purgeRoutes(deps: { secret: string | undefined; repo: PurgeRepo; now?: () => number }) {
  const app = new Hono();
  app.post("/purge", async (c) => {
    const secret = (deps.secret ?? "").trim();
    if (!secret) return c.json({ error: "not_configured" }, 503);
    const raw = await c.req.text();
    const nowSec = Math.floor((deps.now ?? Date.now)() / 1000);
    if (!verifyPurge(secret, c.req.header("x-danchu-timestamp"), c.req.header("x-danchu-signature"), raw, nowSec)) return c.json({ error: "unauthorized" }, 401);
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* 아래에서 400 */
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const counts = await deps.repo.purge(parsed.data.userId, parsed.data.reason);
    // 계정 id 는 남기지 않는다. 사유와 개수만
    console.info("danchu_purge", parsed.data.reason, counts.conversations, counts.drafts);
    return c.json({ ok: true, ...counts });
  });
  return app;
}

export class PgPurgeRepo implements PurgeRepo {
  constructor(private readonly pool: Pool) {}
  async purge(userId: string, reason: PurgeReason): Promise<PurgeCounts> {
    return tx(this.pool, async (c) => {
      const ws = (await c.query<{ id: string }>(`select id from orgs where danchu_key = $1`, [`user:${userId}`])).rows[0]?.id ?? null;
      const drafts = await c.query(
        `delete from outbound_drafts d
          where d.conversation_id in (select id from conversations where created_by = $1)
             or ($2::uuid is not null and d.org_id = $2::uuid)
             or (d.kind = 'danchu' and d.conversation_id is null
                 and exists (select 1 from approvals a where a.draft_id = d.id and a.decided_by = $1))`,
        [userId, ws],
      );
      await c.query(`update approvals set decided_by = null where decided_by = $1`, [userId]);
      const convs = await c.query(`delete from conversations where created_by = $1 or ($2::uuid is not null and org_id = $2::uuid)`, [userId, ws]);
      await c.query(`update agent_consents set revoked_at = now() where danchu_user_id = $1 and revoked_at is null`, [userId]);
      if (reason === "account_deleted") {
        await c.query(`delete from agent_consents where danchu_user_id = $1`, [userId]);
        await c.query(`delete from ai_usage where scope = $1`, [`user:${userId}`]);
        if (ws) await c.query(`update orgs set name = '삭제된 계정' where id = $1`, [ws]);
      }
      return { conversations: convs.rowCount ?? 0, drafts: drafts.rowCount ?? 0 };
    });
  }
}
