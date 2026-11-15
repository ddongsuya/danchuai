# ADR-0003: 대화·보내기 장부를 Supabase Postgres에, 로그인은 Supabase 토큰으로

- 상태: 채택 (2026-11-15)
- 참고 스킬: postgres-patterns, database-migrations, backend-patterns, tdd-workflow, agent-security-hardening, security-review, architecture-decision-records

## 맥락

0002(에이전트 대화) 단계에서는 대화와 보내기 장부가 서버 메모리에 있었다. 서버를 다시 켜면 대화·승인 기록이 사라지고, 서버가 두 대가 되면 "한 대화에 한 턴", "같은 판은 한 번만"을 지킬 수 없다. 로그인도 개발용 토큰뿐이었다.

## 결정

1. **서버가 Postgres에 직접 연결한다(`DATABASE_URL`).** 이 연결은 RLS를 거치지 않으므로 서버 쿼리는 모두 org_id로 거르거나, 경로에서 세션 조직과 비교한다. 앱(Supabase 클라이언트)의 직접 읽기는 RLS가 막는다. 앱 역할(authenticated)은 읽기 권한만 있다.
2. **0002 마이그레이션은 더하기만 한다.** 대화 상태 열(요청서·질문·요약·초안·턴 수·토큰 사용량·턴 잠금 시각), 요청서 칸(`requests.sheet`), 보내기 초안의 출처(`conversation_id`, `draft_version`)와 유일 조건, 외래 키 인덱스 20개.
3. **한 대화에 한 턴**: `turn_started_at`을 조건부 UPDATE로 잡는다. 2분이 지난 잠금은 넘겨받는다(서버가 턴 중에 죽은 경우).
4. **같은 판은 한 번만**: `unique (conversation_id, draft_version, counterparty_org_id)`. 동시에 두 번 눌러도 DB가 하나만 받는다.
5. **로그인**: Supabase 토큰을 프로젝트 JWKS(ES256/RS256)로 검증한다. 옛 HS256 비밀키(`SUPABASE_JWT_SECRET`)도 받는다. 발급자·대상(authenticated)·역할을 확인한다. **조직과 역할(의뢰자/기관)은 토큰이 아니라 `members`·`orgs` 표에서 찾는다.** 한 사람이 두 조직에 속하면 지금은 받지 않는다.
6. **메시지는 덧붙이기만** 한다. 저장된 개수 다음부터 넣는다.

## 다른 안

- **Supabase 클라이언트(service role 키)로 PostgREST 호출**: 트랜잭션과 조건부 UPDATE를 한 번에 하기 어렵다. 직접 연결이 잠금·유일 조건을 다루기 쉽다.
- **Redis로 턴 잠금**: 저장소가 하나 더 늘어난다. 지금 규모엔 Postgres 조건부 UPDATE로 충분하다.
- **토큰의 app_metadata에 조직 넣기**: 조직을 바꾸면 토큰이 낡는다. 표에서 매번 찾는 편이 바로 반영된다.

## 결과

- 좋아지는 점: 서버를 다시 켜도 대화·승인 기록이 남는다. 서버를 여러 대 띄워도 잠금·한 번만 규칙이 지켜진다. 다른 조직 자료는 경로 검사와 RLS 두 겹으로 막힌다.
- 나빠지는 점: 서버 연결은 RLS를 우회하므로 새 쿼리를 쓸 때 org_id 조건을 빠뜨리면 안 된다. 승인 결정(상태 변경)과 승인 기록 저장이 한 트랜잭션이 아니다(다음 단계에서 묶는다).
- 테스트: `TEST_DATABASE_URL`이 있으면 새 DB를 만들어 Supabase 흉내(auth 스키마·역할) + 마이그레이션을 적용하고 흐름·잠금·RLS·토큰 검증을 시험한다. CI는 Postgres 16 서비스로 항상 돈다.

## 운영 적용 전 필요한 것

- 견적 에이전트 전용 Supabase 프로젝트(단추 DB는 쓰지 않는다). 만들면 0001·0002를 적용하고, 서버에 `DATABASE_URL`, `SUPABASE_URL`을 넣는다.
- 앱 로그인 화면(Supabase Auth)과 조직 가입·초대 흐름.
