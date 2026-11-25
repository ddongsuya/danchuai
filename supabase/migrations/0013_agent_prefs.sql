-- 비서 캐릭터(Muse 시안 2026-11-25). 단추 계정별로 고른 캐릭터 하나. 이름은 캐릭터 이름을 따른다(따로 저장하지 않음).
-- 값은 packages/core/src/characters.ts 목록만 받는다(서버가 확인한다).
create table if not exists agent_prefs (
  danchu_user_id uuid primary key,
  character text not null default 'danchu',
  updated_at timestamptz not null default now()
);
alter table agent_prefs enable row level security;
-- 앱이 직접 읽지 않는다(서버 연결만). 정책을 두지 않으면 anon·authenticated는 읽고 쓸 수 없다.
