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
