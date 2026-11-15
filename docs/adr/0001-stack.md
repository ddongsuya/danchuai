# 0001 기술 선택

- 날짜: 2026-11-15
- 상태: 채택

## 결정

- 앱: Expo(React Native, TypeScript, Expo Router). iOS·Android를 한 코드로, 빌드·스토어 제출은 EAS.
- 서버: Hono(Node). AI 호출과 보내기는 서버에서만 한다. 앱에는 API 키가 없다.
- DB: 새 Supabase 프로젝트(Postgres + Auth). 모든 표에 org_id와 RLS 정책.
- 공통 규칙: packages/core. 금액 계산, 보내기 장부 상태, 문장 점검, AI 공급사 설정.
- AI 공급사: Claude와 OpenAI를 환경 변수 AGENT_PROVIDER로 바꾼다. 기본값은 평가 세트 결과로 정한다.

## 비교한 안

| 안 | 버린 이유 |
| --- | --- |
| Flutter | Dart라 기존 TypeScript 자산·스킬과 따로 논다 |
| 웹앱(PWA) 먼저 | iOS 푸시·설치 제약, 결국 다시 만들어야 한다 |
| Swift + Kotlin | 코드가 두 벌이라 한 사람이 유지하기 어렵다 |

## 지켜야 할 것

- 에이전트 도구는 읽기·초안뿐이다. 보내기·승인 도구를 만들지 않는다(core의 assertReadOnlyTools).
- 승인은 초안 판(epoch)과 본문 sha256에 묶인다. 승인 한 건에 발송 시도는 한 번.
- AI가 쓴 금액은 쓰지 않는다. 금액은 computeTotals로만 계산한다.
- 기관 추천·순위 문구를 내보내지 않는다(core의 checkSentence).
