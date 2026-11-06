-- 수업 일지. 월 화면은 반 시간표로 수업 줄을 자동으로 보여 주고(휴강일 제외),
-- 선생님이 수업 내용을 적거나 줄을 직접 추가·숨기면 그때 이 표에 저장한다.
-- 결석 표시는 growing_attendance(결석 상태)를 그대로 쓴다.

create table if not exists growing_lesson_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  start_time text not null default '' check (start_time = '' or start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text not null default '' check (end_time = '' or end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  class_id uuid references growing_classes(id) on delete set null,
  class_name text not null default '',
  student_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(student_ids) = 'array'),
  content text not null default '' check (char_length(content) <= 2000),
  -- 시간표로 생긴 줄을 이 날만 숨길 때 true (예: 그 반만 쉬는 날)
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 날·같은 반·같은 시작 시각의 줄은 하나만 둔다(시간표 줄과 저장된 줄을 맞추는 키).
create unique index if not exists idx_growing_lesson_logs_slot
  on growing_lesson_logs (owner_id, date, class_id, start_time)
  where class_id is not null;
create index if not exists idx_growing_lesson_logs_owner_date
  on growing_lesson_logs (owner_id, date);

alter table growing_lesson_logs enable row level security;

create policy "owner_select" on growing_lesson_logs for select using (auth.uid() = owner_id);
create policy "owner_insert" on growing_lesson_logs for insert with check (auth.uid() = owner_id);
create policy "owner_update" on growing_lesson_logs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_delete" on growing_lesson_logs for delete using (auth.uid() = owner_id);
