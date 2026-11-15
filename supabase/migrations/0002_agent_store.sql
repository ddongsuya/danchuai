-- 0002 대화 저장소·보내기 장부 보강 (2026-11-15)
-- 더하기만 한다(기존 열·행을 지우거나 바꾸지 않음). 아직 데이터가 없는 표라 인덱스는 일반 CREATE INDEX로 만든다.
-- 데이터가 쌓인 뒤 비슷한 변경을 할 때는 CREATE INDEX CONCURRENTLY를 별도 마이그레이션으로 쓴다.
-- 되돌리기: 맨 아래 "down" 주석의 문장을 순서대로 실행한다.

-- 1) 대화 상태: 서버가 매 턴 읽고 쓰는 값
alter table conversations
  add column role text not null default 'requester' check (role in ('requester', 'cro')),
  add column request_id uuid references requests (id) on delete cascade,
  add column sheet jsonb not null default '{}',
  add column question jsonb,
  add column summary jsonb,
  add column draft jsonb,
  add column turns int not null default 0 check (turns >= 0),
  add column input_tokens bigint not null default 0 check (input_tokens >= 0),
  add column output_tokens bigint not null default 0 check (output_tokens >= 0),
  add column cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  add column cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  -- 한 대화에 한 턴만: 서버가 조건부 UPDATE로 잡고 끝나면 비운다. 오래된 잠금(2분)은 넘겨받는다.
  add column turn_started_at timestamptz,
  add column updated_at timestamptz not null default now();
alter table conversations add constraint conversations_cro_has_request check (role = 'requester' or request_id is not null);

-- 2) 받은 요청의 요청서 칸(회사명·연락처 칸 없음)
alter table requests add column sheet jsonb not null default '{}';

-- 3) 보내기 초안: 어느 대화의 몇 번째 판에서 나왔는지. 같은 판·같은 상대에게는 한 번만.
alter table outbound_drafts
  add column conversation_id uuid references conversations (id) on delete set null,
  add column draft_version int check (draft_version >= 1);
alter table outbound_drafts add constraint outbound_once_per_version unique (conversation_id, draft_version, counterparty_org_id);
alter table outbound_drafts add constraint outbound_not_self check (counterparty_org_id <> org_id);

-- 4) 외래 키·조직 열 인덱스(RLS의 is_member(org_id) 조건과 조인에 쓰인다)
create index members_org_idx on members (org_id);
create index conversations_org_idx on conversations (org_id, created_at desc);
create index conversations_request_idx on conversations (request_id) where request_id is not null;
create index messages_conversation_idx on messages (conversation_id, id);
create index messages_org_idx on messages (org_id);
create index agent_steps_conversation_idx on agent_steps (conversation_id);
create index agent_steps_org_idx on agent_steps (org_id);
create index request_items_request_idx on request_items (request_id);
create index request_items_org_idx on request_items (org_id);
create index request_recipients_cro_idx on request_recipients (cro_org_id);
create index rate_cards_org_idx on rate_cards (org_id);
create index quotes_org_idx on quotes (org_id);
create index quotes_request_idx on quotes (request_id);
create index outbound_drafts_org_idx on outbound_drafts (org_id);
create index outbound_drafts_counterparty_idx on outbound_drafts (counterparty_org_id);
create index approvals_org_idx on approvals (org_id);
create index approvals_decided_by_idx on approvals (decided_by);
create index deliveries_org_idx on deliveries (org_id);
create index deliveries_draft_idx on deliveries (draft_id);
create index conversations_created_by_idx on conversations (created_by);

-- 5) is_member: auth.uid()를 한 번만 계산하도록 select로 감싼다(Supabase RLS 권장)
create or replace function is_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.user_id = (select auth.uid()) and m.org_id = target)
$$;

-- 6) 앱(authenticated)은 읽기만. 쓰기는 서버 연결만 한다(정책도 select뿐이지만 권한에서도 막는다).
grant select on all tables in schema public to authenticated;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

-- down (되돌리기, 위에서 아래 순서):
-- revoke select on all tables in schema public from authenticated;
-- (is_member는 0001 본문으로 다시 create or replace)
-- drop index ... (위 4번의 인덱스 20개);
-- alter table outbound_drafts drop constraint outbound_not_self, drop constraint outbound_once_per_version,
--   drop column draft_version, drop column conversation_id;
-- alter table requests drop column sheet;
-- alter table conversations drop constraint conversations_cro_has_request, drop column updated_at, drop column turn_started_at,
--   drop column cache_write_tokens, drop column cache_read_tokens, drop column output_tokens, drop column input_tokens,
--   drop column turns, drop column draft, drop column summary, drop column question, drop column sheet,
--   drop column request_id, drop column role;
