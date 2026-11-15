-- 견적 에이전트 첫 스키마 (2026-11-15). 기획서: 데이터와 상태 전이.
-- 원칙: 모든 표에 org_id, 행 수준 보안(RLS)을 켜고 정책을 처음부터 둔다. 금액은 원 단위 bigint.

create extension if not exists pgcrypto;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('requester', 'cro')),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- 로그인 사용자가 속한 조직인지
create function is_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.user_id = auth.uid() and m.org_id = target)
$$;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  title text,
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  created_at timestamptz not null default now()
);

-- AI가 거친 단계(도구 호출). 상대에게 보이지 않는 내부 기록.
create table agent_steps (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  tool text not null,
  status text not null check (status in ('running', 'done', 'failed')),
  summary text not null,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  code text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'closed')),
  modality text,
  route text,
  desired_start text,
  reply_due date,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  study text not null,
  detail jsonb not null default '{}'
);

-- 요청을 받은 기관. 선정 전 기관은 의뢰자 조직 이름을 보지 않는다(뷰로만 노출).
create table request_recipients (
  request_id uuid not null references requests (id) on delete cascade,
  cro_org_id uuid not null references orgs (id) on delete cascade,
  selected boolean not null default false,
  primary key (request_id, cro_org_id)
);

create table rate_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  study text not null,
  unit_won bigint not null check (unit_won >= 0),
  updated_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  request_id uuid not null references requests (id) on delete cascade,
  lines jsonb not null,
  subtotal_won bigint not null check (subtotal_won >= 0), -- 서버 computeTotals 결과만 저장
  duration_weeks int,
  created_at timestamptz not null default now()
);

-- 보내기 장부
create table outbound_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  counterparty_org_id uuid not null references orgs (id),
  kind text not null check (kind in ('request', 'reply', 'question')),
  body text not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  epoch int not null default 1 check (epoch >= 1),
  status text not null default 'drafted'
    check (status in ('drafted', 'approved', 'rejected', 'dispatching', 'sent', 'unknown')),
  updated_at timestamptz not null default now()
);

create table approvals (
  id bigint generated always as identity primary key,
  draft_id uuid not null references outbound_drafts (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  decided_by uuid not null references auth.users (id),
  decision text not null check (decision in ('approve', 'reject')),
  epoch int not null,
  body_sha256 text not null,
  decided_at timestamptz not null default now(),
  unique (draft_id, epoch) -- 한 판에 결정은 하나
);

create table deliveries (
  id bigint generated always as identity primary key,
  draft_id uuid not null references outbound_drafts (id) on delete cascade,
  approval_id bigint not null unique references approvals (id), -- 승인 한 건에 발송 한 번
  org_id uuid not null references orgs (id) on delete cascade,
  outcome text not null check (outcome in ('sent', 'unknown')),
  delivered_at timestamptz not null default now()
);

-- 행 수준 보안: 자기 조직 행만. 쓰기는 서버(service role)만 하고, 앱은 읽기만 한다.
do $$
declare t text;
begin
  foreach t in array array['conversations','messages','agent_steps','requests','request_items',
                           'rate_cards','quotes','outbound_drafts','approvals','deliveries']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (is_member(org_id))', t || '_read_own', t);
  end loop;
end $$;

alter table orgs enable row level security;
create policy orgs_read_own on orgs for select to authenticated using (is_member(id));
alter table members enable row level security;
create policy members_read_self on members for select to authenticated using (user_id = auth.uid());
alter table request_recipients enable row level security;
create policy recipients_read on request_recipients for select to authenticated
  using (is_member(cro_org_id) or exists (select 1 from requests r where r.id = request_id and is_member(r.org_id)));

revoke all on all tables in schema public from anon;
