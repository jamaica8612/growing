-- 아이비 자가학습 메모: 대화 중 아이비가 스스로 저장하는 노트.
-- scope='academy': 학원 전반 원칙/말투 → system prompt에 항상 주입(cap 적용).
-- scope='student': 학생·학부모별 선호/특이사항 → recall_notes tool로 필요 시 조회.
create table if not exists growing_assistant_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  student_id  uuid references growing_students(id) on delete cascade,
  scope       text not null check (scope in ('academy', 'student')),
  category    text not null default '',
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table growing_assistant_notes enable row level security;

create policy "notes_select" on growing_assistant_notes
  for select using (auth.uid() = owner_id);

create policy "notes_insert" on growing_assistant_notes
  for insert with check (auth.uid() = owner_id);

create policy "notes_update" on growing_assistant_notes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "notes_delete" on growing_assistant_notes
  for delete using (auth.uid() = owner_id);

create index if not exists growing_assistant_notes_scope_idx
  on growing_assistant_notes (owner_id, scope);

create index if not exists growing_assistant_notes_student_idx
  on growing_assistant_notes (owner_id, student_id);;
