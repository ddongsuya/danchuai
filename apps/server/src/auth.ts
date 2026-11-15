// 로그인 사용자와 조직은 서버 세션에서만 가져온다. 요청 본문에 실린 orgId는 믿지 않는다.
// 실제 구현(Supabase JWT 검증)은 구현 순서 3단계에서 붙인다.

export interface Session {
  userId: string;
  orgId: string;
  role: "requester" | "cro";
}

export interface AuthResolver {
  /** Authorization 헤더 값으로 세션을 찾는다. 없거나 틀리면 null. */
  resolve(authorization: string | undefined): Promise<Session | null>;
}

/**
 * 개발용 토큰 인증. AUTH_DEV_TOKENS="토큰:역할:조직,..." 운영(NODE_ENV=production)에서는 켜지지 않는다.
 * 실제 인증(Supabase JWT 검증)이 붙으면 이 함수는 로컬 실행에만 쓴다.
 */
export function devAuthFromEnv(env: Record<string, string | undefined>): AuthResolver | null {
  if (env.NODE_ENV === "production" || !env.AUTH_DEV_TOKENS) return null;
  const table = new Map<string, Session>();
  for (const entry of env.AUTH_DEV_TOKENS.split(",")) {
    const [token, role, orgId] = entry.trim().split(":");
    if (!token || token.length < 16 || (role !== "requester" && role !== "cro") || !orgId) {
      throw new Error("AUTH_DEV_TOKENS 형식은 토큰(16자 이상):requester|cro:조직");
    }
    table.set(`Bearer ${token}`, { userId: `dev-${role}`, orgId, role });
  }
  return { resolve: async (h) => (h ? table.get(h) ?? null : null) };
}
