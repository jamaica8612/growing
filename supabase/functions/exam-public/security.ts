export type AnswerValue = string | number;

export const MAX_REQUEST_BYTES = 128 * 1024;
export const MAX_ANSWER_COUNT = 100;
export const MAX_WRITTEN_ANSWER_LENGTH = 4_000;
export const VERIFICATION_TTL_SECONDS = 60 * 60;

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const STUDENT_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const QUESTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const textEncoder = new TextEncoder();

let cachedSecret = '';
let cachedHmacKey: Promise<CryptoKey> | null = null;

export interface VerificationClaims {
  version: 1;
  code: string;
  studentKey: string;
  issuedAt: number;
  expiresAt: number;
}

export type BodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export async function readJsonBody(req: Request): Promise<BodyReadResult> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, error: '요청 크기가 너무 큽니다.' };
  }
  if (!req.body) return { ok: false, status: 400, error: 'Invalid request' };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: '요청 크기가 너무 큽니다.' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'Invalid request' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid request' };
  }
}

export function normalizeVerificationSecret(value: unknown): string | null {
  const secret = typeof value === 'string' ? value.trim() : '';
  return secret.length >= 32 ? secret : null;
}

export function isValidCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

export function isValidStudentKey(value: string): boolean {
  return STUDENT_KEY_PATTERN.test(value);
}

export function isValidVerificationTokenShape(value: string): boolean {
  if (value.length === 0 || value.length > 2_048) return false;
  const parts = value.split('.');
  return parts.length === 2
    && /^[A-Za-z0-9_-]{1,1024}$/.test(parts[0])
    && STUDENT_KEY_PATTERN.test(parts[1]);
}

export function isValidResultToken(value: string): boolean {
  return RESULT_TOKEN_PATTERN.test(value);
}

export function validatedAnswers(value: unknown): Record<string, AnswerValue> | null {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_ANSWER_COUNT) return null;
  for (const [questionId, answer] of entries) {
    if (!QUESTION_ID_PATTERN.test(questionId)) return null;
    if (typeof answer === 'string') {
      if (answer.length > MAX_WRITTEN_ANSWER_LENGTH) return null;
      continue;
    }
    if (typeof answer !== 'number' || !Number.isSafeInteger(answer) || answer < 0 || answer > 999) return null;
  }
  return value as Record<string, AnswerValue>;
}

function base64UrlEncode(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedHmacKey && cachedSecret === secret) return cachedHmacKey;
  cachedSecret = secret;
  cachedHmacKey = crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return cachedHmacKey;
}

async function signValue(secret: string, value: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function makeStudentKey(secret: string, examId: string, studentId: string): Promise<string> {
  return signValue(secret, `student-option:${examId}:${studentId}`);
}

export async function signVerificationToken(
  secret: string,
  code: string,
  studentKey: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const claims: VerificationClaims = {
    version: 1,
    code,
    studentKey,
    issuedAt: now,
    expiresAt: now + VERIFICATION_TTL_SECONDS,
  };
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signature = await signValue(secret, `exam-verification:${encodedClaims}`);
  return `${encodedClaims}.${signature}`;
}

export async function verifyVerificationToken(
  secret: string,
  token: string,
  expectedCode: string,
  now = Math.floor(Date.now() / 1000),
): Promise<VerificationClaims | null> {
  try {
    if (!isValidVerificationTokenShape(token)) return null;
    const [encodedClaims, encodedSignature] = token.split('.');
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(encodedSignature),
      textEncoder.encode(`exam-verification:${encodedClaims}`),
    );
    if (!validSignature) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedClaims))) as Partial<VerificationClaims>;
    if (
      claims.version !== 1
      || claims.code !== expectedCode
      || typeof claims.studentKey !== 'string'
      || !isValidStudentKey(claims.studentKey)
      || typeof claims.issuedAt !== 'number'
      || typeof claims.expiresAt !== 'number'
      || claims.issuedAt > now + 60
      || claims.expiresAt <= now
      || claims.expiresAt - claims.issuedAt > VERIFICATION_TTL_SECONDS
    ) return null;
    return claims as VerificationClaims;
  } catch {
    return null;
  }
}

export function phoneMatchesLast4(value: unknown, last4: string): boolean {
  if (!/^\d{4}$/.test(last4) || typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 && digits.endsWith(last4);
}

export function maskStudentName(value: unknown): string {
  if (typeof value !== 'string') return '학생';
  const characters = Array.from(value.trim());
  if (characters.length === 0) return '학생';
  if (characters.length === 1) return '*';
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${'*'.repeat(characters.length - 2)}${characters[characters.length - 1]}`;
}
