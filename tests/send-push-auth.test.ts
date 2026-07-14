import { describe, expect, it } from 'vitest';
import {
  PUSH_AUTH_HEADERS,
  PUSH_AUTH_MAX_SKEW_SECONDS,
  createPushAuthHeaders,
  isPushInternalSecretConfigured,
  verifyPushAuth,
} from '../supabase/functions/_shared/push-auth.ts';

const secret = '0123456789abcdef0123456789abcdef';
const ownerId = '9855dd6f-735a-4dbf-828f-1a55538d95a5';
const rawBody = JSON.stringify({
  owner_id: ownerId,
  title: '상담 요청',
  body: '확인이 필요합니다.',
  tag: 'counsel',
});
const nowMs = 1_750_000_000_000;

describe('internal send-push authentication', () => {
  it('accepts an untampered request signed by kakao-skill', async () => {
    const signedHeaders = await createPushAuthHeaders({ secret, ownerId, rawBody, nowMs });

    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody,
      headers: new Headers(signedHeaders),
      nowMs,
    })).resolves.toBe(true);
  });

  it('binds the signature to both the recipient owner and the exact body', async () => {
    const signedHeaders = await createPushAuthHeaders({ secret, ownerId, rawBody, nowMs });
    const headers = new Headers(signedHeaders);

    await expect(verifyPushAuth({
      secret,
      ownerId: '1b660c62-b02c-4bbd-9f16-ffb22fa738d0',
      rawBody,
      headers,
      nowMs,
    })).resolves.toBe(false);

    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody: rawBody.replace('확인이 필요합니다.', '변조된 요청'),
      headers,
      nowMs,
    })).resolves.toBe(false);
  });

  it('rejects missing or altered signatures', async () => {
    const signedHeaders = await createPushAuthHeaders({ secret, ownerId, rawBody, nowMs });

    const missingSignature = new Headers(signedHeaders);
    missingSignature.delete(PUSH_AUTH_HEADERS.signature);
    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody,
      headers: missingSignature,
      nowMs,
    })).resolves.toBe(false);

    const alteredSignature = new Headers(signedHeaders);
    const signature = alteredSignature.get(PUSH_AUTH_HEADERS.signature)!;
    alteredSignature.set(PUSH_AUTH_HEADERS.signature, `${signature.slice(0, -1)}A`);
    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody,
      headers: alteredSignature,
      nowMs,
    })).resolves.toBe(false);

    await expect(verifyPushAuth({
      secret: 'fedcba9876543210fedcba9876543210',
      ownerId,
      rawBody,
      headers: new Headers(signedHeaders),
      nowMs,
    })).resolves.toBe(false);
  });

  it('rejects replayed or far-future requests outside the clock window', async () => {
    const signedHeaders = await createPushAuthHeaders({ secret, ownerId, rawBody, nowMs });
    const headers = new Headers(signedHeaders);
    const outsideWindowMs = (PUSH_AUTH_MAX_SKEW_SECONDS + 1) * 1000;

    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody,
      headers,
      nowMs: nowMs + outsideWindowMs,
    })).resolves.toBe(false);
    await expect(verifyPushAuth({
      secret,
      ownerId,
      rawBody,
      headers,
      nowMs: nowMs - outsideWindowMs,
    })).resolves.toBe(false);
  });

  it('fails closed when the shared secret is missing or too short', async () => {
    expect(isPushInternalSecretConfigured(undefined)).toBe(false);
    expect(isPushInternalSecretConfigured('too-short')).toBe(false);
    expect(isPushInternalSecretConfigured(secret)).toBe(true);

    await expect(verifyPushAuth({
      secret: undefined,
      ownerId,
      rawBody,
      headers: new Headers(),
      nowMs,
    })).resolves.toBe(false);
    await expect(createPushAuthHeaders({
      secret: 'too-short',
      ownerId,
      rawBody,
      nowMs,
    })).rejects.toThrow('at least 32 bytes');
  });
});
