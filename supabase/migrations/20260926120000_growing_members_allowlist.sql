-- Growing shares its Supabase project with unrelated apps, so every account in
-- auth.users could otherwise sign in and call the paid AI functions. Only
-- accounts listed here may use the Growing app and its AI Edge Functions.
create table if not exists public.growing_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.growing_members enable row level security;

revoke all on public.growing_members from anon;
revoke insert, update, delete on public.growing_members from authenticated;
grant select on public.growing_members to authenticated;

drop policy if exists growing_members_select_own on public.growing_members;
create policy growing_members_select_own on public.growing_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Existing academy owners keep access: anyone who already owns Growing data.
insert into public.growing_members (user_id, note)
select distinct s.owner_id, 'existing owner'
from public.growing_students s
join auth.users u on u.id = s.owner_id
on conflict (user_id) do nothing;
