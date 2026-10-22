import { supabase } from './supabase';
import { makeShortCode } from './exams';

// ============================================================================
// 해석/영작 첨삭
//   테이블  growing_correction_sets / growing_correction_submissions (owner RLS)
//   엣지함수 correction-public (무로그인 — 학생 제출·AI 첨삭·결과, regrade만 JWT)
// 학생 제출은 선생님이 공개(published)하기 전까지 학생에게 보이지 않는다.
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
  shortCode: string;
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
  studentName: string;
  items: CorrectionItem[];
  completeness: number;
  accuracy: number;
  gradingStatus: 'graded' | 'failed';
  published: boolean;
  resultToken: string;
  submittedAt: string;
}

export interface PublicCorrectionSet {
  title: string;
  mode: CorrectionMode;
  sentences: string[];
}

export interface PublicCorrectionResult {
  set: PublicCorrectionSet;
  studentName: string;
  submittedAt: string;
  published: boolean;
  completeness?: number;
  accuracy?: number;
  items?: CorrectionItem[];
}

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

export function correctionJoinUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/c/${code}`;
}

export function correctionResultUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/c-result/${token}`;
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
  shortCode: String(r.short_code ?? ''),
  createdAt: String(r.created_at ?? ''),
});

const toSubmission = (r: Row): CorrectionSubmission => ({
  id: String(r.id),
  setId: String(r.set_id),
  studentName: String(r.student_name ?? ''),
  items: toItems(r.items),
  completeness: Number(r.completeness ?? 0),
  accuracy: Number(r.accuracy ?? 0),
  gradingStatus: r.grading_status === 'failed' ? 'failed' : 'graded',
  published: Boolean(r.published),
  resultToken: String(r.result_token ?? ''),
  submittedAt: String(r.submitted_at ?? ''),
});

async function functionError(error: unknown, data: unknown, fallback: string): Promise<never> {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error) {
    throw new Error(data.error);
  }
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) throw new Error(body.error.trim());
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
    }
  }
  throw new Error(fallback);
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
    // 코드 충돌(unique) 시 몇 번 다시 시도한다.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('growing_correction_sets')
        .insert({ mode: input.mode, title: input.title, sentences: input.sentences, short_code: makeShortCode() })
        .select('*')
        .single();
      if (!error) return toSet(data);
      if (error.code !== '23505') throw error;
    }
    throw new Error('코드를 만들지 못했습니다. 다시 시도해 주세요.');
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

  // ---- 학생 (무로그인) ----
  async publicGetSet(code: string): Promise<PublicCorrectionSet> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'get_set', code } });
    if (error || data?.error) await functionError(error, data, '과제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const set = data.set as Row;
    return {
      title: String(set.title ?? ''),
      mode: set.mode === 'compose' ? 'compose' : 'translate',
      sentences: Array.isArray(set.sentences) ? set.sentences.map(String) : [],
    };
  },

  async publicSubmit(code: string, name: string, answers: string[]): Promise<{ resultToken: string }> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'submit', code, name, answers } });
    if (error || data?.error) await functionError(error, data, '제출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return { resultToken: String(data.resultToken) };
  },

  async publicGetResult(token: string): Promise<PublicCorrectionResult> {
    const { data, error } = await supabase.functions.invoke('correction-public', { body: { action: 'get_result', token } });
    if (error || data?.error) await functionError(error, data, '결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const set = data.set as Row;
    return {
      set: {
        title: String(set.title ?? ''),
        mode: set.mode === 'compose' ? 'compose' : 'translate',
        sentences: Array.isArray(set.sentences) ? set.sentences.map(String) : [],
      },
      studentName: String(data.studentName ?? ''),
      submittedAt: String(data.submittedAt ?? ''),
      published: Boolean(data.published),
      completeness: data.published ? Number(data.completeness ?? 0) : undefined,
      accuracy: data.published ? Number(data.accuracy ?? 0) : undefined,
      items: data.published ? toItems(data.items) : undefined,
    };
  },
};
