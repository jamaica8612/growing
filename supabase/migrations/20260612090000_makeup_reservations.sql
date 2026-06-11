-- 보강 예약: 출결 기록과 분리된 보강/보충 일정. 완료 처리 시 출결(makeup) 기록을 생성한다.
create table if not exists growing_makeup_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references growing_students(id) on delete cascade,
  class_id uuid references growing_classes(id) on delete set null,
  scheduled_date date not null,
  scheduled_time text not null default '',
  source_absence_date date,
  reason text not null default 'absence' check (reason in ('absence', 'supplement', 'other')),
  memo text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table growing_makeup_reservations enable row level security;

drop policy if exists "owner_select" on growing_makeup_reservations;
create policy "owner_select" on growing_makeup_reservations
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_makeup_reservations;
create policy "owner_insert" on growing_makeup_reservations
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_update" on growing_makeup_reservations;
create policy "owner_update" on growing_makeup_reservations
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "owner_delete" on growing_makeup_reservations;
create policy "owner_delete" on growing_makeup_reservations
  for delete using (auth.uid() = owner_id);

create index if not exists idx_growing_makeup_reservations_owner_date
  on growing_makeup_reservations (owner_id, scheduled_date);

create index if not exists idx_growing_makeup_reservations_student
  on growing_makeup_reservations (student_id, status);
