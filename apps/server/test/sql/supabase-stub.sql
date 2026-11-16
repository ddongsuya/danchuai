-- 테스트용: Supabase가 원래 갖고 있는 auth 스키마·역할의 최소 흉내. 운영 DB에는 적용하지 않는다.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- 역할은 클러스터 전체에 하나다. 테스트 파일이 동시에 돌면 서로 만들려다 부딪치므로 이미 있으면 넘어간다.
do $$ begin
  begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end;
  begin create role anon nologin; exception when duplicate_object or unique_violation then null; end;
end $$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
