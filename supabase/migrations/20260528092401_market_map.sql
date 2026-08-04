-- Market buildings table
create table if not exists public.rn_market_buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.rn_market_buildings enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_buildings' and policyname='rn_market_buildings_read') then
    execute 'create policy rn_market_buildings_read on public.rn_market_buildings for select using (auth.role() = ''authenticated'')';
  end if;
end $$;

create table if not exists public.rn_market_stalls (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.rn_market_buildings(id) on delete cascade,
  row_idx int not null,
  col_idx int not null,
  stall_number text,
  vendor_name text,
  section_name text,
  company_name text,
  cell_type text not null default 'stall',
  notes text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, row_idx, col_idx)
);

create index if not exists rn_market_stalls_building_idx
  on public.rn_market_stalls (building_id, row_idx, col_idx);

alter table public.rn_market_stalls enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_stalls' and policyname='rn_market_stalls_read') then
    execute 'create policy rn_market_stalls_read on public.rn_market_stalls for select using (auth.role() = ''authenticated'')';
  end if;
end $$;

do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_stalls' and policyname='rn_market_stalls_write') then
    execute 'create policy rn_market_stalls_write on public.rn_market_stalls for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
end $$;

create table if not exists public.rn_market_stall_history (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.rn_market_stalls(id) on delete cascade,
  changed_by uuid not null references public.rn_profiles(id) on delete cascade,
  change_type text not null default 'update',
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists rn_market_stall_history_stall_idx
  on public.rn_market_stall_history (stall_id, changed_at desc);

alter table public.rn_market_stall_history enable row level security;

do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_stall_history' and policyname='rn_market_stall_history_read') then
    execute 'create policy rn_market_stall_history_read on public.rn_market_stall_history for select using (auth.role() = ''authenticated'')';
  end if;
end $$;

do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_stall_history' and policyname='rn_market_stall_history_insert') then
    execute 'create policy rn_market_stall_history_insert on public.rn_market_stall_history for insert with check (auth.uid() = changed_by)';
  end if;
end $$;

insert into public.rn_market_buildings (id, name, code, sort_order) values
  ('11111111-0001-0001-0001-000000000001', '청과물동', 'cheonggwamul', 1),
  ('11111111-0002-0002-0002-000000000002', '무배추동', 'mubaechu', 2),
  ('11111111-0003-0003-0003-000000000003', '양념동', 'yangnyeom', 3),
  ('11111111-0004-0004-0004-000000000004', '화훼단지', 'hwahwe', 4)
on conflict (code) do nothing;;
