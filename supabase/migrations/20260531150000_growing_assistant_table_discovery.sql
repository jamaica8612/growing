-- 아이비(assistant)가 읽을 수 있는 growing_* 테이블 목록을 동적으로 반환한다.
-- SECURITY INVOKER라 호출자(로그인 원장)의 권한으로 실행되며, 테이블 '이름'만
-- 노출한다(데이터는 각 테이블의 RLS로 보호). 새 growing_ 테이블이 추가되면
-- 자동으로 목록에 포함되어 비서가 별도 코드 수정 없이 인지할 수 있다.
create or replace function public.growing_list_tables()
returns setof text
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select tablename::text
  from pg_tables
  where schemaname = 'public' and tablename like 'growing\_%'
  order by tablename;
$$;

revoke all on function public.growing_list_tables() from public, anon;
grant execute on function public.growing_list_tables() to authenticated;
