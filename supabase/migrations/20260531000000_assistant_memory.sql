-- 아이비 기억 설정: 원장님이 저장한 말투/운영 기준을 보관한다.
-- owner_id(=auth.uid())를 PK로 삼아 학원당 1행만 존재하도록 한다.
create table if not exists growing_assistant_memory (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  memory_text text not null default '',
  updated_at  timestamptz not null default now()
);

alter table growing_assistant_memory enable row level security;

-- 본인 행만 조회·수정할 수 있다.
create policy "owner_select" on growing_assistant_memory
  for select using (auth.uid() = owner_id);

create policy "owner_insert" on growing_assistant_memory
  for insert with check (auth.uid() = owner_id);

create policy "owner_update" on growing_assistant_memory
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
