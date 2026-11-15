-- 0004 조직 만들기·초대 코드 (2026-11-15)
-- 더하기만 한다. 되돌리기는 맨 아래 down 주석.

-- 1) 구성원 이름(앱에 보이는 이름). 회사 연락처가 아니라 같은 조직 안에서만 쓴다.
alter table members add column display_name text check (char_length(display_name) between 1 and 40);

-- 2) 초대 코드: 원문은 저장하지 않고 sha256만 둔다. 한 사람만, 만료 전까지만 쓴다.
create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((used_by is null) = (used_at is null))
);
create index invites_org_idx on invites (org_id, created_at desc);
create index invites_created_by_idx on invites (created_by);
create index invites_used_by_idx on invites (used_by) where used_by is not null;

alter table invites enable row level security;
create policy invites_read_own on invites for select to authenticated using (is_member(org_id));

-- 3) 권한: 앱은 읽기만, 로그인 전에는 아무것도. Supabase 기본 권한이 새 표에 쓰기를 주므로 직접 회수한다.
revoke all on invites from anon;
revoke insert, update, delete, truncate on invites from authenticated;
grant select on invites to authenticated;
-- 앞으로 만드는 표도 같은 기본값으로 시작한다.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;

-- down:
-- alter default privileges in schema public grant all on tables to anon;
-- alter default privileges in schema public grant insert, update, delete, truncate on tables to authenticated;
-- drop table invites;
-- alter table members drop column display_name;
