# 견적 에이전트 (danchuai)

의뢰자와 기관 담당자가 채팅으로 일을 맡기면 AI가 비임상 견적의 요청, 회신, 비교를 대신 진행하는 휴대폰 앱. 단추(danchu.kr, 저장소 ddongsuya/danchu)와 연동된 하나의 서비스다(2026-11-17 사용자 확정). 계정·데이터는 단추가 원장이고, 코드·서버·배포는 따로 둔다.

- 기획서: https://claude.ai/artifact/SLCxhCUjM165S7oRXDWKZV
- 단추 연결 설계: https://claude.ai/artifact/BxYAAtQEzA7Bd63DUJh9Mt
- 액션 등록부·기관 비서 사양: docs/spec/agent-actions.md (단추 액션 목록을 읽어 비서 도구·확인 카드를 만든다. 실행 수준 read·auto·confirm·human)
- 기술 결정: docs/adr/0001-stack.md (0001~0004는 연동 전 독립 앱 기준이라 일부 낡음. 연동 규칙은 아래 "단추 연동"이 우선)
- 디자인: 시안 v3 (Manus·Codex·Perplexity 흐름 기반, 무채색 + 청록·호박 상태색, 원티드 산스). 색은 apps/mobile/src/constants/theme.ts 에서만 정한다. 단추 디자인은 쓰지 않는다.

## 구조

- apps/mobile: Expo 앱. Expo 규칙은 apps/mobile/AGENTS.md (Expo는 SDK마다 바뀐다. 기억 말고 문서를 본다).
- apps/server: Hono 서버. AI 호출, 보내기 장부 API, 단추 연결(danchu.ts·danchuAuth.ts·danchuRoutes.ts·danchuActions.ts), 기관 비서(danchuAssist.ts·runs.ts).
- packages/core: 금액 계산, 보내기 상태, 문장 점검, AI 공급사 설정. 순수 함수, 테스트 필수.
- packages/knowledge: 가이드라인 원문 조각 검색과 단추 공개 기준 자료(요청서 항목 체계·시험 묶음·효력 영역). 만드는 법 scripts/knowledge/README.md. 단추 DB·기관 단가·회원 자료는 넣지 않는다(2026-11-16 사용자 결정).
- supabase/migrations: 에이전트 DB 스키마. 모든 표에 org_id + RLS 정책. 연동 전의 의뢰·견적·조직 표는 정리 예정(연동 6단계).

## 단추 연동

- 로그인은 단추 계정(단추 Supabase 인증) 하나. 에이전트 자체 가입은 없다.
- 회원·의뢰·견적·CRM·청구는 단추 DB에만 있다. 에이전트는 복사본을 두지 않고 단추 `/api/agent/*`로만 읽고 쓴다. 사용자의 단추 액세스 토큰을 Bearer로 넘기고, 서비스 키는 받지 않는다.
- 에이전트 DB에는 대화, AI 이용량, 승인 전 초안, 보내기 장부, 동의 기록처럼 에이전트에만 필요한 것만 둔다.
- 단추 쪽 변경이 필요하면 단추 저장소에 별도 PR을 만들고 두 PR을 서로 링크한다. 단추 입구를 먼저 운영에 반영한 뒤 그 입구를 부르는 에이전트 코드를 병합한다. 단추 PR 병합은 사용자 승인 뒤.

## 반드시 지킬 것

1. 상대에게 나가는 것은 사람이 승인한 정확한 본문만, 한 번만. 에이전트에 보내기 도구를 주지 않는다.
2. 기관을 추천하거나 순위를 매기지 않는다. 비교표는 회신 도착 순.
3. 금액은 코드가 계산한다. AI가 쓴 금액은 버린다.
4. 선정 전에는 의뢰자 회사명·연락처를 기관 화면과 AI 입력에 넣지 않는다.
5. 조직 구분(org_id)은 서버 세션에서만 가져온다. 요청 본문의 org_id는 믿지 않는다.
6. 로그에 프롬프트·본문을 남기지 않는다.
7. 가이드라인 답은 원문 조각에 있는 내용만, 근거 문서·조항을 붙인다. 원문에 없으면 짐작하지 않는다.
8. 화면 문구는 해요체, 명사형 짧은 라벨. 조작 방법을 풀어 쓰는 설명 문구는 넣지 않는다. 화면 문자열에 em dash를 쓰지 않는다.

## 검사

```bash
npm install
npm run typecheck
npm test
```
