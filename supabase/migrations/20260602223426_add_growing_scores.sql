
create table if not exists growing_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references growing_students(id) on delete cascade,
  subject text not null,
  test_name text,
  score numeric not null,
  max_score numeric not null default 100,
  test_date date not null,
  memo text,
  created_at timestamptz default now()
);

alter table growing_scores enable row level security;

create policy "owner_all" on growing_scores
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index if not exists growing_scores_student_id_idx on growing_scores (student_id);
create index if not exists growing_scores_test_date_idx on growing_scores (test_date desc);
;
