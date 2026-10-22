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

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const RESULT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isCorrectionMode(value: unknown): value is CorrectionMode {
  return value === 'translate' || value === 'compose';
}

export function isValidCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

export function isValidResultToken(value: string): boolean {
  return RESULT_TOKEN_PATTERN.test(value);
}

export function makeResultToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let token = '';
  for (const byte of bytes) token += alphabet[byte % alphabet.length];
  return token;
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
