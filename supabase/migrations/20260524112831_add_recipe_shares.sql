create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_local_id text,
  recipe_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipe_shares_owner_id_idx on public.recipe_shares (owner_id);
create unique index if not exists recipe_shares_owner_source_local_id_idx
  on public.recipe_shares (owner_id, source_local_id)
  where source_local_id is not null;

alter table public.recipe_shares enable row level security;

drop policy if exists "recipe shares owner read" on public.recipe_shares;
create policy "recipe shares owner read" on public.recipe_shares
  for select using (auth.uid() = owner_id);

drop policy if exists "recipe shares owner delete" on public.recipe_shares;
create policy "recipe shares owner delete" on public.recipe_shares
  for delete using (auth.uid() = owner_id);;
