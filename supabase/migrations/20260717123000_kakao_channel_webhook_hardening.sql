create extension if not exists pgcrypto with schema extensions;

alter table public.growing_kakao_channels
  add column if not exists event_admin_key_hash text,
  add column if not exists skill_secret_hash text,
  add column if not exists auto_reply boolean not null default true;

alter table public.growing_kakao_channels
  add column if not exists skill_secret_configured boolean
    generated always as (skill_secret_hash is not null) stored,
  add column if not exists event_admin_key_configured boolean
    generated always as (event_admin_key_hash is not null) stored;

alter table public.growing_kakao_channels
  drop constraint if exists growing_kakao_channels_skill_secret_key;

alter table public.growing_kakao_channels
  alter column skill_secret drop not null;

update public.growing_kakao_channels
set
  skill_secret_hash = encode(
    extensions.digest(convert_to(btrim(skill_secret), 'UTF8'), 'sha256'),
    'hex'
  ),
  skill_secret = null
where skill_secret is not null
  and btrim(skill_secret) <> ''
  and skill_secret_hash is null;

create unique index if not exists idx_growing_kakao_channels_skill_secret_hash
  on public.growing_kakao_channels (skill_secret_hash)
  where skill_secret_hash is not null;

create or replace function public.growing_hash_kakao_skill_secret()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_secret text := nullif(btrim(new.skill_secret), '');
begin
  if v_secret is not null then
    if char_length(v_secret) < 32 or char_length(v_secret) > 128 then
      raise exception 'Kakao Skill secret must be between 32 and 128 characters'
        using errcode = '22023';
    end if;
    new.skill_secret_hash := encode(
      extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'),
      'hex'
    );
  elsif tg_op = 'UPDATE' then
    new.skill_secret_hash := old.skill_secret_hash;
  else
    raise exception 'Kakao Skill secret is required'
      using errcode = '23502';
  end if;

  if new.skill_secret_hash is null then
    raise exception 'Kakao Skill secret is required'
      using errcode = '23502';
  end if;
  new.skill_secret := null;
  return new;
end;
$$;

revoke all on function public.growing_hash_kakao_skill_secret() from public;

drop trigger if exists trg_growing_hash_kakao_skill_secret
  on public.growing_kakao_channels;

create trigger trg_growing_hash_kakao_skill_secret
before insert or update of skill_secret, skill_secret_hash
on public.growing_kakao_channels
for each row
execute function public.growing_hash_kakao_skill_secret();

drop index if exists public.idx_growing_kakao_channels_event_admin_key_hash;

-- Legacy event_secret values were app-generated webhook secrets, not Kakao
-- Admin keys. Discard them instead of treating an unrelated credential as a
-- valid KakaoAK verifier. The owner must enter the real Admin key once after
-- this migration.
update public.growing_kakao_channels
set
  event_admin_key_hash = null,
  event_secret = null
where event_secret is not null
  and event_admin_key_hash is null;

create or replace function public.growing_hash_kakao_channel_admin_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin_key text;
begin
  v_admin_key := nullif(btrim(new.event_secret), '');

  if v_admin_key is not null then
    if char_length(v_admin_key) < 16 or char_length(v_admin_key) > 128 then
      raise exception 'Kakao Admin key must be between 16 and 128 characters'
        using errcode = '22023';
    end if;

    new.event_admin_key_hash := encode(
      extensions.digest(convert_to(v_admin_key, 'UTF8'), 'sha256'),
      'hex'
    );
  elsif tg_op = 'UPDATE' then
    new.event_admin_key_hash := old.event_admin_key_hash;
  end if;

  new.event_secret := null;
  return new;
end;
$$;

revoke all on function public.growing_hash_kakao_channel_admin_key() from public;

drop trigger if exists trg_growing_hash_kakao_channel_admin_key
  on public.growing_kakao_channels;

create trigger trg_growing_hash_kakao_channel_admin_key
before insert or update of event_secret, event_admin_key_hash
on public.growing_kakao_channels
for each row
execute function public.growing_hash_kakao_channel_admin_key();

