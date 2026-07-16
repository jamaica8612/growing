import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260717123000_kakao_channel_webhook_hardening.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('Kakao launch hardening migration', () => {
  it('uses single-use salted link codes and explicit consent versioning', () => {
    expect(migration).toContain('create table if not exists public.growing_kakao_link_codes');
    expect(migration).toContain('code_salt bytea not null');
    expect(migration).toContain('code_hash bytea not null');
    expect(migration).toContain("consent_version = excluded.consent_version");
    expect(migration).toContain('consent_text_hash = excluded.consent_text_hash');
    expect(migration).toContain('p_consent_text_hash is null');
    expect(migration).toContain("'2026-07-17-v1'");
    expect(migration).toContain('blocked_at = coalesce(blocked_at, clock_timestamp())');
    expect(migration).toContain('revoked_at timestamptz');
    expect(migration).toContain('channel_blocked_at timestamptz');
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('makes rate limiting and request deduplication atomic in Postgres', () => {
    expect(migration).toContain('create or replace function public.growing_consume_kakao_rate_limit');
    expect(migration).toContain('on conflict (owner_id, scope, subject_hash) do update');
    expect(migration).toContain('create or replace function public.growing_create_kakao_parent_request');
    expect(migration).toContain('on conflict (dedupe_key) do nothing');
    expect(migration).toContain('student is not actively linked to kakao user');
  });

  it('binds claim replay to the same active Kakao identity', () => {
    expect(migration).toContain('link.kakao_user_key = p_kakao_user_key');
    expect(migration).toContain('link.consent_text_hash = p_consent_text_hash');
    expect(migration).toContain("return jsonb_build_object('matched', false)");
  });

  it('stores short-lived conversation state outside best-effort event logs', () => {
    expect(migration).toContain('create table if not exists public.growing_kakao_conversation_states');
    expect(migration).toContain('add column if not exists privacy_consent_at');
    expect(migration).toContain('growing_set_kakao_counsel_prompt');
    expect(migration).toContain('growing_get_kakao_counsel_prompt');
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain('delete from public.growing_kakao_conversation_states');
    expect(migration).toContain('delete from public.growing_kakao_rate_limits');
  });

  it('requires and records explicit consent for unlinked counsel requests', () => {
    expect(migration).toContain('privacy_consent_at timestamptz');
    expect(migration).toContain('privacy_consent_version text');
    expect(migration).toContain('privacy_consent_text_hash text');
    expect(migration).toContain("'2026-07-17-counsel-v1'");
    expect(migration).toContain('unlinked counsel privacy consent is required');
    expect(migration).toContain("p_request_type = 'counsel' and p_student_id is null");
  });

  it('restricts privileged RPCs to service_role', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('v_owner_id uuid := auth.uid()');
  });

  it('binds the Admin key to the exact Kakao channel identifiers', () => {
    expect(migration).toContain('kakao_channel_public_id');
    expect(migration).toContain('kakao_channel_uuid');
    expect(migration).toContain('idx_growing_kakao_channels_event_binding');
    expect(migration).toContain('growing_kakao_channels_identifier_pair');
  });

  it('stores Skill and Admin credentials only as one-way hashes', () => {
    expect(migration).toContain('skill_secret_hash');
    expect(migration).toContain('growing_hash_kakao_skill_secret');
    expect(migration).toContain('new.skill_secret := null');
    expect(migration).toContain('event_admin_key_hash');
    expect(migration).toContain('new.event_secret := null');
  });

  it('publishes all parent request types to the admin realtime queue', () => {
    expect(migration).toContain('alter publication supabase_realtime add table public.growing_parent_requests');
  });

  it('removes legacy raw payloads and schedules retention cleanup', () => {
    expect(migration).toContain('create or replace function public.growing_cleanup_kakao_data');
    expect(migration).toContain('set raw_payload = null, response_body = null');
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("interval '90 days'");
    expect(migration).toContain('coalesce(revoked_at, channel_blocked_at)');
    expect(migration).toContain("'growing-kakao-retention'");
  });
});
