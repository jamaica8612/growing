-- 해석/영작 첨삭 과제.
-- 선생님이 지문을 문장 단위로 저장하면, 학생은 로그인 없이 응시코드로 들어와
-- 문장마다 해석(또는 영작)을 적고 이름만 적어 제출한다. AI 첨삭 초안은
-- correction-public 엣지 함수(서비스롤)가 저장하고, 선생님이 검토·수정한 뒤 공개한다.

create table if not exists growing_correction_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode text not null check (mode in ('translate', 'compose')),
  title text not null,
  sentences jsonb not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array'),
  status text not null default 'open' check (status in ('open', 'closed')),
  short_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growing_correction_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null references growing_correction_sets(id) on delete cascade,
  student_name text not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  completeness int not null default 0 check (completeness between 0 and 100),
  accuracy int not null default 0 check (accuracy between 0 and 100),
  grading_status text not null default 'graded' check (grading_status in ('graded', 'failed')),
  published boolean not null default false,
  result_token text not null unique,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table growing_correction_sets enable row level security;
alter table growing_correction_submissions enable row level security;

drop policy if exists "owner_select" on growing_correction_sets;
create policy "owner_select" on growing_correction_sets for select using (auth.uid() = owner_id);
drop policy if exists "owner_insert" on growing_correction_sets;
create policy "owner_insert" on growing_correction_sets for insert with check (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_correction_sets;
create policy "owner_update" on growing_correction_sets for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete" on growing_correction_sets;
create policy "owner_delete" on growing_correction_sets for delete using (auth.uid() = owner_id);

-- 제출 insert는 엣지 함수(서비스롤)만 한다. 선생님은 조회·수정·삭제만 한다.
drop policy if exists "owner_select" on growing_correction_submissions;
create policy "owner_select" on growing_correction_submissions for select using (auth.uid() = owner_id);
drop policy if exists "owner_update" on growing_correction_submissions;
create policy "owner_update" on growing_correction_submissions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete" on growing_correction_submissions;
create policy "owner_delete" on growing_correction_submissions for delete using (auth.uid() = owner_id);

create index if not exists idx_growing_correction_sets_owner_created on growing_correction_sets (owner_id, created_at desc);
create index if not exists idx_growing_correction_submissions_set on growing_correction_submissions (set_id, submitted_at desc);
