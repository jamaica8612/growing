/**
 * send-push: Internal Edge Function to deliver Web Push notifications (RFC 8291).
 * Called by other functions (e.g. kakao-skill) with a short-lived HMAC signature;
 * direct client calls are rejected even though gateway JWT verification is disabled.
 *
 * Body: { owner_id: string, title: string, body: string, url?: string, tag?: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import {
  isPushInternalSecretConfigured,
  verifyPushAuth,
} from '../_shared/push-auth.ts';

interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// ── VAPID JWT ──────────────────────────────────────────────────

function b64uEncode(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(str: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(b64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

async function makeVapidJwt(audience: string, subject: string, privateKeyB64u: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64uEncode(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const claims = b64uEncode(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })));
  const unsigned = `${header}.${claims}`;

  const rawKey = b64uDecode(privateKeyB64u);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    toPkcs8(rawKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64uEncode(sig)}`;
}

/** Wrap a raw 32-byte EC private key into PKCS#8 DER for WebCrypto import */
function toPkcs8(rawPrivate: Uint8Array): ArrayBuffer {
  // PKCS#8 for P-256: OID 1.2.840.10045.2.1 (ecPublicKey) + OID 1.2.840.10045.3.1.7 (P-256)
  const oid = new Uint8Array([
    0x30, 0x41,                           // SEQUENCE (65 bytes)
    0x02, 0x01, 0x00,                     // INTEGER 0 (version)
    0x30, 0x13,                           // SEQUENCE (19)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID P-256
    0x04, 0x27,                           // OCTET STRING (39)
    0x30, 0x25,                           // SEQUENCE (37)
    0x02, 0x01, 0x01,                     // INTEGER 1 (ecVersion)
    0x04, 0x20,                           // OCTET STRING (32) — the raw key
  ]);
  const der = new Uint8Array(oid.length + rawPrivate.length);
  der.set(oid);
  der.set(rawPrivate, oid.length);
  return der.buffer;
}

// ── RFC 8291 payload encryption ────────────────────────────────

async function encryptPayload(
  payload: string,
  clientPublicKeyB64u: string,
  authSecretB64u: string,
): Promise<{
  ciphertext: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
  serverPublicKeyRaw: Uint8Array<ArrayBuffer>;
}> {
  const enc = new TextEncoder();

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // Import client public key
  const clientPublicKeyRaw = b64uDecode(clientPublicKeyB64u);
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      serverKeyPair.privateKey,
      256,
    )
  );

  const authSecret = b64uDecode(authSecretB64u);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for content encryption key (RFC 8291 §3.3)
  async function hkdf(
    ikm: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
    length: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      ikmKey,
      length * 8,
    );
    return new Uint8Array(bits);
  }

  const authInfo = enc.encode('WebPush: info\x00');
  const authInfoBuf = new Uint8Array(authInfo.length + clientPublicKeyRaw.length + serverPublicKeyRaw.length);
  authInfoBuf.set(authInfo);
  authInfoBuf.set(clientPublicKeyRaw, authInfo.length);
  authInfoBuf.set(serverPublicKeyRaw, authInfo.length + clientPublicKeyRaw.length);

  const prk = await hkdf(sharedSecret, authSecret, authInfoBuf, 32);

  function makeInfo(
    type: string,
    clientKey: Uint8Array<ArrayBuffer>,
    serverKey: Uint8Array<ArrayBuffer>,
  ): Uint8Array<ArrayBuffer> {
    const label = enc.encode(`Content-Encoding: ${type}\x00P-256\x00`);
    const buf = new Uint8Array(label.length + 2 + clientKey.length + 2 + serverKey.length);
    let off = 0;
    buf.set(label, off); off += label.length;
    new DataView(buf.buffer).setUint16(off, clientKey.length); off += 2;
    buf.set(clientKey, off); off += clientKey.length;
    new DataView(buf.buffer).setUint16(off, serverKey.length); off += 2;
    buf.set(serverKey, off);
    return buf;
  }

  const cekInfo = makeInfo('aesgcm', clientPublicKeyRaw, serverPublicKeyRaw);
  const nonceInfo = makeInfo('nonce', clientPublicKeyRaw, serverPublicKeyRaw);

  const [cek, nonce] = await Promise.all([
    hkdf(prk, salt, cekInfo, 16),
    hkdf(prk, salt, nonceInfo, 12),
  ]);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = enc.encode(payload);
  // Add 2-byte padding (zero length) prefix per RFC 8291
  const padded = new Uint8Array(2 + plaintext.length);
  padded.set(plaintext, 2);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  );

  return { ciphertext, salt, serverPublicKeyRaw };
}

