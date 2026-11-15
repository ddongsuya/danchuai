-- 0003 is_member 실행 권한 좁히기 (2026-11-15, Supabase 보안 점검 0028 대응)
-- 로그인 전(anon)은 RPC로 부를 이유가 없다. RLS 정책이 authenticated 로 평가하므로 그 권한만 남긴다.
-- 되돌리기: grant execute on function public.is_member(uuid) to public;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
