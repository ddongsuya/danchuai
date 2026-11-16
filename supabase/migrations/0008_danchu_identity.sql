-- 단추 계정으로 로그인 (연동 2단계, 2026-11-17). 기준: handoff-to-gpt-1117 5장.
-- 사용자·역할·기관은 단추가 정한다. 에이전트 DB에는 단추 신원 열쇠로 작업 공간 한 줄(orgs)만 두고,
-- 대화·초안·승인 기록을 거기에 묶는다. 단추 계정 id는 이 프로젝트의 auth.users에 없으므로 그 참조를 푼다.

-- 작업 공간 열쇠: 'cro:<단추 기관 id>' 또는 'user:<단추 계정 id>'. 이전 방식으로 만든 조직은 비어 있다.
alter table orgs add column if not exists danchu_key text;
create unique index if not exists orgs_danchu_key on orgs (danchu_key);

-- 단추 계정 id를 담는 열의 auth.users 참조를 푼다(값은 그대로 uuid)
alter table conversations drop constraint if exists conversations_created_by_fkey;
alter table approvals drop constraint if exists approvals_decided_by_fkey;
alter table requests drop constraint if exists requests_selected_by_fkey;

-- 국외 이전·AI 처리 동의 (단추 계정별, 판마다). 단추 쪽 동의 기록은 연동 3단계에서 함께 남긴다.
create table if not exists agent_consents (
  danchu_user_id uuid not null,
  version text not null,
  agreed_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (danchu_user_id, version)
);
alter table agent_consents enable row level security;
-- 앱이 직접 읽지 않는다(서버 연결만). 정책을 두지 않으면 anon·authenticated는 읽고 쓸 수 없다.