alter table public.growing_kakao_parent_links
  add column if not exists app_user_id text,
  add column if not exists channel_open_id text,
  add column if not exists channel_relationship_updated_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consent_text_hash text,
  add column if not exists revoked_at timestamptz,
  add column if not exists channel_blocked_at timestamptz;

-- Links created with the former name/phone knowledge check must be verified
-- again with a single-use academy code before private student data is exposed.
update public.growing_kakao_parent_links
set
  blocked_at = coalesce(blocked_at, clock_timestamp()),
  revoked_at = coalesce(revoked_at, blocked_at, clock_timestamp()),
  parent_phone = ''
where consent_version is distinct from '2026-07-17-v1';

update public.growing_kakao_parent_links
set parent_phone = ''
where parent_phone <> '';

alter table public.growing_kakao_channels
  add column if not exists kakao_channel_public_id text,
  add column if not exists kakao_channel_uuid text;

alter table public.growing_kakao_channels
  drop constraint if exists growing_kakao_channels_identifier_pair;

alter table public.growing_kakao_channels
  add constraint growing_kakao_channels_identifier_pair
  check (
    (kakao_channel_public_id is null and kakao_channel_uuid is null)
    or
    (kakao_channel_public_id is not null and kakao_channel_uuid is not null)
  );

create unique index if not exists idx_growing_kakao_channels_event_binding
  on public.growing_kakao_channels (
    event_admin_key_hash,
    kakao_channel_public_id,
    kakao_channel_uuid
  )
  where event_admin_key_hash is not null
    and kakao_channel_public_id is not null
    and kakao_channel_uuid is not null;

revoke select on table public.growing_kakao_channels from anon, authenticated;
grant select (
  id,
  owner_id,
  channel_name,
  kakao_channel_public_id,
  kakao_channel_uuid,
  skill_secret_configured,
  event_admin_key_configured,
  enabled,
  auto_reply,
  created_at,
  updated_at
) on table public.growing_kakao_channels to authenticated;

alter table public.growing_parent_requests
  add column if not exists dedupe_key text,
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists privacy_consent_version text,
  add column if not exists privacy_consent_text_hash text;

create unique index if not exists idx_growing_parent_requests_dedupe_key
  on public.growing_parent_requests (dedupe_key);

create index if not exists idx_growing_kakao_parent_links_owner_app_user
  on public.growing_kakao_parent_links (owner_id, app_user_id)
  where app_user_id is not null;

create index if not exists idx_growing_kakao_parent_links_owner_channel_open
  on public.growing_kakao_parent_links (owner_id, channel_open_id)
  where channel_open_id is not null;

create table if not exists public.growing_kakao_rate_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('connect', 'parent_request')),
  subject_hash text not null,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, scope, subject_hash)
);

alter table public.growing_kakao_rate_limits enable row level security;
revoke all on table public.growing_kakao_rate_limits from public, anon, authenticated;

create table if not exists public.growing_kakao_conversation_states (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kakao_user_key text not null,
  state text not null check (state = 'counsel_prompt'),
  student_id uuid references public.growing_students(id) on delete set null,
  privacy_consent_at timestamptz,
  privacy_consent_version text,
  privacy_consent_text_hash text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kakao_user_key)
);

alter table public.growing_kakao_conversation_states
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists privacy_consent_version text,
  add column if not exists privacy_consent_text_hash text;

alter table public.growing_kakao_conversation_states enable row level security;
revoke all on table public.growing_kakao_conversation_states from public, anon, authenticated;

drop function if exists public.growing_set_kakao_counsel_prompt(uuid, text, uuid);

