-- 개인정보 약속 맞추기와 AI 이용량 상한 (2026-11-19).
-- 1) 단추 처리방침 3항 "견적 에이전트 대화와 승인 기록: 탈퇴하거나 에이전트 이용 동의를 철회할 때까지".
--    탈퇴·철회 때 그 사람의 대화·초안은 지운다(서버 purge). 같은 기관 동료의 초안에 남긴 승인은
--    기관의 보내기 기록이라 행은 두고 결정자만 비운다. 그래서 approvals.decided_by 를 비울 수 있게 한다.
-- 2) ai_usage: 계정별 하루, 조직별 한 달, 전체 한 달 AI 사용량과 비용(백만분의 1달러). 상한 확인용.
--    scope: 'user:<단추 계정 id>' | 'org:<작업 공간 id>' | 'all'. period: 'YYYY-MM-DD'(하루) 또는 'YYYY-MM'(한 달), 한국 시간.
--    프롬프트·본문은 넣지 않는다. 숫자만.

alter table approvals alter column decided_by drop not null;

create table if not exists ai_usage (
  scope text not null check (scope = 'all' or scope ~ '^(user|org):[0-9a-f-]{36}$'),
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$'),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, period)
);
alter table ai_usage enable row level security;
-- 앱이 직접 읽지 않는다(서버 연결만). 정책이 없으니 anon·authenticated 는 읽고 쓸 수 없다. 권한도 거둔다.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on table ai_usage from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on table ai_usage from authenticated'; end if;
end $$;

-- 되돌리기:
-- drop table if exists ai_usage;
-- update approvals set decided_by = '00000000-0000-0000-0000-000000000000' where decided_by is null; -- 필요할 때만
-- alter table approvals alter column decided_by set not null;
