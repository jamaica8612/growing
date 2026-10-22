import { supabase } from './supabase';

// ============================================================================
// 해석/영작 첨삭 게시판
//   테이블  growing_correction_sets / _students / _submissions (owner RLS)
//   엣지함수 correction-public (무로그인 — 게시판·학생 로그인·제출·내 제출, regrade만 JWT)
// 학생은 게시판 링크(#/board/<선생님 id>)에서 이름 + 4자리 비번으로 들어온다.
// 첨삭은 선생님이 공개(published)하기 전까지 학생에게 보이지 않는다.
// ============================================================================

export type CorrectionMode = 'translate' | 'compose';
export type CorrectionSetStatus = 'open' | 'closed';

export const MODE_LABELS: Record<CorrectionMode, string> = { translate: '해석', compose: '영작' };

export interface CorrectionSet {
  id: string;
  mode: CorrectionMode;
  title: string;
  sentences: string[];
  status: CorrectionSetStatus;
  createdAt: string;
}

export interface CorrectionItem {
  answer: string;
  corrected: string;
  explanation: string;
  completeness: number;
  accuracy: number;
}

export interface CorrectionSubmission {
  id: string;
  setId: string;
  studentId: string;
  studentName: string;
  items: CorrectionItem[];
  completeness: number;
  accuracy: number;
  gradingStatus: 'graded' | 'failed';
  published: boolean;
  submittedAt: string;
}

export interface CorrectionStudent {
  id: string;
  name: string;
  // 불러온 시점에 비번 오류로 잠겨 있었는지
  locked: boolean;
  createdAt: string;
}

export interface BoardSet {
  id: string;
  title: string;
  mode: CorrectionMode;
  sentenceCount: number;
  createdAt: string;
}

export interface PublicCorrectionSet {
  id: string;
  title: string;
  mode: CorrectionMode;
  sentences: string[];
}

export interface MySubmission {
  setId: string;
  title: string;
  mode: CorrectionMode;
  sentences: string[];
  answers: string[];
  submittedAt: string;
  published: boolean;
  completeness?: number;
  accuracy?: number;
  items?: CorrectionItem[];
}

export type LoginResult = { needsRegister: true } | { needsRegister: false; token: string; name: string; registered: boolean };

export const MAX_SENTENCES = 40;

// 마침표 뒤에 와도 문장 끝이 아닌 영어 약어
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'jr', 'sr', 'e.g', 'i.e', 'no', 'mt']);

