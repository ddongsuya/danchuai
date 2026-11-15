# 0004 로그인·조직 가입·초대 (2026-11-15)

## 결정

- 로그인은 Supabase Auth: **Google**(OAuth, PKCE)과 **이메일·비밀번호 회원가입**(가입 때 6자리 이메일 인증 코드). 사용자 요청(11-15).
- 조직은 로그인과 분리한다. 토큰에는 사람만 있고, 조직·역할은 서버가 `members` 표에서 찾는다.
- 조직이 없는 사람은 둘 중 하나: **조직 만들기**(만든 사람이 소유자) 또는 **초대 코드로 참여**.
- 초대 코드: `XXXX-XXXX`(헷갈리는 0 O 1 I L 제외, 약 2^40), 7일 만료, 한 사람만. DB에는 `sha256("invite:" + 코드)`만 남는다. 소유자만 만든다.
- 시안: `/mnt/project-files/danchuai-design/auth/auth-v2.html`(승인 11-15).

## 서버 (`/account`, 조직 없어도 들어오는 경로라 `/v1`과 분리)

| 경로 | 하는 일 | 오류 |
|---|---|---|
| `GET /account/me` | 내 조직(없으면 null) | 401, 409 multiple_orgs |
| `POST /account/org` `{kind, name, displayName}` | 조직 만들기 | 400, 409 already_member |
| `POST /account/invites` | 초대 코드(원문은 이 응답에만) | 403 소유자 아님 |
| `POST /account/join` `{code, displayName}` | 초대 수락 | 404 not_found, 410 expired/used, 409, 429 |

- 동시 가입·동시 수락은 사용자별 advisory lock + 조건부 UPDATE로 하나만 된다(`test/pg.test.ts`).
- 코드 맞히기 제한: 사용자당 10분 10번(메모리). 서버를 여러 대로 늘리면 공용 저장소로 옮긴다.
- 0004: `members.display_name`, `invites`(RLS 자기 조직 읽기만, anon 없음), 새 표의 기본 권한에서 쓰기 회수.

## 앱

- `src/lib/supabase.ts`(공개 키만, 휴대폰은 expo-sqlite localStorage에 세션), `session.tsx`(loading, signedOut, recovery, needsOrg, ready), `Stack.Protected`로 화면을 나눈다.
- 서버 호출은 Supabase 세션 토큰. 로그인이 꺼져 있으면(환경 변수 없음) 예전처럼 시연·개발 토큰.

## 사람이 할 설정 (Supabase 대시보드)

1. Authentication > Sign In / Providers > Email: 켜기, Confirm email 켜기.
2. Authentication > Emails > **Confirm signup**, **Reset password** 템플릿에 `{{ .Token }}`(6자리 코드)를 넣는다.
3. Authentication > URL Configuration > Redirect URLs: `danchuai://auth/callback`, 웹 주소.
4. Google: Google Cloud 콘솔에서 OAuth 클라이언트(웹) 만들기 → 승인된 리디렉션 URI `https://wrqkvydefavmotsupwab.supabase.co/auth/v1/callback` → 클라이언트 ID·비밀번호를 Supabase Google 제공자에 넣기.
5. 기본 메일 발송은 시간당 몇 통·조직 구성원 주소로만 가므로, 실제 사용 전 SMTP(예: Resend)를 연결한다.

## 남은 것

- 로그아웃·계정 화면, 구성원 목록·내보내기, 소유자 넘기기.
- 여러 조직 소속(지금은 409로 막음).