// ── Send one push notification ─────────────────────────────────

async function sendWebPush(
  sub: PushSub,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKeyRaw: string,
  vapidSubject: string,
): Promise<void> {
  const origin = new URL(sub.endpoint).origin;
  const jwt = await makeVapidJwt(origin, vapidSubject, vapidPrivateKey);
  const { ciphertext, salt, serverPublicKeyRaw } = await encryptPayload(
    JSON.stringify(payload),
    sub.p256dh,
    sub.auth,
  );

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Authorization': `vapid t=${jwt},k=${vapidPublicKeyRaw}`,
      'Encryption': `salt=${b64uEncode(salt.buffer)}`,
      'Crypto-Key': `dh=${b64uEncode(serverPublicKeyRaw.buffer)}`,
      'TTL': '86400',
    },
    body: ciphertext.buffer,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`Push failed ${res.status}: ${text}`);
  }
}

// ── Main handler ───────────────────────────────────────────────

const MAX_REQUEST_BODY_BYTES = 16_384;
const OWNER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSafeNotificationUrl(value: string): boolean {
  return value.startsWith('/') || value.startsWith('./') || value.startsWith('#');
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const internalSecret = Deno.env.get('PUSH_INTERNAL_SECRET');
  if (!isPushInternalSecretConfigured(internalSecret)) {
    console.error('send-push is disabled: PUSH_INTERNAL_SECRET must be at least 32 bytes');
    return new Response('Service unavailable', { status: 503 });
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return new Response('Bad request', { status: 400 });
  }

  const body = parsedBody as { owner_id?: unknown; title?: unknown; body?: unknown; url?: unknown; tag?: unknown };
  const { owner_id, title, body: msgBody, url, tag } = body;
  if (
    typeof owner_id !== 'string' || !OWNER_ID_PATTERN.test(owner_id) ||
    typeof title !== 'string' || !title || title.length > 120 ||
    typeof msgBody !== 'string' || !msgBody || msgBody.length > 500 ||
    (url !== undefined && (typeof url !== 'string' || url.length > 2_048 || !isSafeNotificationUrl(url))) ||
    (tag !== undefined && (typeof tag !== 'string' || tag.length > 64))
  ) {
    return new Response('Missing fields', { status: 400 });
  }

  const authorized = await verifyPushAuth({
    secret: internalSecret,
    ownerId: owner_id,
    rawBody,
    headers: req.headers,
  });
  if (!authorized) {
    return new Response('Unauthorized', { status: 401 });
  }

  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@growing.kr';

  if (!vapidPrivateKey || !vapidPublicKey) {
    return new Response('VAPID keys not configured', { status: 503 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: subs, error } = await supabase
    .from('growing_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('owner_id', owner_id);

  if (error) return new Response('DB error', { status: 500 });
  if (!subs || subs.length === 0) return new Response('No subscriptions', { status: 204 });

  const pushPayload: PushPayload = { title, body: msgBody, url, tag };
  const results = await Promise.allSettled(
    (subs as PushSub[]).map(sub =>
      sendWebPush(sub, pushPayload, vapidPrivateKey, vapidPublicKey, vapidSubject)
    )
  );

  // Remove expired/invalid subscriptions (410 Gone)
  const staleEndpoints: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected' && r.reason?.message?.includes('410')) {
      staleEndpoints.push((subs as PushSub[])[i].endpoint);
    }
  });
  if (staleEndpoints.length > 0) {
    await supabase
      .from('growing_push_subscriptions')
      .delete()
      .eq('owner_id', owner_id)
      .in('endpoint', staleEndpoints);
  }

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return new Response(JSON.stringify({ sent, total: subs.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
