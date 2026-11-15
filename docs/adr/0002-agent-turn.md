# 0002. 에이전트 대화 한 턴의 모양

- 상태: 채택 (2026-11-15)
- 참고 스킬: claude-api, ECC agent-harness-construction, api-design, agent-security-hardening, operator-approval-loop, counterparty-channel-discipline, prompt-caching-strategy, cost-aware-llm-pipeline

## 결정

1. **한 턴 = 모델 호출 1회.** 도구 결과를 모델에 되돌려 주는 반복(루프)은 하지 않는다. 모델이 부르는 도구는 서버가 해석하는 "구조화 출력"이고, 바깥으로 아무것도 하지 않는다.
2. **도구는 역할별로 고정, 순서도 고정**(캐시 접두부를 지키기 위해).
   - 의뢰자: `update_sheet`(요청서 칸 채우기), `ask_question`(빈 칸 질문 카드), `draft_body`(기관에 보낼 요청 본문 초안)
   - 기관: `summarize_request`(요청 요약), `draft_body`(의뢰자에게 보낼 회신 본문 초안)
   - 보내기·승인·결제 도구는 없다. `assertReadOnlyTools`가 서버 시작 때 막는다.
3. **경계에서 다시 검사한다.** 모델이 준 도구 입력은 zod로 검사하고, 틀리면 버린다(프롬프트의 지시만 믿지 않는다).
4. **본문 초안은 문장 점검을 통과한 문장만 남긴다.** 금액·순위·추천·연락처가 든 문장은 뺀다. 남은 문장이 없으면 초안을 만들지 않는다.
5. **금액은 코드가 붙인다.** 기관 회신 초안의 금액 줄은 `computeTotals`로 계산해 서버가 본문 뒤에 붙인다. AI 본문에는 금액을 허용하지 않는다.
6. **선정 전 신원 보호.** 사용자 입력의 메일·전화번호는 모델에 보내기 전에 `[연락처 생략]`으로 바꾼다. 요청서에는 회사명 칸이 없다.
7. **조직은 세션에서만.** 대화는 만든 조직만 읽고 쓸 수 있다. 다른 조직이면 404.
8. **받는 곳은 사람이 고른다.** AI는 기관을 고르지 않는다. 보내기 초안(장부)은 사람이 받는 곳을 넣고 `POST /v1/agent/conversations/:id/outbound`를 부를 때, 서버가 가진 점검 통과 본문으로 만든다. 앱이 보낸 본문은 받지 않는다.

## API

| 메서드 | 경로 | 내용 |
|---|---|---|
| POST | `/v1/agent/conversations` | 새 대화. 역할은 세션에서 |
| GET | `/v1/agent/conversations/:id` | 대화 상태(메시지, 요청서, 질문, 초안) |
| POST | `/v1/agent/conversations/:id/turn` | `{ text }` 를 보내면 SSE로 답한다 |
| POST | `/v1/agent/conversations/:id/outbound` | `{ recipientOrgIds }` 로 보내기 초안을 만든다. 승인·발송은 기존 `/v1/outbound/*` |

### SSE 이벤트 (`event:` 이름, `data:` JSON)

| 이벤트 | 데이터 | 뜻 |
|---|---|---|
| `step` | `{ label }` | 진행 줄 |
| `text` | `{ delta }` | 답 글자 조각 |
| `sheet` | `{ sheet, missing }` | 요청서와 빈 칸 |
| `question` | `{ field, question, options }` | 질문 카드 |
| `summary` | `{ points }` | 기관용 요청 요약 |
| `draft` | `{ body, dropped }` | 점검 통과 본문, 뺀 문장 수 |
| `done` | `{ usage }` | 끝. 토큰 사용량 |
| `error` | `{ code }` | `agent_unavailable` `turn_limit` `refused` `truncated` `provider_error` |

## 한도

- 입력 2,000자, 대화당 40턴, 모델에 보내는 이전 메시지 최근 20개, 출력 1,200토큰.
- 재시도는 공급사 SDK의 일시 오류 재시도만. 인증·검증 오류는 다시 부르지 않는다.

## 비용·캐시

- 시스템 프롬프트와 도구 목록은 바뀌지 않는다(날짜·아이디를 넣지 않는다). 요청서 상태처럼 바뀌는 내용은 마지막 사용자 메시지 뒤에 붙인다.
- 기본 모델 `claude-sonnet-5-5`, `effort: low`. `AGENT_MODEL`로 바꾼다. OpenAI는 `AGENT_PROVIDER=openai`.
- 턴마다 사용량(입력·출력·캐시 읽기·캐시 쓰기)을 대화에 쌓는다. 본문·프롬프트는 로그에 남기지 않는다.

## 로컬 실행

```bash
# 서버 (키가 없으면 대화는 503, 나머지는 동작)
cd apps/server
ANTHROPIC_API_KEY=... AUTH_DEV_TOKENS="req-개발용토큰16자이상:requester:req-org,cro-개발용토큰16자이상:cro:cro-a" npm run dev

# 앱 (값이 없으면 시연 화면)
cd apps/mobile
EXPO_PUBLIC_AGENT_URL=http://localhost:8787 EXPO_PUBLIC_AGENT_TOKEN=req-개발용토큰 EXPO_PUBLIC_AGENT_LAB_TOKEN=cro-개발용토큰 npx expo start
```

새 요청(요청함의 "새 요청")과 기관 요청함의 `rat-4w`가 실제 대화로 열린다.

## 남은 일

- 받는 기관 고르기 화면. 지금은 시연 기관 3곳을 받는 곳으로 쓴다. 운영에서는 서버가 받는 곳이 실제 기관 조직인지 확인해야 한다.
- 대화·장부 저장소를 Supabase 구현으로 바꾸기(지금은 메모리). 동시 턴 잠금도 DB로.
- 실제 키로 캐시 적중 확인. 시스템 프롬프트+도구가 Sonnet 5.5 최소 캐시 길이(512토큰)를 넘는지, 두 번째 턴에 `cache_read_input_tokens > 0`인지 본다.
- 회사명은 패턴으로 못 거른다. 요청서에 회사명 칸이 없고 본문은 요청서 내용만 쓰도록 했지만, 사용자가 대화에 회사명을 쓰면 모델에 간다.
