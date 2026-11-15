# 견적 에이전트 (danchuai)

의뢰자와 기관 담당자가 채팅으로 일을 맡기면 AI가 비임상 견적의 요청, 회신, 비교를 대신 진행하는 휴대폰 앱. 단추(danchu.kr)와는 별도 프로젝트다(코드·DB 공유 없음).

- 기획서: https://claude.ai/artifact/SLCxhCUjM165S7oRXDWKZV
- 기술 결정: docs/adr/0001-stack.md
- 디자인: 시안 v3 (Manus·Codex·Perplexity 흐름 기반, 무채색 + 청록·호박 상태색, 원티드 산스). 색은 apps/mobile/src/constants/theme.ts 에서만 정한다. 단추 디자인은 쓰지 않는다.

## 구조

- apps/mobile: Expo 앱. Expo 규칙은 apps/mobile/AGENTS.md (Expo는 SDK마다 바뀐다. 기억 말고 문서를 본다).
- apps/server: Hono 서버. AI 호출, 보내기 장부 API.
- packages/core: 금액 계산, 보내기 상태, 문장 점검, AI 공급사 설정. 순수 함수, 테스트 필수.
- supabase/migrations: 스키마. 모든 표에 org_id + RLS 정책.

## 반드시 지킬 것

1. 상대에게 나가는 것은 사람이 승인한 정확한 본문만, 한 번만. 에이전트에 보내기 도구를 주지 않는다.
2. 기관을 추천하거나 순위를 매기지 않는다. 비교표는 회신 도착 순.
3. 금액은 코드가 계산한다. AI가 쓴 금액은 버린다.
4. 선정 전에는 의뢰자 회사명·연락처를 기관 화면과 AI 입력에 넣지 않는다.
5. 조직 구분(org_id)은 서버 세션에서만 가져온다. 요청 본문의 org_id는 믿지 않는다.
6. 로그에 프롬프트·본문을 남기지 않는다.
7. 화면 문구는 해요체, 명사형 짧은 라벨. 조작 방법을 풀어 쓰는 설명 문구는 넣지 않는다. 화면 문자열에 em dash를 쓰지 않는다.

## 검사

```bash
npm install
npm run typecheck
npm test
```
