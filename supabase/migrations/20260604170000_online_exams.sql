create table if not exists growing_exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid references growing_classes(id) on delete set null,
  title text not null,
  target_label text not null default '',
  topic text not null default '',
  date date not null default current_date,
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  short_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growing_exam_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id uuid not null references growing_exams(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'file', 'photo')),
  name text not null default '',
  label text not null default '',
  content_text text,
  storage_path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists growing_exam_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id uuid not null references growing_exams(id) on delete cascade,
  order_no int not null,
  type text not null check (type in ('vocab', 'grammar', 'reading', 'writing')),
  points int not null default 10 check (points > 0),
  source text not null,
  prompt text not null,
  passage text,
  choices jsonb,
  answer jsonb not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  unique (exam_id, order_no)
);

create table if not exists growing_exam_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references growing_exams(id) on delete cascade,
  student_id uuid references growing_students(id) on delete set null,
  student_name_snapshot text not null,
  submitted_at timestamptz not null default now(),
  score int not null default 0,
  total_points int not null default 0,
  status text not null default 'submitted' check (status in ('submitted', 'void')),
  graded_at timestamptz,
  unique (exam_id, student_id)
);

create table if not exists growing_exam_answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references growing_exam_submissions(id) on delete cascade,
  question_id uuid not null references growing_exam_questions(id) on delete cascade,
  answer jsonb not null,
  is_correct boolean not null default false,
  is_partial boolean not null default false,
  gained_points int not null default 0 check (gained_points >= 0),
  feedback text,
  graded_by text not null default 'auto' check (graded_by in ('auto', 'ai', 'teacher')),
  unique (submission_id, question_id)
);

create table if not exists growing_exam_result_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references growing_exams(id) on delete cascade,
  submission_id uuid not null references growing_exam_submissions(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table growing_exams enable row level security;
alter table growing_exam_materials enable row level security;
alter table growing_exam_questions enable row level security;
alter table growing_exam_submissions enable row level security;
alter table growing_exam_answers enable row level security;
alter table growing_exam_result_links enable row level security;

drop policy if exists "owner_select" on growing_exams;
create policy "owner_select" on growing_exams for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exams;
create policy "owner_insert" on growing_exams for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exams;
create policy "owner_update" on growing_exams for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete" on growing_exams;
create policy "owner_delete" on growing_exams for delete using (auth.uid() = owner_id);

drop policy if exists "owner_select" on growing_exam_materials;
create policy "owner_select" on growing_exam_materials for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exam_materials;
create policy "owner_insert" on growing_exam_materials for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exam_materials;
create policy "owner_update" on growing_exam_materials for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete" on growing_exam_materials;
create policy "owner_delete" on growing_exam_materials for delete using (auth.uid() = owner_id);

drop policy if exists "owner_select" on growing_exam_questions;
create policy "owner_select" on growing_exam_questions for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exam_questions;
create policy "owner_insert" on growing_exam_questions for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exam_questions;
create policy "owner_update" on growing_exam_questions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete" on growing_exam_questions;
create policy "owner_delete" on growing_exam_questions for delete using (auth.uid() = owner_id);

drop policy if exists "owner_select" on growing_exam_submissions;
create policy "owner_select" on growing_exam_submissions for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exam_submissions;
create policy "owner_insert" on growing_exam_submissions for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exam_submissions;
create policy "owner_update" on growing_exam_submissions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "owner_select" on growing_exam_answers;
create policy "owner_select" on growing_exam_answers for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exam_answers;
create policy "owner_insert" on growing_exam_answers for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exam_answers;
create policy "owner_update" on growing_exam_answers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "owner_select" on growing_exam_result_links;
create policy "owner_select" on growing_exam_result_links for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_exam_result_links;
create policy "owner_insert" on growing_exam_result_links for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_exam_result_links;
create policy "owner_update" on growing_exam_result_links for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists idx_growing_exams_owner_created on growing_exams (owner_id, created_at desc);
create index if not exists idx_growing_exams_short_code on growing_exams (short_code);
create index if not exists idx_growing_exam_questions_exam_order on growing_exam_questions (exam_id, order_no);
create index if not exists idx_growing_exam_submissions_exam on growing_exam_submissions (exam_id, submitted_at desc);
create index if not exists idx_growing_exam_submissions_exam_status on growing_exam_submissions (exam_id, status);
create index if not exists idx_growing_exam_answers_submission on growing_exam_answers (submission_id);
create index if not exists idx_growing_exam_result_links_token on growing_exam_result_links (token);
create index if not exists idx_growing_exam_result_links_owner_exam_submission on growing_exam_result_links (owner_id, exam_id, submission_id, created_at desc);

alter table growing_message_logs
  drop constraint if exists growing_message_logs_alert_type_check;

alter table growing_message_logs
  add constraint growing_message_logs_alert_type_check check (
    alert_type in (
      'check_in',
      'check_out',
      'homework_done',
      'homework_incomplete',
      'homework_undone',
      'payment_request',
      'payment_paid',
      'exam_result',
      'custom'
    )
  );
