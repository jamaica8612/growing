// 해석/영작 첨삭 공개 함수의 순수 로직 (Deno/Node 공용 — 테스트에서 직접 import).

export type CorrectionMode = 'translate' | 'compose';

export interface CorrectionItem {
  answer: string;
  corrected: string;
  explanation: string;
  completeness: number;
  accuracy: number;
}

export const MAX_SENTENCES = 40;
export const MAX_ANSWER_LENGTH = 1_000;
export const MAX_NAME_LENGTH = 20;
export const SESSION_TTL_SECONDS = 2 * 60 * 60;
export const MAX_FAILED_LOGINS = 5;
export const LOGIN_LOCK_MS = 10 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_PATTERN = /^\d{4}$/;
const textEncoder = new TextEncoder();

export function isCorrectionMode(value: unknown): value is CorrectionMode {
  return value === 'translate' || value === 'compose';
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && PIN_PATTERN.test(value);
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function makePinSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

// 앱(선생님 비번 초기화)과 같은 방식: SHA-256(salt + ':' + pin)
export async function hashPin(salt: string, pin: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(`${salt}:${pin}`)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- 학생 로그인 토큰 (HMAC 서명, 2시간) ----

export interface SessionClaims {
  v: 1;
  ownerId: string;
  studentId: string;
  name: string;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload))));
}

export async function signSession(secret: string, claims: Omit<SessionClaims, 'v' | 'exp'>, now = Date.now()): Promise<string> {
  const body: SessionClaims = { v: 1, ...claims, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const payload = base64UrlEncode(textEncoder.encode(JSON.stringify(body)));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(secret: string, token: unknown, now = Date.now()): Promise<SessionClaims | null> {
  if (typeof token !== 'string' || token.length > 1_000) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  if (!constantTimeEqual(await hmac(secret, payload), signature)) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as SessionClaims;
    if (claims.v !== 1 || !isUuid(claims.ownerId) || !isUuid(claims.studentId) || typeof claims.name !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function sentenceList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim());
}

// 문장 수와 같은 길이의 문자열 배열만 받는다.
export function validateAnswers(value: unknown, count: number): string[] | null {
  if (!Array.isArray(value) || value.length !== count) return null;
  const answers: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length > MAX_ANSWER_LENGTH) return null;
    answers.push(item.trim());
  }
  return answers;
}

export function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function summarize(items: Pick<CorrectionItem, 'completeness' | 'accuracy'>[]): { completeness: number; accuracy: number } {
  if (items.length === 0) return { completeness: 0, accuracy: 0 };
  const sum = (key: 'completeness' | 'accuracy') => items.reduce((total, item) => total + clampPercent(item[key]), 0);
  return {
    completeness: Math.round(sum('completeness') / items.length),
    accuracy: Math.round(sum('accuracy') / items.length),
  };
}

// AI 호출이 실패했을 때 저장하는 빈 첨삭 (선생님이 직접 채우거나 다시 첨삭).
export function ungradedItems(answers: string[]): CorrectionItem[] {
  return answers.map(answer => ({ answer, corrected: '', explanation: '', completeness: 0, accuracy: 0 }));
}

export function buildGradePrompt(mode: CorrectionMode, sentences: string[], answers: string[]): string {
  const task = mode === 'translate'
    ? 'Each source sentence is English. The student wrote a Korean translation.'
    : 'Each source sentence is Korean. The student wrote it in English (영작).';
  const correctedRule = mode === 'translate'
    ? '"corrected": a natural, accurate Korean translation that keeps the student\'s wording where it is already right.'
    : '"corrected": a grammatical, natural English sentence that keeps the student\'s wording where it is already right.';
  const lines = sentences.map((sentence, index) => [
    `[${index + 1}]`,
    `source: ${sentence}`,
    `student: ${answers[index] || '(blank)'}`,
  ].join('\n'));

  return `
You are an English teacher in Korea correcting a middle/high school student's work sentence by sentence.
${task}

Return ONLY valid JSON:
{"items":[{"corrected":"...","explanation":"...","completeness":0,"accuracy":0}]}

Rules:
- Return exactly ${sentences.length} items, in the same order as the sentences.
- ${correctedRule}
- "explanation": one or two short Korean sentences telling the student what was wrong and why (grammar, word choice, missing meaning). If the answer is already correct, give a short Korean compliment.
- "completeness" (0-100): how much of the source meaning the student's answer covers. Blank = 0.
- "accuracy" (0-100): how correct the written part is (grammar, vocabulary, meaning). Blank = 0.
- Random letters or unrelated text get 0 for both.
- Be fair but conservative.

${lines.join('\n\n')}
`.trim();
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

function shortText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parseGradeResult(text: string, answers: string[]): CorrectionItem[] {
  const parsed = JSON.parse(stripFence(text)) as { items?: unknown } | unknown[];
  const rawItems = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
  if (!Array.isArray(rawItems) || rawItems.length !== answers.length) {
    throw new Error('AI 첨삭 결과의 문장 수가 맞지 않습니다.');
  }
  return rawItems.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const answer = answers[index];
    const blank = answer === '';
    return {
      answer,
      corrected: shortText(item.corrected, 1_000),
      explanation: shortText(item.explanation, 400),
      completeness: blank ? 0 : clampPercent(item.completeness),
      accuracy: blank ? 0 : clampPercent(item.accuracy),
    };
  });
}