function endsWithAbbreviation(text: string): boolean {
  const lastWord = text.trim().split(/\s+/).at(-1) ?? '';
  const bare = lastWord.replace(/^["'“‘(]+/, '').replace(/\.$/, '').toLowerCase();
  if (ABBREVIATIONS.has(bare)) return true;
  // U.S. / a.m. 처럼 한 글자+마침표 반복
  return /^([a-z]\.)*[a-z]$/i.test(bare) && bare.includes('.');
}

// 붙여넣은 지문을 문장 단위로 나눈다. 줄바꿈은 항상 문장 경계로 본다.
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let current = '';
    for (let i = 0; i < line.length; i++) {
      current += line[i];
      if (!/[.!?。？！]/.test(line[i])) continue;
      // 이어지는 마침표/따옴표/괄호까지 같은 문장에 붙인다.
      while (i + 1 < line.length && /[.!?。？！"'”’)\]]/.test(line[i + 1])) {
        i += 1;
        current += line[i];
      }
      const next = line[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue;
      if (line[i] === '.' && endsWithAbbreviation(current)) continue;
      sentences.push(current.trim());
      current = '';
    }
    if (current.trim()) sentences.push(current.trim());
  }
  return sentences.filter(sentence => sentence !== '');
}

export function averageScores(items: Pick<CorrectionItem, 'completeness' | 'accuracy'>[]): { completeness: number; accuracy: number } {
  if (items.length === 0) return { completeness: 0, accuracy: 0 };
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const sum = (key: 'completeness' | 'accuracy') => items.reduce((total, item) => total + clamp(item[key]), 0);
  return {
    completeness: Math.round(sum('completeness') / items.length),
    accuracy: Math.round(sum('accuracy') / items.length),
  };
}

// 카톡 등에 붙여넣을 첨삭 결과 텍스트
export function formatCorrectionForCopy(
  set: { title: string; mode: CorrectionMode; sentences: string[] },
  submission: { studentName: string; items: CorrectionItem[] },
): string {
  const scores = averageScores(submission.items);
  const header = [
    `[${MODE_LABELS[set.mode]} 첨삭] ${set.title} - ${submission.studentName}`,
    `완성도 ${scores.completeness}% · 정확도 ${scores.accuracy}%`,
  ];
  const blocks = set.sentences.map((sentence, index) => {
    const item = submission.items[index];
    const lines = [`${index + 1}. ${sentence}`, `- 내 답: ${item?.answer || '(빈칸)'}`];
    if (item?.corrected) lines.push(`- 첨삭: ${item.corrected}`);
    if (item?.explanation) lines.push(`- 설명: ${item.explanation}`);
    return lines.join('\n');
  });
  return [...header, '', blocks.join('\n\n')].join('\n');
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

const printDate = (value: string | Date | undefined, withYear = false) => {
  const date = value instanceof Date ? value : new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { year: withYear ? 'numeric' : undefined, month: 'long', day: 'numeric' }).format(date);
};

const scoreLevel = (value: number) => (value >= 90 ? 'high' : value >= 60 ? 'mid' : 'low');

const PRINT_LABELS: Record<CorrectionMode, { left: string; right: string }> = {
  translate: { left: '원문과 내 해석', right: '고친 해석' },
  compose: { left: '문제와 내 영작', right: '고친 문장' },
};

// 앱 사이드바·월간 리포트와 같은 새싹 아이콘
const SPROUT_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg>';

// 첨삭 결과지 (A4). 학생 한 명이 한 장에서 시작하고, 문항 칸은 내용만큼만 차지한다
// (남는 곳은 공백, 넘치면 다음 장으로). 인쇄는 printDocument가 창을 다 그린 뒤 부른다 —
// 앱 CSP가 인라인 스크립트를 막기 때문.
export function buildCorrectionPrintHtml(
  set: { title: string; mode: CorrectionMode; sentences: string[] },
  submissions: { studentName: string; items: CorrectionItem[]; submittedAt?: string; published?: boolean }[],
  issuedAt: Date = new Date(),
): string {
  const label = MODE_LABELS[set.mode];
  const labels = PRINT_LABELS[set.mode];
  const issued = printDate(issuedAt, true);
  const sheets = submissions.map(submission => {
    const scores = averageScores(submission.items);
    let correctCount = 0;
    const rows = set.sentences.map((sentence, index) => {
      const item = submission.items[index];
      const answer = item?.answer ?? '';
      const corrected = item?.corrected ?? '';
      const accuracy = answer ? item?.accuracy ?? 0 : 0;
      const ok = answer !== '' && corrected.trim() === answer.trim();
      if (ok) correctCount += 1;
      const fix = ok
        ? '<span class="pass">✓ 정답</span>'
        : corrected ? `<p class="fix">${escapeHtml(corrected)}</p>` : '<p class="fix none">-</p>';
      return `<li class="row${ok ? ' ok' : ''}">`
        + `<span class="no">${String(index + 1).padStart(2, '0')}</span>`
        + `<div class="mine"><p class="src">${escapeHtml(sentence)}</p>`
        + `<p class="ans">${answer ? escapeHtml(answer) : '<span class="blank">(빈칸)</span>'}</p></div>`
        + `<div class="right">${fix}</div>`
        + `<span class="pts ${scoreLevel(accuracy)}">${accuracy}</span>`
        + (item?.explanation ? `<p class="why">${escapeHtml(item.explanation)}</p>` : '')
        + '</li>';
    }).join('');
    const submitted = printDate(submission.submittedAt);
    const meta = [escapeHtml(set.title), submitted ? `${submitted} 제출` : ''].filter(Boolean).join(' · ');
    const stat = (name: string, value: number) =>
      `<div class="stat"><span>${name}</span><b>${value}</b><i class="meter"><i class="${scoreLevel(value)}" style="width:${value}%"></i></i></div>`;
    return '<section class="sheet">'
      + '<header class="brand">'
      + `<div class="logo"><span class="mark">${SPROUT_ICON}</span><div><b>그로잉영어 교습소</b><span>GROWING ENGLISH</span></div></div>`
      + `<div class="doc"><b>${label} 첨삭 결과지</b><span>발행일 ${issued}</span></div>`
      + '</header>'
      + '<div class="band"><div class="who">'
      + `<h1>${escapeHtml(submission.studentName)}${submission.published === false ? '<span class="draft">검토 전</span>' : ''}</h1>`
      + `<p>${meta}</p></div><div class="stats">`
      + stat('완성도', scores.completeness) + stat('정확도', scores.accuracy)
      + `<div class="stat"><span>정답</span><b>${correctCount}<small>/${set.sentences.length}</small></b></div>`
      + '</div></div>'
      + `<div class="cols"><span></span><span>${labels.left}</span><span>${labels.right}</span><span>정확도</span></div>`
      + `<ol class="rows">${rows}</ol>`
      + '<footer>'
      + '<span><b>그로잉영어 교습소</b> · 담당 선생님 확인 <i class="sign"></i></span>'
      + '<span>정확도: 뜻과 문법이 맞는 정도 · 완성도: 원문의 뜻을 옮긴 정도 · <em class="high">90+</em> <em class="mid">60+</em> <em class="low">60 미만</em></span>'
      + '</footer>'
      + '</section>';
  }).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(`${label} 첨삭 결과지 - ${set.title}`)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Outfit:wght@600;700;800&display=swap">
<style>
  @page { size: A4; margin: 9mm 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 9pt; line-height: 1.42; color: #1f2937; word-break: keep-all; overflow-wrap: anywhere; }
  p, h1, ol { margin: 0; }
  .sheet { display: flex; flex-direction: column; gap: 2.6mm; min-height: 278mm; }
  .sheet + .sheet { break-before: page; }
  .brand { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2.4mm; border-bottom: 0.6mm solid #1b4b36; }
  .logo { display: flex; align-items: center; gap: 2.6mm; }
  .mark { display: grid; place-items: center; width: 9mm; height: 9mm; border-radius: 2.6mm; background: linear-gradient(135deg, #1b4b36, #10b981); color: #fff; }
  .logo b, .doc b { display: block; font-size: 11pt; font-weight: 800; color: #0f3023; }
  .logo span { display: block; font-family: 'Outfit', sans-serif; font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; color: #10b981; }
  .doc { text-align: right; }
  .doc span { font-size: 8pt; color: #6b7280; }
  .band { display: flex; justify-content: space-between; align-items: center; gap: 5mm; padding: 3.2mm 4.5mm; border-radius: 3mm; background: #0f3023; color: #fff; }
  .who h1 { display: flex; align-items: center; gap: 2.4mm; font-size: 18pt; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; }
  .who p { margin-top: 0.6mm; font-size: 8.5pt; color: #c9e4d6; }
  .draft { padding: 0.4mm 2mm; border-radius: 99px; background: #fde68a; color: #78350f; font-size: 7.5pt; font-weight: 700; letter-spacing: 0; }
  .stats { display: flex; gap: 5mm; }
  .stat { display: flex; flex-direction: column; align-items: flex-end; min-width: 13mm; }
  .stat span { font-size: 7.5pt; color: #c9e4d6; }
  .stat b { font-family: 'Outfit', sans-serif; font-size: 17pt; font-weight: 800; line-height: 1.05; }
  .stat small { margin-left: 0.4mm; font-size: 9pt; font-weight: 600; color: #c9e4d6; }
  .meter { display: block; width: 100%; height: 1mm; margin-top: 0.8mm; border-radius: 99px; background: rgba(255,255,255,0.18); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: 99px; }
  .meter .high { background: #34d399; } .meter .mid { background: #fbbf24; } .meter .low { background: #f87171; }
  .cols, .row { display: grid; grid-template-columns: 6.5mm minmax(0, 1fr) minmax(0, 1fr) 9mm; column-gap: 3.2mm; }
  .cols { padding: 0 2.6mm 1mm; border-bottom: 0.5mm solid #0f3023; font-size: 7.5pt; font-weight: 700; color: #4b5563; }
  .cols span:last-child { text-align: right; }
  .rows { padding: 0; list-style: none; }
  .row { row-gap: 1mm; padding: 2.1mm 2.6mm; border-bottom: 0.25mm solid #e3e8e5; break-inside: avoid; }
  .row:nth-child(even) { background: #f6faf8; }
  .no { font-family: 'Outfit', sans-serif; font-size: 11pt; font-weight: 800; color: #9ca3af; line-height: 1.3; }
  .row.ok .no { color: #10b981; }
  .mine { display: flex; flex-direction: column; gap: 0.5mm; min-width: 0; }
  .src { font-size: 8.5pt; color: #4b5563; }
  .ans { font-size: 10pt; font-weight: 500; color: #111827; }
  .blank { color: #9ca3af; font-weight: 400; }
  .right { min-width: 0; padding-left: 2.8mm; border-left: 0.6mm solid #10b981; }
  .row.ok .right { border-left-color: #a7f3d0; }
  .fix { font-size: 10pt; font-weight: 700; color: #065f46; }
  .fix.none { color: #9ca3af; font-weight: 400; }
  .pass { display: inline-block; padding: 0.3mm 2.2mm; border-radius: 99px; background: #d1fae5; color: #047857; font-size: 9pt; font-weight: 700; }
  .src, .ans, .fix { text-wrap: balance; }
  .pts { font-family: 'Outfit', sans-serif; font-size: 13pt; font-weight: 800; line-height: 1.2; text-align: right; }
  .pts.high, footer .high { color: #047857; } .pts.mid, footer .mid { color: #b45309; } .pts.low, footer .low { color: #b91c1c; }
  .why { grid-column: 2 / 4; font-size: 8.5pt; line-height: 1.45; color: #374151; text-wrap: pretty; }
  footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; margin-top: auto; padding-top: 2mm; border-top: 0.25mm solid #d6dfda; font-size: 7.5pt; color: #6b7280; }
  footer b { color: #1b4b36; }
  footer em { font-style: normal; font-weight: 700; }
  .sign { display: inline-block; width: 22mm; margin-left: 1mm; border-bottom: 0.25mm solid #9ca3af; }
</style></head><body class="${set.mode}">${sheets}</body></html>`;
}

export function correctionBoardUrl(ownerId: string): string {
  return `${window.location.origin}${window.location.pathname}#/board/${ownerId}`;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

// correction-public/logic.ts의 hashPin과 같은 방식 (선생님 비번 초기화용)
export async function hashPin(salt: string, pin: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

type Row = Record<string, unknown>;

const toItems = (value: unknown): CorrectionItem[] => (Array.isArray(value) ? value : []).map(raw => {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Row;
  return {
    answer: String(item.answer ?? ''),
    corrected: String(item.corrected ?? ''),
    explanation: String(item.explanation ?? ''),
    completeness: Number(item.completeness ?? 0),
    accuracy: Number(item.accuracy ?? 0),
  };
});

const toSet = (r: Row): CorrectionSet => ({
  id: String(r.id),
  mode: r.mode === 'compose' ? 'compose' : 'translate',
  title: String(r.title ?? ''),
  sentences: Array.isArray(r.sentences) ? r.sentences.map(String) : [],
  status: r.status === 'closed' ? 'closed' : 'open',
  createdAt: String(r.created_at ?? ''),
});

const toSubmission = (r: Row): CorrectionSubmission => ({
  id: String(r.id),
  setId: String(r.set_id),
  studentId: String(r.student_id ?? ''),
  studentName: String(r.student_name ?? ''),
  items: toItems(r.items),
  completeness: Number(r.completeness ?? 0),
  accuracy: Number(r.accuracy ?? 0),
  gradingStatus: r.grading_status === 'failed' ? 'failed' : 'graded',
  published: Boolean(r.published),
  submittedAt: String(r.submitted_at ?? ''),
});

const toMode = (value: unknown): CorrectionMode => (value === 'compose' ? 'compose' : 'translate');
const toStrings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

// 로그인 시간이 지나 다시 로그인해야 할 때 던지는 에러
export class LoginRequiredError extends Error {}

async function functionError(error: unknown, data: unknown, fallback: string): Promise<never> {
  let body = data as { error?: unknown; loginRequired?: unknown } | null;
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;
  if (!(body && typeof body.error === 'string') && context instanceof Response) {
    try {
      body = await context.clone().json() as { error?: unknown; loginRequired?: unknown };
    } catch { /* fall through to the fallback message */ }
  }
  const message = body && typeof body.error === 'string' && body.error.trim() ? body.error.trim() : fallback;
  if (body?.loginRequired === true) throw new LoginRequiredError(message);
  throw new Error(message);
}

export const correctionsApi = {
  // ---- 선생님 (owner RLS) ----
  async listSets(): Promise<CorrectionSet[]> {
    const { data, error } = await supabase
      .from('growing_correction_sets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSet);
  },

  async createSet(input: { mode: CorrectionMode; title: string; sentences: string[] }): Promise<CorrectionSet> {
    const { data, error } = await supabase
      .from('growing_correction_sets')
      .insert({ mode: input.mode, title: input.title, sentences: input.sentences })
      .select('*')
      .single();
    if (error) throw error;
    return toSet(data);
  },

  async updateSet(id: string, patch: { title?: string; sentences?: string[]; status?: CorrectionSetStatus }): Promise<void> {
    const { error } = await supabase
      .from('growing_correction_sets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteSet(id: string): Promise<void> {
    const { error } = await supabase.from('growing_correction_sets').delete().eq('id', id);
    if (error) throw error;
  },

  async listSubmissions(setId: string): Promise<CorrectionSubmission[]> {
    const { data, error } = await supabase
      .from('growing_correction_submissions')
      .select('*')
      .eq('set_id', setId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSubmission);
  },

  async updateSubmission(id: string, patch: { items?: CorrectionItem[]; published?: boolean }): Promise<void> {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.items) {
      const scores = averageScores(patch.items);
      row.items = patch.items;
      row.completeness = scores.completeness;
      row.accuracy = scores.accuracy;
    }
    if (patch.published !== undefined) row.published = patch.published;
    const { error } = await supabase.from('growing_correction_submissions').update(row).eq('id', id);
    if (error) throw error;
  },

  async deleteSubmission(id: string): Promise<void> {
    const { error } = await supabase.from('growing_correction_submissions').delete().eq('id', id);
    if (error) throw error;
  },

  async regrade(submissionId: string): Promise<{ items: CorrectionItem[]; completeness: number; accuracy: number }> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'regrade', submissionId } });
    if (error || data?.error) await functionError(error, data, 'AI 첨삭을 다시 받지 못했습니다.');
    return { items: toItems(data.items), completeness: Number(data.completeness ?? 0), accuracy: Number(data.accuracy ?? 0) };
  },

  async listStudents(): Promise<CorrectionStudent[]> {
    const { data, error } = await supabase
      .from('growing_correction_students')
      .select('id, name, locked_until, created_at')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(r => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      locked: Boolean(r.locked_until && new Date(String(r.locked_until)).getTime() > Date.now()),
      createdAt: String(r.created_at ?? ''),
    }));
  },

  async resetStudentPin(id: string, pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error('비번은 숫자 4자리예요.');
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const { error } = await supabase
      .from('growing_correction_students')
      .update({ pin_salt: salt, pin_hash: await hashPin(salt, pin), failed_attempts: 0, locked_until: null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteStudent(id: string): Promise<void> {
    const { error } = await supabase.from('growing_correction_students').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- 학생 게시판 (무로그인) ----
  async publicBoard(ownerId: string): Promise<BoardSet[]> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'board', ownerId } });
    if (error || data?.error) await functionError(error, data, '게시판을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return (Array.isArray(data.sets) ? data.sets as Row[] : []).map(set => ({
      id: String(set.id),
      title: String(set.title ?? ''),
      mode: toMode(set.mode),
      sentenceCount: Number(set.sentenceCount ?? 0),
      createdAt: String(set.createdAt ?? ''),
    }));
  },

  async publicGetSet(ownerId: string, setId: string): Promise<PublicCorrectionSet> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'get_set', ownerId, setId } });
    if (error || data?.error) await functionError(error, data, '과제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const set = data.set as Row;
    return { id: String(set.id), title: String(set.title ?? ''), mode: toMode(set.mode), sentences: toStrings(set.sentences) };
  },

  async publicLogin(ownerId: string, name: string, pin: string, register = false): Promise<LoginResult> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'login', ownerId, name, pin, register } });
    if (error || data?.error) await functionError(error, data, '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    if (data.needsRegister) return { needsRegister: true };
    return { needsRegister: false, token: String(data.token), name: String(data.name), registered: Boolean(data.registered) };
  },

  async publicMySubmission(token: string, setId: string): Promise<{ answers: string[]; published: boolean } | null> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'my_submission', token, setId } });
    if (error || data?.error) await functionError(error, data, '이전 답안을 불러오지 못했습니다.');
    if (!data.submission) return null;
    return { answers: toStrings(data.submission.answers), published: Boolean(data.submission.published) };
  },

  async publicSubmit(token: string, setId: string, answers: string[]): Promise<{ resubmitted: boolean }> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'submit', token, setId, answers } });
    if (error || data?.error) await functionError(error, data, '제출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return { resubmitted: Boolean(data.resubmitted) };
  },

  async publicMyList(token: string): Promise<MySubmission[]> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'my_list', token } });
    if (error || data?.error) await functionError(error, data, '내 제출을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return (Array.isArray(data.submissions) ? data.submissions as Row[] : []).map(item => ({
      setId: String(item.setId),
      title: String(item.title ?? ''),
      mode: toMode(item.mode),
      sentences: toStrings(item.sentences),
      answers: toStrings(item.answers),
      submittedAt: String(item.submittedAt ?? ''),
      published: Boolean(item.published),
      completeness: item.published ? Number(item.completeness ?? 0) : undefined,
      accuracy: item.published ? Number(item.accuracy ?? 0) : undefined,
      items: item.published ? toItems(item.items) : undefined,
    }));
  },
};
