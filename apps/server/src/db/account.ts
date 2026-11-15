import type { AccountOrg, AccountRepo, JoinFailure } from "../account";
import { tx, type Pool } from "./pool";
import type pg from "pg";

// 서버 연결은 RLS를 우회한다. 그래서 모든 쓰기를 "토큰의 사용자" 기준으로만 하고, 사용자별 잠금으로 동시 가입을 막는다.

type Row = { org_id: string; kind: "requester" | "cro"; name: string; role: "owner" | "member"; display_name: string | null };
const toOrg = (r: Row): AccountOrg => ({ orgId: r.org_id, kind: r.kind, name: r.name, memberRole: r.role, displayName: r.display_name });

const MINE = `select m.org_id, o.kind, o.name, m.role, m.display_name from members m join orgs o on o.id = m.org_id where m.user_id = $1`;

async function lockUser(c: pg.PoolClient, userId: string) {
  await c.query(`select pg_advisory_xact_lock(hashtextextended($1, 7))`, [`member:${userId}`]);
}

export class PgAccountRepo implements AccountRepo {
  constructor(private readonly pool: Pool) {}

  async me(userId: string) {
    const { rows } = await this.pool.query<Row>(MINE, [userId]);
    if (rows.length > 1) return "multiple" as const;
    return rows[0] ? toOrg(rows[0]) : null;
  }

  async createOrg(userId: string, input: { kind: "requester" | "cro"; name: string; displayName: string }) {
    return tx(this.pool, async (c) => {
      await lockUser(c, userId);
      if ((await c.query(MINE, [userId])).rowCount) return "already_member" as const;
      const org = await c.query<{ id: string }>(`insert into orgs (kind, name) values ($1, $2) returning id`, [input.kind, input.name]);
      await c.query(`insert into members (user_id, org_id, role, display_name) values ($1, $2, 'owner', $3)`, [userId, org.rows[0]!.id, input.displayName]);
      return toOrg((await c.query<Row>(MINE, [userId])).rows[0]!);
    });
  }

  async createInvite(userId: string, codeHash: string, expiresAt: Date) {
    // 소속이 정확히 하나이고 그 조직의 소유자일 때만 넣는다.
    const r = await this.pool.query(
      `insert into invites (org_id, code_hash, created_by, expires_at)
       select m.org_id, $2, $1, $3 from members m
       where m.user_id = $1 and m.role = 'owner' and (select count(*) from members x where x.user_id = $1) = 1`,
      [userId, codeHash, expiresAt],
    );
    return r.rowCount === 1;
  }

  async acceptInvite(userId: string, codeHash: string, displayName: string): Promise<AccountOrg | JoinFailure> {
    return tx(this.pool, async (c) => {
      await lockUser(c, userId);
      if ((await c.query(MINE, [userId])).rowCount) return "already_member" as const;
      // 쓰기 조건에 만료·미사용을 함께 건다. 동시에 두 사람이 같은 코드를 써도 한 명만 된다.
      const used = await c.query<{ org_id: string }>(
        `update invites set used_by = $1, used_at = now()
         where code_hash = $2 and used_at is null and expires_at > now() returning org_id`,
        [userId, codeHash],
      );
      if (!used.rowCount) {
        const why = await c.query<{ used: boolean }>(`select used_at is not null as used from invites where code_hash = $1`, [codeHash]);
        if (!why.rowCount) return "not_found" as const;
        return why.rows[0]!.used ? ("used" as const) : ("expired" as const);
      }
      await c.query(`insert into members (user_id, org_id, role, display_name) values ($1, $2, 'member', $3)`, [userId, used.rows[0]!.org_id, displayName]);
      return toOrg((await c.query<Row>(MINE, [userId])).rows[0]!);
    });
  }
}
