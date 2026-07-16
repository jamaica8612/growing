import type { KakaoSkillPayload } from './logic.ts';

export const MAX_KAKAO_REQUEST_BYTES = 32 * 1024;
export const MAX_KAKAO_UTTERANCE_LENGTH = 500;
export const CONNECT_ATTEMPT_LIMIT = 5;
export const CONNECT_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const textDecoder = new TextDecoder('utf-8', { fatal: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStringMap(value: unknown, field: string): void {
  if (value === undefined) return;
  if (!isRecord(value) || Object.keys(value).length > 20) {
    throw new TypeError(`${field} is invalid`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.length > 64 || typeof item !== 'string' || item.length > MAX_KAKAO_UTTERANCE_LENGTH) {
      throw new TypeError(`${field} is invalid`);
    }
  }
}

export function validateKakaoSkillPayload(value: unknown): KakaoSkillPayload {
  if (!isRecord(value)) throw new TypeError('payload is invalid');

  const intent = value.intent;
  if (intent !== undefined && (
    !isRecord(intent) ||
    (intent.name !== undefined && (typeof intent.name !== 'string' || intent.name.length > 128))
  )) {
    throw new TypeError('intent is invalid');
  }

  const userRequest = value.userRequest;
  if (userRequest !== undefined) {
    if (!isRecord(userRequest)) throw new TypeError('userRequest is invalid');
    const utterance = userRequest.utterance;
    if (utterance !== undefined && (
      typeof utterance !== 'string' || utterance.length > MAX_KAKAO_UTTERANCE_LENGTH
    )) {
      throw new TypeError('utterance is invalid');
    }
    const user = userRequest.user;
    if (user !== undefined) {
      if (!isRecord(user) || (user.id !== undefined && (
        typeof user.id !== 'string' || user.id.length > 128
      ))) {
        throw new TypeError('user is invalid');
      }
      if (user.properties !== undefined) {
        if (!isRecord(user.properties)) throw new TypeError('user properties are invalid');
        for (const key of ['plusfriendUserKey', 'appUserId', 'app_user_id'] as const) {
          const property = user.properties[key];
          if (property !== undefined && (typeof property !== 'string' || property.length > 128)) {
            throw new TypeError('user properties are invalid');
          }
        }
        if (user.properties.isFriend !== undefined && typeof user.properties.isFriend !== 'boolean') {
          throw new TypeError('user properties are invalid');
        }
      }
    }
  }

  const action = value.action;
  if (action !== undefined) {
    if (!isRecord(action)) throw new TypeError('action is invalid');
    validateStringMap(action.params, 'action.params');
    validateStringMap(action.clientExtra, 'action.clientExtra');
  }

  return value as KakaoSkillPayload;
}

export async function readKakaoSkillPayload(
  req: Request,
  maxBytes = MAX_KAKAO_REQUEST_BYTES,
): Promise<KakaoSkillPayload> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError('request body is too large');
  }
  if (!req.body) throw new TypeError('request body is missing');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel('request body is too large');
        throw new RangeError('request body is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return validateKakaoSkillPayload(JSON.parse(textDecoder.decode(body)));
}

export function normalizeConnectCredentials(studentName: string, phone: string): {
  studentName: string;
  phone: string;
} | null {
  const normalizedName = studentName.trim().replace(/\s+/g, ' ');
  const normalizedPhone = phone.replace(/[^0-9]/g, '');
  if (normalizedName.length < 2 || normalizedName.length > 30) return null;
  if (!/^01\d{8,9}$/.test(normalizedPhone)) return null;
  return { studentName: normalizedName, phone: normalizedPhone };
}

export function extractKakaoLinkCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/^연결\s*/, '');
  return /^[0-9A-F]{8}$/.test(compact) ? compact : '';
}

export function getKakaoAppUserId(payload: KakaoSkillPayload): string {
  const properties = payload.userRequest?.user?.properties;
  const value = properties?.appUserId ?? properties?.app_user_id;
  return typeof value === 'string' && value.length <= 128 ? value : '';
}

export function safeEventStatus(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 120);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