create or replace function public.growing_set_kakao_counsel_prompt(
  p_owner_id uuid,
  p_kakao_user_key text,
  p_student_id uuid,
  p_privacy_consent_version text,
  p_privacy_consent_text_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_kakao_user_key is null
    or char_length(p_kakao_user_key) = 0
    or char_length(p_kakao_user_key) > 128 then
    raise exception 'Invalid Kakao conversation state' using errcode = '22023';
  end if;

  if p_student_id is not null and not exists (
    select 1
    from public.growing_kakao_parent_links as link
    where link.owner_id = p_owner_id
      and link.kakao_user_key = p_kakao_user_key
      and link.student_id = p_student_id
      and link.consent_version = '2026-07-17-v1'
      and link.revoked_at is null
      and link.channel_blocked_at is null
      and link.blocked_at is null
  ) then
    raise exception 'Student is not linked to Kakao user' using errcode = '23503';
  end if;

  if p_student_id is null and (
    p_privacy_consent_version is null
    or p_privacy_consent_version <> '2026-07-17-counsel-v1'
    or p_privacy_consent_text_hash is null
    or p_privacy_consent_text_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'Unlinked counsel privacy consent is required' using errcode = '22023';
  end if;

  insert into public.growing_kakao_conversation_states (
    owner_id,
    kakao_user_key,
    state,
    student_id,
    privacy_consent_at,
    privacy_consent_version,
    privacy_consent_text_hash,
    expires_at,
    updated_at
  )
  values (
    p_owner_id,
    p_kakao_user_key,
    'counsel_prompt',
    p_student_id,
    case when p_student_id is null then clock_timestamp() else null end,
    case when p_student_id is null then p_privacy_consent_version else null end,
    case when p_student_id is null then p_privacy_consent_text_hash else null end,
    clock_timestamp() + interval '10 minutes',
    clock_timestamp()
  )
  on conflict (owner_id, kakao_user_key) do update
  set
    state = excluded.state,
    student_id = excluded.student_id,
    privacy_consent_at = excluded.privacy_consent_at,
    privacy_consent_version = excluded.privacy_consent_version,
    privacy_consent_text_hash = excluded.privacy_consent_text_hash,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.growing_get_kakao_counsel_prompt(
  p_owner_id uuid,
  p_kakao_user_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_student_id uuid;
  v_privacy_consent_at timestamptz;
  v_privacy_consent_version text;
  v_privacy_consent_text_hash text;
begin
  delete from public.growing_kakao_conversation_states
  where owner_id = p_owner_id
    and kakao_user_key = p_kakao_user_key
    and expires_at <= clock_timestamp();

  select
    state.student_id,
    state.privacy_consent_at,
    state.privacy_consent_version,
    state.privacy_consent_text_hash
  into
    v_student_id,
    v_privacy_consent_at,
    v_privacy_consent_version,
    v_privacy_consent_text_hash
  from public.growing_kakao_conversation_states as state
  where state.owner_id = p_owner_id
    and state.kakao_user_key = p_kakao_user_key
    and state.state = 'counsel_prompt'
    and state.expires_at > clock_timestamp();

  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true,
    'student_id', v_student_id,
    'privacy_consent_at', v_privacy_consent_at,
    'privacy_consent_version', v_privacy_consent_version,
    'privacy_consent_text_hash', v_privacy_consent_text_hash
  );
end;
$$;

create or replace function public.growing_clear_kakao_counsel_prompt(
  p_owner_id uuid,
  p_kakao_user_key text
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.growing_kakao_conversation_states
  where owner_id = p_owner_id and kakao_user_key = p_kakao_user_key;
$$;

revoke all on function public.growing_set_kakao_counsel_prompt(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.growing_get_kakao_counsel_prompt(uuid, text)
  from public, anon, authenticated;
revoke all on function public.growing_clear_kakao_counsel_prompt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.growing_set_kakao_counsel_prompt(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.growing_get_kakao_counsel_prompt(uuid, text)
  to service_role;
grant execute on function public.growing_clear_kakao_counsel_prompt(uuid, text)
  to service_role;

create or replace function public.growing_consume_kakao_rate_limit(
  p_owner_id uuid,
  p_scope text,
  p_subject text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_hash text;
  v_attempts integer;
begin
  if p_scope not in ('connect', 'parent_request')
    or p_subject is null
    or char_length(p_subject) = 0
    or char_length(p_subject) > 128
    or p_max_attempts < 1
    or p_max_attempts > 100
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'Invalid Kakao rate-limit input'
      using errcode = '22023';
  end if;

  v_subject_hash := encode(
    extensions.digest(convert_to(p_subject, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.growing_kakao_rate_limits (
    owner_id,
    scope,
    subject_hash,
    window_started_at,
    attempts,
    updated_at
  )
  values (p_owner_id, p_scope, v_subject_hash, v_now, 1, v_now)
  on conflict (owner_id, scope, subject_hash) do update
  set
    attempts = case
      when growing_kakao_rate_limits.window_started_at <=
        v_now - make_interval(secs => p_window_seconds) then 1
      else growing_kakao_rate_limits.attempts + 1
    end,
    window_started_at = case
      when growing_kakao_rate_limits.window_started_at <=
        v_now - make_interval(secs => p_window_seconds) then v_now
      else growing_kakao_rate_limits.window_started_at
    end,
    updated_at = v_now
  returning attempts into v_attempts;

  return v_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.growing_consume_kakao_rate_limit(
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.growing_consume_kakao_rate_limit(
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;

drop function if exists public.growing_create_kakao_parent_request(
  uuid,
  uuid,
  text,
  text,
  text,
  text
);

create or replace function public.growing_create_kakao_parent_request(
  p_owner_id uuid,
  p_student_id uuid,
  p_kakao_user_key text,
  p_request_type text,
  p_message text,
  p_request_id text,
  p_privacy_consent_at timestamptz,
  p_privacy_consent_version text,
  p_privacy_consent_text_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_bucket bigint := floor(extract(epoch from clock_timestamp()) / 30);
  v_dedupe_key text;
  v_inserted integer;
begin
  if p_owner_id is null
    or p_request_type not in ('attendance', 'homework', 'counsel', 'connect')
    or p_kakao_user_key is null
    or char_length(p_kakao_user_key) = 0
    or char_length(p_kakao_user_key) > 128
    or char_length(v_message) = 0
    or char_length(coalesce(p_request_id, '')) > 128 then
    raise exception 'Invalid Kakao parent request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_kakao_user_key, 0)
  );

  if p_student_id is not null and not exists (
    select 1
    from public.growing_kakao_parent_links as link
    join public.growing_students as student
      on student.id = link.student_id
      and student.owner_id = link.owner_id
    where link.owner_id = p_owner_id
      and link.student_id = p_student_id
      and link.kakao_user_key = p_kakao_user_key
      and link.consent_version = '2026-07-17-v1'
      and link.revoked_at is null
      and link.channel_blocked_at is null
      and link.blocked_at is null
      and student.status = 'active'
  ) then
    raise exception 'Student is not actively linked to Kakao user'
      using errcode = '23503';
  end if;

  if p_request_type = 'counsel' and p_student_id is null and (
    p_privacy_consent_at is null
    or p_privacy_consent_at < clock_timestamp() - interval '15 minutes'
    or p_privacy_consent_at > clock_timestamp() + interval '1 minute'
    or p_privacy_consent_version is null
    or p_privacy_consent_version <> '2026-07-17-counsel-v1'
    or p_privacy_consent_text_hash is null
    or p_privacy_consent_text_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'Unlinked counsel privacy consent is required'
      using errcode = '22023';
  end if;

  v_dedupe_key := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          ':',
          p_owner_id::text,
          coalesce(p_student_id::text, ''),
          p_kakao_user_key,
          p_request_type,
          v_message,
          coalesce(nullif(p_request_id, ''), v_bucket::text)
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.growing_parent_requests (
    owner_id,
    student_id,
    kakao_user_key,
    request_type,
    message,
    raw_payload,
    dedupe_key,
    privacy_consent_at,
    privacy_consent_version,
    privacy_consent_text_hash
  )
  values (
    p_owner_id,
    p_student_id,
    p_kakao_user_key,
    p_request_type,
    v_message,
    null,
    v_dedupe_key,
    case when p_request_type = 'counsel' and p_student_id is null
      then p_privacy_consent_at else null end,
    case when p_request_type = 'counsel' and p_student_id is null
      then p_privacy_consent_version else null end,
    case when p_request_type = 'counsel' and p_student_id is null
      then p_privacy_consent_text_hash else null end
  )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.growing_create_kakao_parent_request(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.growing_create_kakao_parent_request(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text
) to service_role;

create table if not exists public.growing_kakao_link_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.growing_students(id) on delete cascade,
  code_salt bytea not null,
  code_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  claim_request_id text,
  created_at timestamptz not null default now()
);

alter table public.growing_kakao_link_codes enable row level security;
revoke all on table public.growing_kakao_link_codes from public, anon, authenticated;

create index if not exists idx_growing_kakao_link_codes_active
  on public.growing_kakao_link_codes (owner_id, expires_at)
  where used_at is null;

create or replace function public.growing_create_kakao_link_code(
  p_student_id uuid,
  p_ttl_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_owner_id uuid := auth.uid();
  v_code text;
  v_salt bytea;
  v_expires_at timestamptz;
begin
  if v_owner_id is null
    or p_ttl_minutes < 5
    or p_ttl_minutes > 30
    or not exists (
      select 1
      from public.growing_students as student
      where student.id = p_student_id
        and student.owner_id = v_owner_id
        and student.status = 'active'
    ) then
    raise exception 'Invalid Kakao link-code request'
      using errcode = '22023';
  end if;

  -- Serialize issuance per owner/student so two concurrent admin requests
  -- cannot both leave an unused, valid code behind.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || p_student_id::text, 0)
  );

  update public.growing_kakao_link_codes
  set used_at = clock_timestamp()
  where owner_id = v_owner_id
    and student_id = p_student_id
    and used_at is null;

  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  v_salt := extensions.gen_random_bytes(16);
  v_expires_at := clock_timestamp() + make_interval(mins => p_ttl_minutes);

  insert into public.growing_kakao_link_codes (
    owner_id,
    student_id,
    code_salt,
    code_hash,
    expires_at
  )
  values (
    v_owner_id,
    p_student_id,
    v_salt,
    extensions.digest(v_salt || convert_to(v_code, 'UTF8'), 'sha256'),
    v_expires_at
  );

  return jsonb_build_object(
    'code', v_code,
    'student_id', p_student_id,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.growing_create_kakao_link_code(uuid, integer)
  from public, anon;
grant execute on function public.growing_create_kakao_link_code(uuid, integer)
  to authenticated;

create or replace function public.growing_claim_kakao_link_code(
  p_owner_id uuid,
  p_code text,
  p_kakao_user_key text,
  p_plusfriend_user_key text,
  p_app_user_id text,
  p_request_id text,
  p_consent_text_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_candidate record;
  v_student_name text;
begin
  if p_owner_id is null
    or v_code !~ '^[0-9A-F]{8}$'
    or p_kakao_user_key is null
    or char_length(p_kakao_user_key) = 0
    or char_length(p_kakao_user_key) > 128
    or char_length(coalesce(p_plusfriend_user_key, '')) > 128
    or char_length(coalesce(p_app_user_id, '')) > 128
    or char_length(coalesce(p_request_id, '')) > 128
    or p_consent_text_hash is null
    or p_consent_text_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Kakao link-code claim'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_kakao_user_key, 0)
  );

  for v_candidate in
    select
      code.id,
      code.student_id,
      code.code_salt,
      code.code_hash,
      code.used_at,
      code.claim_request_id
    from public.growing_kakao_link_codes as code
    where code.owner_id = p_owner_id
      and (
        (code.used_at is null and code.expires_at > clock_timestamp())
        or
        (nullif(p_request_id, '') is not null and code.claim_request_id = p_request_id)
      )
    order by code.created_at desc
    for update
  loop
    if extensions.digest(
      v_candidate.code_salt || convert_to(v_code, 'UTF8'),
      'sha256'
    ) = v_candidate.code_hash then
      select student.name
      into v_student_name
      from public.growing_students as student
      where student.id = v_candidate.student_id
        and student.owner_id = p_owner_id
        and student.status = 'active';

      if v_student_name is null then
        raise exception 'Kakao link-code student is unavailable'
          using errcode = '23503';
      end if;

      if v_candidate.used_at is not null and v_candidate.claim_request_id = p_request_id then
        if exists (
          select 1
          from public.growing_kakao_parent_links as link
          where link.owner_id = p_owner_id
            and link.student_id = v_candidate.student_id
            and link.kakao_user_key = p_kakao_user_key
            and link.consent_version = '2026-07-17-v1'
            and link.consent_text_hash = p_consent_text_hash
            and link.revoked_at is null
            and link.channel_blocked_at is null
            and link.blocked_at is null
        ) then
          return jsonb_build_object(
            'matched', true,
            'replayed', true,
            'student_id', v_candidate.student_id,
            'student_name', v_student_name
          );
        end if;

        return jsonb_build_object('matched', false);
      end if;

      update public.growing_kakao_link_codes
      set
        used_at = clock_timestamp(),
        claim_request_id = nullif(p_request_id, '')
      where id = v_candidate.id
        and used_at is null;

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
        app_user_id
      )
      values (
        p_owner_id,
        v_candidate.student_id,
        p_kakao_user_key,
        coalesce(p_plusfriend_user_key, ''),
        '',
        clock_timestamp(),
        clock_timestamp(),
        '2026-07-17-v1',
        p_consent_text_hash,
        null,
        null,
        null,
        nullif(p_app_user_id, '')
      )
      on conflict (owner_id, kakao_user_key, student_id) do update
      set
        plusfriend_user_key = excluded.plusfriend_user_key,
        verified_at = excluded.verified_at,
        consent_at = excluded.consent_at,
        consent_version = excluded.consent_version,
        consent_text_hash = excluded.consent_text_hash,
        revoked_at = null,
        blocked_at = case
          when growing_kakao_parent_links.channel_blocked_at is null then null
          else growing_kakao_parent_links.blocked_at
        end,
        app_user_id = coalesce(excluded.app_user_id, growing_kakao_parent_links.app_user_id);

      return jsonb_build_object(
        'matched', true,
        'student_id', v_candidate.student_id,
        'student_name', v_student_name
      );
    end if;
  end loop;

  return jsonb_build_object('matched', false);
end;
$$;

revoke all on function public.growing_claim_kakao_link_code(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.growing_claim_kakao_link_code(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

create or replace function public.growing_delete_kakao_parent_link(
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_kakao_user_key text;
  v_student_id uuid;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select link.kakao_user_key, link.student_id
  into v_kakao_user_key, v_student_id
  from public.growing_kakao_parent_links as link
  where link.id = p_link_id
    and link.owner_id = v_owner_id;

  if v_kakao_user_key is null then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || v_kakao_user_key, 0)
  );

  delete from public.growing_kakao_parent_links
  where id = p_link_id
    and owner_id = v_owner_id;

  delete from public.growing_parent_requests
  where owner_id = v_owner_id
    and kakao_user_key = v_kakao_user_key
    and student_id = v_student_id;

  if not exists (
    select 1
    from public.growing_kakao_parent_links
    where owner_id = v_owner_id
      and kakao_user_key = v_kakao_user_key
  ) then
    delete from public.growing_parent_requests
    where owner_id = v_owner_id
      and kakao_user_key = v_kakao_user_key;

    delete from public.growing_kakao_events
    where owner_id = v_owner_id
      and kakao_user_key = v_kakao_user_key;

    delete from public.growing_kakao_conversation_states
    where owner_id = v_owner_id
      and kakao_user_key = v_kakao_user_key;

    delete from public.growing_kakao_rate_limits
    where owner_id = v_owner_id
      and subject_hash = encode(
        extensions.digest(convert_to(v_kakao_user_key, 'UTF8'), 'sha256'),
        'hex'
      );
  end if;

  return true;
end;
$$;

revoke all on function public.growing_delete_kakao_parent_link(uuid)
  from public, anon;
grant execute on function public.growing_delete_kakao_parent_link(uuid)
  to authenticated;

create or replace function public.growing_delete_kakao_unlinked_identity(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_kakao_user_key text;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.kakao_user_key
  into v_kakao_user_key
  from public.growing_parent_requests as request
  where request.id = p_request_id
    and request.owner_id = v_owner_id
    and request.request_type = 'counsel';

  if v_kakao_user_key is null then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || v_kakao_user_key, 0)
  );

  if exists (
    select 1
    from public.growing_kakao_parent_links as link
    where link.owner_id = v_owner_id
      and link.kakao_user_key = v_kakao_user_key
  ) then
    return false;
  end if;

  delete from public.growing_parent_requests
  where owner_id = v_owner_id
    and kakao_user_key = v_kakao_user_key;

  delete from public.growing_kakao_events
  where owner_id = v_owner_id
    and kakao_user_key = v_kakao_user_key;

  delete from public.growing_kakao_conversation_states
  where owner_id = v_owner_id
    and kakao_user_key = v_kakao_user_key;

  delete from public.growing_kakao_rate_limits
  where owner_id = v_owner_id
    and subject_hash = encode(
      extensions.digest(convert_to(v_kakao_user_key, 'UTF8'), 'sha256'),
      'hex'
    );

  return true;
end;
$$;

revoke all on function public.growing_delete_kakao_unlinked_identity(uuid)
  from public, anon;
grant execute on function public.growing_delete_kakao_unlinked_identity(uuid)
  to authenticated;

create or replace function public.growing_process_kakao_channel_event(
  p_owner_id uuid,
  p_resource_id text,
  p_event text,
  p_subject_id text,
  p_id_type text,
  p_channel_public_id text,
  p_channel_uuid text,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
  v_kakao_user_key text := '';
  v_plusfriend_user_key text;
  v_known_links integer := 0;
  v_matched_links integer := 0;
begin
  if p_event not in ('added', 'blocked') then
    raise exception 'Unsupported Kakao channel event'
      using errcode = '22023';
  end if;

  if p_id_type not in ('app_user_id', 'open_id') then
    raise exception 'Unsupported Kakao channel user ID type'
      using errcode = '22023';
  end if;

  if p_resource_id is null or char_length(p_resource_id) = 0 or char_length(p_resource_id) > 200 then
    raise exception 'Invalid Kakao resource ID'
      using errcode = '22023';
  end if;

  if p_subject_id is null or char_length(p_subject_id) = 0 or char_length(p_subject_id) > 128 then
    raise exception 'Invalid Kakao subject ID'
      using errcode = '22023';
  end if;

  if p_channel_public_id is null
    or char_length(p_channel_public_id) = 0
    or char_length(p_channel_public_id) > 100
    or p_channel_uuid is null
    or char_length(p_channel_uuid) = 0
    or char_length(p_channel_uuid) > 100
    or p_updated_at is null then
    raise exception 'Invalid Kakao channel event metadata'
      using errcode = '22023';
  end if;

  if p_id_type = 'app_user_id' then
    select link.kakao_user_key, link.plusfriend_user_key
      into v_kakao_user_key, v_plusfriend_user_key
    from public.growing_kakao_parent_links as link
    where link.owner_id = p_owner_id
      and link.app_user_id = p_subject_id
    order by link.verified_at desc
    limit 1;

    select count(*)::integer
      into v_known_links
    from public.growing_kakao_parent_links as link
    where link.owner_id = p_owner_id
      and link.app_user_id = p_subject_id;
  else
    select link.kakao_user_key, link.plusfriend_user_key
      into v_kakao_user_key, v_plusfriend_user_key
    from public.growing_kakao_parent_links as link
    where link.owner_id = p_owner_id
      and link.channel_open_id = p_subject_id
    order by link.verified_at desc
    limit 1;

    select count(*)::integer
      into v_known_links
    from public.growing_kakao_parent_links as link
    where link.owner_id = p_owner_id
      and link.channel_open_id = p_subject_id;
  end if;

  v_kakao_user_key := coalesce(v_kakao_user_key, '');

  insert into public.growing_kakao_events (
    owner_id,
    kakao_user_key,
    plusfriend_user_key,
    event_type,
    status,
    dedupe_key,
    raw_payload
  )
  values (
    p_owner_id,
    v_kakao_user_key,
    v_plusfriend_user_key,
    'channel_' || p_event,
    'processing',
    'channel_relationship:' || p_resource_id,
    null
  )
  on conflict (dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'processed', false,
      'duplicate', true,
      'matched_links', 0
    );
  end if;

  if p_id_type = 'app_user_id' then
    update public.growing_kakao_parent_links
    set
      channel_blocked_at = case when p_event = 'blocked' then p_updated_at else null end,
      blocked_at = case
        when p_event = 'blocked' then p_updated_at
        when revoked_at is null then null
        else blocked_at
      end,
      channel_relationship_updated_at = p_updated_at
    where owner_id = p_owner_id
      and app_user_id = p_subject_id
      and (
        channel_relationship_updated_at is null
        or channel_relationship_updated_at < p_updated_at
      );
  else
    update public.growing_kakao_parent_links
    set
      channel_blocked_at = case when p_event = 'blocked' then p_updated_at else null end,
      blocked_at = case
        when p_event = 'blocked' then p_updated_at
        when revoked_at is null then null
        else blocked_at
      end,
      channel_relationship_updated_at = p_updated_at
    where owner_id = p_owner_id
      and channel_open_id = p_subject_id
      and (
        channel_relationship_updated_at is null
        or channel_relationship_updated_at < p_updated_at
      );
  end if;

  get diagnostics v_matched_links = row_count;

  update public.growing_kakao_events
  set status = case
    when v_known_links = 0 then 'unmatched'
    when v_matched_links = 0 then 'stale'
    else 'processed'
  end
  where id = v_event_id;

  return jsonb_build_object(
    'processed', true,
    'duplicate', false,
    'matched_links', v_known_links
  );
end;
$$;

revoke all on function public.growing_process_kakao_channel_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.growing_process_kakao_channel_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

create or replace function public.growing_cleanup_kakao_data()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.growing_kakao_events
  set raw_payload = null, response_body = null
  where raw_payload is not null or response_body is not null;

  update public.growing_parent_requests
  set raw_payload = null
  where raw_payload is not null;

  delete from public.growing_kakao_events
  where created_at < clock_timestamp() - interval '30 days';

  delete from public.growing_parent_requests
  where status in ('resolved', 'dismissed')
    and coalesce(resolved_at, created_at) < clock_timestamp() - interval '90 days';

  delete from public.growing_parent_requests
  where created_at < clock_timestamp() - interval '1 year';

  delete from public.growing_kakao_link_codes
  where coalesce(used_at, expires_at) < clock_timestamp() - interval '7 days';

  delete from public.growing_kakao_rate_limits
  where updated_at < clock_timestamp() - interval '2 days';

  delete from public.growing_kakao_conversation_states
  where expires_at < clock_timestamp();

  delete from public.growing_kakao_parent_links
  where coalesce(revoked_at, channel_blocked_at) is not null
    and coalesce(revoked_at, channel_blocked_at)
      < clock_timestamp() - interval '1 year';
end;
$$;

revoke all on function public.growing_cleanup_kakao_data()
  from public, anon, authenticated;

select public.growing_cleanup_kakao_data();

do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    for v_job_id in
      select jobid from cron.job where jobname = 'growing-kakao-retention'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'growing-kakao-retention',
      '17 18 * * *',
      'select public.growing_cleanup_kakao_data();'
    );
  else
    raise exception 'pg_cron is required for Kakao retention cleanup';
  end if;
end;
$$;

drop policy if exists "owner_delete" on public.growing_parent_requests;
create policy "owner_delete" on public.growing_parent_requests
  for delete using (auth.uid() = owner_id);

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'growing_parent_requests'
  ) then
    alter publication supabase_realtime add table public.growing_parent_requests;
  end if;
end;
$$;
