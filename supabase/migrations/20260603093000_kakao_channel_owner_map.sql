create table if not exists growing_kakao_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_name text not null default '',
  skill_secret text not null unique,
  event_secret text unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table growing_kakao_channels enable row level security;

drop policy if exists "owner_select" on growing_kakao_channels;
create policy "owner_select" on growing_kakao_channels
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_kakao_channels;
create policy "owner_insert" on growing_kakao_channels
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_update" on growing_kakao_channels;
create policy "owner_update" on growing_kakao_channels
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists idx_growing_kakao_channels_owner
  on growing_kakao_channels (owner_id);
