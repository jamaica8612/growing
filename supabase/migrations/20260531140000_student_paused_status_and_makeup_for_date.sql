-- 1. 휴원 상태 허용
alter table public.growing_students
  drop constraint growing_students_status_check;

alter table public.growing_students
  add constraint growing_students_status_check
  check (status = any (array['active','inactive','paused']));

-- 2. 보강 연결 날짜 컬럼
alter table public.growing_attendance
  add column if not exists makeup_for_date date;
