import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthResolver, Session } from "./auth";
import { UUID, type Pool } from "./db/pool";

// Supabase 로그인 토큰을 검증해 세션을 만든다. 조직과 역할은 토큰이 아니라 members·orgs 표에서 찾는다.
// 요청 본문이나 헤더로 온 조직 값은 쓰지 않는다.

export interface Membership {
  orgId: string;
  kind: "requester" | "cro";
}

export interface SupabaseAuthOptions {
  /** 서명 키. 운영은 프로젝트 JWKS, 테스트는 로컬 키. */
  key: JWTVerifyGetKey | Uint8Array;
  issuer: string;
  memberships: (userId: string) => Promise<Membership[]>;
}

export interface Identity {
  userId: string;
  email: string | null;
}

/** 토큰만 확인한다(조직 없음도 통과). 가입·초대 수락처럼 조직이 생기기 전 단계에 쓴다. */
export interface IdentityResolver {
  verify(authorization: string | undefined): Promise<Identity | null>;
}

export function supabaseIdentity(opts: Omit<SupabaseAuthOptions, "memberships">): IdentityResolver {
  return {
    async verify(authorization) {
      const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorization ?? "");
      if (!m) return null;
      try {
        const { payload } = await jwtVerify(m[1]!, opts.key as JWTVerifyGetKey, {
          issuer: opts.issuer,
          audience: "authenticated",
          algorithms: opts.key instanceof Uint8Array ? ["HS256"] : ["ES256", "RS256"],
          clockTolerance: 5,
        });
        if (payload.role !== "authenticated") return null;
        const sub = payload.sub;
        if (typeof sub !== "string" || !UUID.test(sub)) return null;
        const email = typeof payload.email === "string" ? payload.email : null;
        return { userId: sub, email };
      } catch {
        return null; // 만료·서명 불일치·형식 오류. 이유는 밖으로 알리지 않는다.
      }
    },
  };
}

export function supabaseAuth(opts: SupabaseAuthOptions): AuthResolver {
  const identity = supabaseIdentity(opts);
  return {
    async resolve(authorization) {
      const who = await identity.verify(authorization);
      if (!who) return null;
      const ms = await opts.memberships(who.userId);
      // 한 사람이 여러 조직에 속하면 지금은 받지 않는다(조직 고르기 화면이 생기면 바꾼다).
      if (ms.length !== 1) return null;
      const session: Session = { userId: who.userId, orgId: ms[0]!.orgId, role: ms[0]!.kind };
      return session;
    },
  };
}

export const pgMemberships = (pool: Pool) => async (userId: string): Promise<Membership[]> => {
  const { rows } = await pool.query<{ org_id: string; kind: "requester" | "cro" }>(
    `select m.org_id, o.kind from members m join orgs o on o.id = m.org_id where m.user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({ orgId: r.org_id, kind: r.kind }));
};

/** 환경 변수로 만든다. SUPABASE_URL이 있으면 그 프로젝트의 JWKS, SUPABASE_JWT_SECRET이 있으면 옛 HS256 비밀키. */
export function supabaseKeyFromEnv(env: Record<string, string | undefined>): { key: JWTVerifyGetKey | Uint8Array; issuer: string } | null {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL 형식이 달라요 (https://<프로젝트>.supabase.co)");
  }
  const issuer = `${url}/auth/v1`;
  const key = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return { key, issuer };
}

export function supabaseAuthFromEnv(env: Record<string, string | undefined>, pool: Pool): AuthResolver | null {
  const k = supabaseKeyFromEnv(env);
  return k ? supabaseAuth({ ...k, memberships: pgMemberships(pool) }) : null;
}
