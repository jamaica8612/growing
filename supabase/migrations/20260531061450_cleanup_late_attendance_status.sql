-- 지각(late) 상태는 앱에서 제거됨. 잔존 데이터를 출석(present)으로 정규화하고
-- 체크 제약에서도 late를 제외해 더 이상 들어오지 못하게 한다.
update public.growing_attendance set status = 'present' where status = 'late';

alter table public.growing_attendance
  drop constraint growing_attendance_status_check;

alter table public.growing_attendance
  add constraint growing_attendance_status_check
  check (status = any (array['present','absent','makeup']));;
