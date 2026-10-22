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

const printDate = (value?: string) => {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date);
};

// 첨삭 결과 인쇄용 A4 문서. 학생 한 명이 한 블록이고, 블록이 이어져 한 장에 여러 명이 들어간다.
export function buildCorrectionPrintHtml(
  set: { title: string; mode: CorrectionMode; sentences: string[] },
  submissions: { studentName: string; items: CorrectionItem[]; submittedAt?: string; published?: boolean }[],
): string {
  const label = MODE_LABELS[set.mode];
  const blocks = submissions.map(submission => {
    const scores = averageScores(submission.items);
    const rows = set.sentences.map((sentence, index) => {
      const item = submission.items[index];
      const answer = item?.answer ?? '';
      const corrected = item?.corrected ?? '';
      const same = corrected !== '' && corrected.trim() === answer.trim();
      const fix = same ? '<span class="ok">✓ 정답</span>' : corrected ? `<b>${escapeHtml(corrected)}</b>` : '';
      const note = item?.explanation ? `<div class="note">${escapeHtml(item.explanation)}</div>` : '';
      return `<tr><td class="n">${index + 1}</td><td>${escapeHtml(sentence)}</td>`
        + `<td>${answer ? escapeHtml(answer) : '<span class="blank">(빈칸)</span>'}</td>`
        + `<td>${fix}${note}</td><td class="s">${item?.completeness ?? 0}<br>${item?.accuracy ?? 0}</td></tr>`;
    }).join('');
    const meta = [printDate(submission.submittedAt), submission.published === false ? '검토 전' : ''].filter(Boolean).join(' · ');
    return `<section><header><b>${escapeHtml(submission.studentName)}</b><span>${escapeHtml(set.title)} (${label})${meta ? ` · ${escapeHtml(meta)}` : ''}</span>`
      + `<span class="score">완성도 ${scores.completeness}% · 정확도 ${scores.accuracy}%</span></header>`
      + `<table><colgroup><col style="width:4%"><col style="width:27%"><col style="width:27%"><col style="width:36%"><col style="width:6%"></colgroup>`
      + `<thead><tr><th>#</th><th>원문</th><th>학생 답</th><th>첨삭 · 설명</th><th>완성<br>정확</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(`${label} 첨삭 - ${set.title}`)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Pretendard', 'Noto Sans KR', sans-serif; font-size: 8.5pt; line-height: 1.35; color: #111827; }
  section { margin: 0 0 5mm; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 3mm; padding: 0 0 1mm; border-bottom: 1.5px solid #0f3023; break-after: avoid; }
  header b { font-size: 11pt; color: #0f3023; }
  header span { color: #4b5563; }
  header .score { margin-left: auto; color: #0f3023; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 0.8mm 1.2mm; background: #eef5f1; color: #374151; font-size: 7.5pt; font-weight: 700; text-align: left; }
  td { padding: 1mm 1.2mm; border-bottom: 0.5px solid #d1d5db; vertical-align: top; word-break: keep-all; overflow-wrap: anywhere; }
  tr { break-inside: avoid; }
  .n, .s { color: #6b7280; text-align: center; }
  .s { font-size: 7.5pt; }
  .note { margin-top: 0.5mm; color: #4b5563; font-size: 7.5pt; }
  .ok { color: #15803d; font-weight: 700; }
  .blank { color: #9ca3af; }
</style></head><body>${blocks}<script>window.onload = function () { window.print(); };</script></body></html>`;
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
