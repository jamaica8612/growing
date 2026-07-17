-- Two-step parent linking without persisting the parent phone number.
-- This migration is intentionally additive so it can follow the launch
-- hardening migration without changing its recorded checksum.

alter table public.growing_kakao_conversation_states
  add column if not exists state_nonce text;

alter table public.growing_kakao_parent_links
  add column if not exists connect_claim_nonce text;

-- Pending states created by the superseded three-argument RPC cannot be
-- safely bound to a confirmation button, so discard only those legacy rows.
delete from public.growing_kakao_conversation_states
where state = 'connect_pending'
  and state_nonce is null;

alter table public.growing_kakao_conversation_states
  drop constraint if exists growing_kakao_conversation_states_state_check;

alter table public.growing_kakao_conversation_states
  add constraint growing_kakao_conversation_states_state_check
  check (
    (state = 'counsel_prompt' and state_nonce is null)
    or (
      state = 'connect_pending'
      and state_nonce ~ '^[0-9a-f]{32,64}$'
    )
  );

alter table public.growing_kakao_parent_links
  drop constraint if exists growing_kakao_parent_links_connect_claim_nonce_check;

alter table public.growing_kakao_parent_links
  add constraint growing_kakao_parent_links_connect_claim_nonce_check
  check (
    connect_claim_nonce is null
    or connect_claim_nonce ~ '^[0-9a-f]{32,64}$'
  );

create unique index if not exists uq_growing_kakao_parent_links_connect_claim_nonce
  on public.growing_kakao_parent_links (
    owner_id,
    kakao_user_key,
    connect_claim_nonce
  )
  where connect_claim_nonce is not null;

drop function if exists public.growing_set_kakao_connect_pending(
  uuid,
  text,
  uuid
);

