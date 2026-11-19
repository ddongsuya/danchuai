-- 기관 비서 (에이전트 액션 등록부, 2026-11-19). 0011(PR #29)과 따로 적용해도 된다.
-- 1) conversations.mode 'assist': 기관 비서 대화. 받은 요청·단추 요청 번호 없이 연다.
--    비서는 단추 액션 목록의 바로 실행(auto) 액션만 도구로 쓴다(기관 안 기록). 밖으로 나가는 일은 확인 카드로만.
-- 2) assist_runs: 비서·앱이 바로 실행한 단추 액션 기록. 누가(user_id) 무엇을(action) 했고 결과가 어땠는지.
--    본문·프롬프트·바꾼 값은 넣지 않는다. 되돌리기에 쓰는 값은 단추(agent_action_log)에만 있다.
--    처리방침 3항 "견적 에이전트 대화와 승인 기록: 탈퇴하거나 동의를 철회할 때까지": 단추 삭제 요청(purge)이 오면
--    그 계정의 줄을 지운다(서버 purge 가 user_id 로 지운다).
-- RLS: 앱은 직접 읽지 않는다(서버 연결만). 정책이 없으니 anon·authenticated 는 읽고 쓸 수 없다. 권한도 거둔다.

alter table conversations drop constraint if exists conversations_mode_check;
alter table conversations add constraint conversations_mode_check check (mode in ('request', 'ask', 'assist'));

alter table conversations drop constraint if exists conversations_cro_has_request;
alter table conversations
  add constraint conversations_cro_has_request
  check (role = 'requester' or mode in ('ask', 'assist') or request_id is not null or danchu_rfq_no is not null);

-- 비서 대화는 기관 담당자만, 요청에 묶이지 않는다
alter table conversations drop constraint if exists conversations_assist_cro_only;
alter table conversations
  add constraint conversations_assist_cro_only
  check (mode <> 'assist' or (role = 'cro' and request_id is null and danchu_rfq_no is null));

create table if not exists assist_runs (
  id uuid primary key,
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null,
  conversation_id uuid references conversations (id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z_]{1,39}$'),
  label text not null check (char_length(label) between 1 and 60),
  outcome text not null check (outcome in ('done', 'failed', 'unknown')),
  danchu_log_id uuid,
  undoable boolean not null default false,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assist_runs_user_idx on assist_runs (org_id, user_id, created_at desc);
create index if not exists assist_runs_conv_idx on assist_runs (conversation_id) where conversation_id is not null;
alter table assist_runs enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on table assist_runs from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on table assist_runs from authenticated'; end if;
end $$;

-- 되돌리기:
-- drop table if exists assist_runs;
-- delete from conversations where mode = 'assist';
-- alter table conversations drop constraint if exists conversations_assist_cro_only;
-- (conversations_mode_check·conversations_cro_has_request 를 0010 본문으로 다시)
