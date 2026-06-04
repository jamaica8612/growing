alter table public.growing_attendance
  drop constraint if exists growing_attendance_status_check;

alter table public.growing_attendance
  add constraint growing_attendance_status_check
  check (status = any (array['present','absent','makeup','supplement']));