create or replace function public.growing_set_kakao_connect_pending(
  p_owner_id uuid,
  p_kakao_user_key text,
  p_student_id uuid,
  p_state_nonce text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_owner_id is null
    or p_student_id is null
    or p_kakao_user_key is null
    or char_length(p_kakao_user_key) = 0
    or char_length(p_kakao_user_key) > 128
    or btrim(p_kakao_user_key) <> p_kakao_user_key
    or p_state_nonce is null
    or p_state_nonce !~ '^[0-9a-f]{32,64}$' then
    raise exception 'Invalid Kakao connect-pending request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_kakao_user_key, 0)
  );

  if not exists (
    select 1
    from public.growing_students as student
    where student.id = p_student_id
      and student.owner_id = p_owner_id
      and student.status = 'active'
  ) then
    raise exception 'Kakao connect-pending student is unavailable'
      using errcode = '23503';
  end if;

  insert into public.growing_kakao_conversation_states (
    owner_id,
    kakao_user_key,
    state,
    student_id,
    state_nonce,
    privacy_consent_at,
    privacy_consent_version,
    privacy_consent_text_hash,
    expires_at,
    updated_at
  )
  values (
    p_owner_id,
    p_kakao_user_key,
    'connect_pending',
    p_student_id,
    p_state_nonce,
    null,
    null,
    null,
    clock_timestamp() + interval '10 minutes',
    clock_timestamp()
  )
  on conflict (owner_id, kakao_user_key) do update
  set
    state = excluded.state,
    student_id = excluded.student_id,
    state_nonce = excluded.state_nonce,
    privacy_consent_at = null,
    privacy_consent_version = null,
    privacy_consent_text_hash = null,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.growing_set_kakao_connect_pending(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.growing_set_kakao_connect_pending(uuid, text, uuid, text)
  to service_role;

drop function if exists public.growing_claim_kakao_pending_link(
  uuid,
  text,
  text,
  text,
  text
);

create or replace function public.growing_claim_kakao_pending_link(
  p_owner_id uuid,
  p_kakao_user_key text,
  p_plusfriend_user_key text,
  p_app_user_id text,
  p_consent_text_hash text,
  p_consent_version text,
  p_state_nonce text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_student_id uuid;
  v_student_name text;
  v_expires_at timestamptz;
  v_now timestamptz;
begin
  if p_owner_id is null
    or p_kakao_user_key is null
    or char_length(p_kakao_user_key) = 0
    or char_length(p_kakao_user_key) > 128
    or btrim(p_kakao_user_key) <> p_kakao_user_key
    or char_length(coalesce(p_plusfriend_user_key, '')) > 128
    or char_length(coalesce(p_app_user_id, '')) > 128
    or p_consent_text_hash is null
    or p_consent_text_hash !~ '^[0-9a-f]{64}$'
    or p_consent_version is distinct from '2026-07-17-v1'
    or p_state_nonce is null
    or p_state_nonce !~ '^[0-9a-f]{32,64}$' then
    raise exception 'Invalid Kakao pending-link claim'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_kakao_user_key, 0)
  );

  -- If the first response was lost after commit, recover the same successful
  -- claim without reopening a revoked or channel-blocked link.
  select link.student_id, student.name
    into v_student_id, v_student_name
  from public.growing_kakao_parent_links as link
  join public.growing_students as student
    on student.id = link.student_id
    and student.owner_id = link.owner_id
  where link.owner_id = p_owner_id
    and link.kakao_user_key = p_kakao_user_key
    and link.connect_claim_nonce = p_state_nonce
    and link.consent_version = p_consent_version
    and link.consent_text_hash = p_consent_text_hash
    and link.revoked_at is null
    and link.channel_blocked_at is null
    and link.blocked_at is null
    and student.status = 'active';

  if found then
    return jsonb_build_object(
      'matched', true,
      'replayed', true,
      'student_id', v_student_id,
      'student_name', v_student_name
    );
  end if;

  select state.student_id, state.expires_at
    into v_student_id, v_expires_at
  from public.growing_kakao_conversation_states as state
  where state.owner_id = p_owner_id
    and state.kakao_user_key = p_kakao_user_key
    and state.state = 'connect_pending'
    and state.state_nonce = p_state_nonce
  for update;

  if not found then
    return jsonb_build_object('matched', false);
  end if;

  v_now := clock_timestamp();

  if v_student_id is null or v_expires_at <= v_now then
    delete from public.growing_kakao_conversation_states
    where owner_id = p_owner_id
      and kakao_user_key = p_kakao_user_key
      and state = 'connect_pending'
      and state_nonce = p_state_nonce;
    return jsonb_build_object('matched', false);
  end if;

  select student.name
    into v_student_name
  from public.growing_students as student
  where student.id = v_student_id
    and student.owner_id = p_owner_id
    and student.status = 'active'
  for share;

  if not found then
    delete from public.growing_kakao_conversation_states
    where owner_id = p_owner_id
      and kakao_user_key = p_kakao_user_key
      and state = 'connect_pending'
      and state_nonce = p_state_nonce;
    return jsonb_build_object('matched', false);
  end if;

  insert into public.growing_kakao_parent_links (
    owner_id,
    student_id,
    kakao_user_key,
    plusfriend_user_key,
    parent_phone,
    verified_at,
    consent_at,
    consent_version,
    consent_text_hash,
    blocked_at,
    revoked_at,
    channel_blocked_at,
    app_user_id,
    connect_claim_nonce
  )
  values (
    p_owner_id,
    v_student_id,
    p_kakao_user_key,
    coalesce(p_plusfriend_user_key, ''),
    '',
    v_now,
    v_now,
    p_consent_version,
    p_consent_text_hash,
    null,
    null,
    null,
    nullif(p_app_user_id, ''),
    p_state_nonce
  )
  on conflict (owner_id, kakao_user_key, student_id) do update
  set
    plusfriend_user_key = case
      when excluded.plusfriend_user_key = ''
        then growing_kakao_parent_links.plusfriend_user_key
      else excluded.plusfriend_user_key
    end,
    parent_phone = '',
    verified_at = excluded.verified_at,
    consent_at = excluded.consent_at,
    consent_version = excluded.consent_version,
    consent_text_hash = excluded.consent_text_hash,
    connect_claim_nonce = excluded.connect_claim_nonce,
    revoked_at = null,
    blocked_at = case
      when growing_kakao_parent_links.channel_blocked_at is null then null
      else growing_kakao_parent_links.blocked_at
    end,
    app_user_id = coalesce(
      excluded.app_user_id,
      growing_kakao_parent_links.app_user_id
    );

  delete from public.growing_kakao_conversation_states
  where owner_id = p_owner_id
    and kakao_user_key = p_kakao_user_key
    and state = 'connect_pending'
    and state_nonce = p_state_nonce;

  return jsonb_build_object(
    'matched', true,
    'replayed', false,
    'student_id', v_student_id,
    'student_name', v_student_name
  );
end;
$$;

revoke all on function public.growing_claim_kakao_pending_link(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.growing_claim_kakao_pending_link(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;
