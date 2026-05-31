-- 숙제 알림 대기열: 출결 관리에서 체크한 숙제 상태를 알림장 발송 탭에 모아둔다.
create table if not exists growing_homework_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references growing_students(id) on delete cascade,
  date date not null,
  homework_status text not null check (homework_status in ('done', 'incomplete', 'undone')),
  created_at timestamptz not null default now()
);

alter table growing_homework_alerts enable row level security;

drop policy if exists "owner_select" on growing_homework_alerts;
create policy "owner_select" on growing_homework_alerts
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_homework_alerts;
create policy "owner_insert" on growing_homework_alerts
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_delete" on growing_homework_alerts;
create policy "owner_delete" on growing_homework_alerts
  for delete using (auth.uid() = owner_id);

create index if not exists idx_growing_homework_alerts_owner_created
  on growing_homework_alerts (owner_id, created_at desc);

create index if not exists idx_growing_homework_alerts_student_date
  on growing_homework_alerts (student_id, date);
