-- Compatibility hardening for the canonical message log table created by
-- 20260531120000_message_logs.sql.
--
-- This migration intentionally does not create a second legacy-shaped table.
-- It only removes the old broad authenticated-user policy and reasserts
-- owner-scoped policies. Keep this idempotent because the linked production
-- migration history predates the local history and must be reconciled before
-- any future `supabase db push`.

do $$
begin
  if to_regclass('public.growing_message_logs') is null then
    raise exception 'growing_message_logs must be created by 20260531120000_message_logs.sql first';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'growing_message_logs'
      and column_name = 'owner_id'
  ) then
    raise exception 'growing_message_logs.owner_id is required for tenant isolation';
  end if;
end
$$;

alter table public.growing_message_logs enable row level security;

-- Remove the unsafe legacy policy if it exists. PostgreSQL combines permissive
-- policies with OR, so leaving it in place would bypass owner-scoped policies.
drop policy if exists select_own_logs on public.growing_message_logs;

drop policy if exists owner_select on public.growing_message_logs;
create policy owner_select on public.growing_message_logs
  for select using (auth.uid() = owner_id);

drop policy if exists owner_insert on public.growing_message_logs;
create policy owner_insert on public.growing_message_logs
  for insert with check (auth.uid() = owner_id);

drop policy if exists owner_update on public.growing_message_logs;
create policy owner_update on public.growing_message_logs
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists idx_growing_message_logs_owner_created
  on public.growing_message_logs (owner_id, created_at desc);

create index if not exists idx_growing_message_logs_owner_status
  on public.growing_message_logs (owner_id, status, created_at desc);
