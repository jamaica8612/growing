create table if not exists growing_kakao_parent_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references growing_students(id) on delete cascade,
  kakao_user_key text not null,
  plusfriend_user_key text not null default '',
  parent_phone text not null,
  verified_at timestamptz not null default now(),
  consent_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, kakao_user_key, student_id)
);

alter table growing_kakao_parent_links enable row level security;

drop policy if exists "owner_select" on growing_kakao_parent_links;
create policy "owner_select" on growing_kakao_parent_links
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_kakao_parent_links;
create policy "owner_insert" on growing_kakao_parent_links
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_update" on growing_kakao_parent_links;
create policy "owner_update" on growing_kakao_parent_links
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists idx_growing_kakao_parent_links_owner_student
  on growing_kakao_parent_links (owner_id, student_id);

create index if not exists idx_growing_kakao_parent_links_user
  on growing_kakao_parent_links (kakao_user_key);

create table if not exists growing_parent_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references growing_students(id) on delete set null,
  kakao_user_key text not null,
  request_type text not null check (request_type in ('attendance', 'homework', 'counsel', 'connect')),
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'drafted', 'resolved', 'dismissed')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table growing_parent_requests enable row level security;

drop policy if exists "owner_select" on growing_parent_requests;
create policy "owner_select" on growing_parent_requests
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_parent_requests;
create policy "owner_insert" on growing_parent_requests
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_update" on growing_parent_requests;
create policy "owner_update" on growing_parent_requests
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists idx_growing_parent_requests_owner_status
  on growing_parent_requests (owner_id, status, created_at desc);

create index if not exists idx_growing_parent_requests_student
  on growing_parent_requests (student_id, created_at desc);

create table if not exists growing_kakao_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  kakao_user_key text not null default '',
  plusfriend_user_key text,
  event_type text not null,
  intent text,
  status text not null default 'received',
  dedupe_key text,
  raw_payload jsonb,
  response_body jsonb,
  created_at timestamptz not null default now(),
  unique (dedupe_key)
);

alter table growing_kakao_events enable row level security;

drop policy if exists "owner_select" on growing_kakao_events;
create policy "owner_select" on growing_kakao_events
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_kakao_events;
create policy "owner_insert" on growing_kakao_events
  for insert with check (auth.uid() = owner_id);

create index if not exists idx_growing_kakao_events_owner_created
  on growing_kakao_events (owner_id, created_at desc);

create index if not exists idx_growing_kakao_events_user
  on growing_kakao_events (kakao_user_key, created_at desc);
