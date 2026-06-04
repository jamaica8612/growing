alter table public.growing_attendance
  add column if not exists supplement_minutes integer;

alter table public.growing_attendance
  drop constraint if exists growing_attendance_supplement_minutes_check;

alter table public.growing_attendance
  add constraint growing_attendance_supplement_minutes_check
  check (supplement_minutes is null or (supplement_minutes >= 0 and supplement_minutes <= 360));
