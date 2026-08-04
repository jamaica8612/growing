create table public.automation_codex_scheduled_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  run_key text not null,
  status text not null,
  summary text not null,
  counts jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint automation_codex_scheduled_runs_scope_key
    unique (tenant_key, owner_user_id, run_key),
  constraint automation_codex_scheduled_runs_tenant_check
    check (tenant_key ~ '^[A-Za-z0-9._:-]{1,96}$'),
  constraint automation_codex_scheduled_runs_run_key_check
    check (run_key ~ '^[A-Za-z0-9._:-]{8,160}$'),
  constraint automation_codex_scheduled_runs_status_check
    check (status in ('ok', 'actionable', 'failed')),
  constraint automation_codex_scheduled_runs_summary_check
    check (
      char_length(btrim(summary)) between 1 and 1000
      and summary !~ '[[:cntrl:]]'
    ),
  constraint automation_codex_scheduled_runs_counts_check
    check (
      jsonb_typeof(counts) = 'object'
      and octet_length(counts::text) <= 4096
    ),
  constraint automation_codex_scheduled_runs_details_check
    check (
      jsonb_typeof(details) = 'object'
      and octet_length(details::text) <= 16384
    ),
  constraint automation_codex_scheduled_runs_time_order_check
    check (
      completed_at >= started_at
      and completed_at - started_at <= interval '24 hours'
    )
);

create index automation_codex_scheduled_runs_recent_idx
  on public.automation_codex_scheduled_runs (
    tenant_key,
    owner_user_id,
    completed_at desc,
    created_at desc
  );

alter table public.automation_codex_scheduled_runs enable row level security;
alter table public.automation_codex_scheduled_runs force row level security;

revoke all on table public.automation_codex_scheduled_runs
  from public, anon, authenticated;
grant select, insert on table public.automation_codex_scheduled_runs
  to service_role;

create or replace function public.automation_record_codex_scheduled_run(
  p_tenant_key text,
  p_owner_user_id uuid,
  p_run_key text,
  p_status text,
  p_summary text,
  p_counts jsonb,
  p_details jsonb,
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns setof public.automation_codex_scheduled_runs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.automation_codex_scheduled_runs%rowtype;
begin
  insert into public.automation_codex_scheduled_runs (
    tenant_key,
    owner_user_id,
    run_key,
    status,
    summary,
    counts,
    details,
    started_at,
    completed_at
  )
  values (
    p_tenant_key,
    p_owner_user_id,
    p_run_key,
    p_status,
    p_summary,
    coalesce(p_counts, '{}'::jsonb),
    coalesce(p_details, '{}'::jsonb),
    p_started_at,
    p_completed_at
  )
  on conflict (tenant_key, owner_user_id, run_key) do nothing;

  select run.*
    into v_row
  from public.automation_codex_scheduled_runs as run
  where run.tenant_key = p_tenant_key
    and run.owner_user_id = p_owner_user_id
    and run.run_key = p_run_key;

  if v_row.id is null then
    raise exception 'codex_scheduled_run_save_conflict';
  end if;

  if v_row.status is distinct from p_status
    or v_row.summary is distinct from p_summary
    or v_row.counts is distinct from coalesce(p_counts, '{}'::jsonb)
    or v_row.details is distinct from coalesce(p_details, '{}'::jsonb)
    or v_row.started_at is distinct from p_started_at
    or v_row.completed_at is distinct from p_completed_at
  then
    raise exception 'codex_scheduled_run_idempotency_conflict';
  end if;

  return next v_row;
end;
$$;

revoke all on function public.automation_record_codex_scheduled_run(
  text,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.automation_record_codex_scheduled_run(
  text,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;;
