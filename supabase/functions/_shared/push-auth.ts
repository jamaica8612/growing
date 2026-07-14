const encoder = new TextEncoder();

export const PUSH_AUTH_HEADERS = {
  ownerId: 'x-growing-push-owner',
  timestamp: 'x-growing-push-timestamp',
  signature: 'x-growing-push-signature',
} as const;

export const PUSH_AUTH_MAX_SKEW_SECONDS = 60;
export const PUSH_INTERNAL_SECRET_MIN_BYTES = 32;

interface HeaderReader {
  get(name: string): string | null;
}

interface CreatePushAuthHeadersOptions {
  secret: string;
  ownerId: string;
  rawBody: string;
  nowMs?: number;
}

interface VerifyPushAuthOptions {
  secret: string | undefined;
  ownerId: string;
  rawBody: string;
  headers: HeaderReader;
  nowMs?: number;
}

export function isPushInternalSecretConfigured(secret: string | undefined): secret is string {
  return typeof secret === 'string' && encoder.encode(secret).byteLength >= PUSH_INTERNAL_SECRET_MIN_BYTES;
}

function canonicalRequest(timestamp: string, ownerId: string, rawBody: string): ArrayBuffer {
  return encoder.encode(`v1\n${timestamp}\n${ownerId}\n${rawBody}`).buffer;
}

function base64UrlEncode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(input: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input)) return null;
  const padded = input + '='.repeat((4 - input.length % 4) % 4);
  try {
    const decoded = Uint8Array.from(
      atob(padded.replace(/-/g, '+').replace(/_/g, '/')),
      char => char.charCodeAt(0),
    ).buffer;
    return base64UrlEncode(decoded) === input ? decoded : null;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function createPushAuthHeaders({
  secret,
  ownerId,
  rawBody,
  nowMs = Date.now(),
}: CreatePushAuthHeadersOptions): Promise<Record<string, string>> {
  if (!isPushInternalSecretConfigured(secret)) {
    throw new Error(`PUSH_INTERNAL_SECRET must be at least ${PUSH_INTERNAL_SECRET_MIN_BYTES} bytes`);
  }
  if (!ownerId) throw new Error('ownerId is required');

  const timestamp = Math.floor(nowMs / 1000).toString();
  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    canonicalRequest(timestamp, ownerId, rawBody),
  );

  return {
    [PUSH_AUTH_HEADERS.ownerId]: ownerId,
    [PUSH_AUTH_HEADERS.timestamp]: timestamp,
    [PUSH_AUTH_HEADERS.signature]: base64UrlEncode(signature),
  };
}

export async function verifyPushAuth({
  secret,
  ownerId,
  rawBody,
  headers,
  nowMs = Date.now(),
}: VerifyPushAuthOptions): Promise<boolean> {
  if (!isPushInternalSecretConfigured(secret) || !ownerId) return false;

  const claimedOwnerId = headers.get(PUSH_AUTH_HEADERS.ownerId);
  const timestamp = headers.get(PUSH_AUTH_HEADERS.timestamp);
  const encodedSignature = headers.get(PUSH_AUTH_HEADERS.signature);

  // The signed caller identity must match the recipient selected from the body.
  if (claimedOwnerId !== ownerId || !timestamp || !encodedSignature) return false;
  if (!/^\d{10}$/.test(timestamp)) return false;

  const signedAtSeconds = Number(timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - signedAtSeconds) > PUSH_AUTH_MAX_SKEW_SECONDS) return false;

  const signature = base64UrlDecode(encodedSignature);
  if (!signature) return false;

  try {
    const key = await importHmacKey(secret, 'verify');
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      canonicalRequest(timestamp, claimedOwnerId, rawBody),
    );
  } catch {
    return false;
  }
}
