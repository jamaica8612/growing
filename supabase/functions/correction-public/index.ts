import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import { isPlainObject, readJsonBody } from '../exam-public/security.ts';
import { createResponse, openAIConfig, outputText } from '../_shared/openai.ts';
import {
  MAX_SENTENCES,
  buildGradePrompt,
  isCorrectionMode,
  isValidCode,
  isValidResultToken,
  makeResultToken,
  normalizeName,
  parseGradeResult,
  sentenceList,
  summarize,
  ungradedItems,
  validateAnswers,
  type CorrectionItem,
  type CorrectionMode,
} from './logic.ts';

// 해석/영작 첨삭 — 학생은 로그인 없이 응시코드로 제출하고(이름만 입력),
// 결과는 선생님이 공개한 뒤에만 결과 링크로 볼 수 있다.
// regrade만 선생님 로그인(JWT)이 필요하다.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACTIONS = ['get_set', 'submit', 'get_result', 'regrade'] as const;
const GRADE_MAX_OUTPUT_TOKENS = 12_000;
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
// 학원 와이파이 하나로 반 전체가 제출하므로 넉넉하게 둔다.
const SUBMIT_LIMIT = 60;

interface Payload {
  action?: typeof ACTIONS[number];
  code?: unknown;
  name?: unknown;
  answers?: unknown;
  token?: unknown;
  submissionId?: unknown;
}

const submitAttempts = new Map<string, { count: number; resetAt: number }>();

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function internalError(error: unknown, message = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'): Response {
  console.error(error);
  return jsonResponse({ error: message }, 500);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function takeSubmitAttempt(req: Request, code: string): boolean {
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    ?? 'unknown';
  const key = `${ip}:${code}`;
  const now = Date.now();
  if (submitAttempts.size >= 10_000) {
    for (const [attemptKey, attempt] of submitAttempts) {
      if (attempt.resetAt <= now) submitAttempts.delete(attemptKey);
    }
  }
  const current = submitAttempts.get(key);
  if (!current || current.resetAt <= now) {
    submitAttempts.set(key, { count: 1, resetAt: now + SUBMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= SUBMIT_LIMIT) return false;
  current.count += 1;
  return true;
}

// AI 첨삭. 실패하면 null — 제출은 저장하고 선생님이 다시 첨삭하거나 직접 채운다.
async function gradeWithAi(mode: CorrectionMode, sentences: string[], answers: string[]): Promise<CorrectionItem[] | null> {
  const { apiKey, model } = openAIConfig();
  if (!apiKey) return null;
  try {
    const response = await createResponse(apiKey, {
      model,
      input: buildGradePrompt(mode, sentences, answers),
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } },
      max_output_tokens: GRADE_MAX_OUTPUT_TOKENS,
    });
    return parseGradeResult(outputText(response), answers);
  } catch (error) {
    console.warn('AI correction failed', error);
    return null;
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const payload = isPlainObject(body.value) ? body.value as Payload : null;
  if (!payload?.action || !ACTIONS.includes(payload.action)) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === 'get_set') {
    const code = cleanText(payload.code).toUpperCase();
    if (!isValidCode(code)) return jsonResponse({ error: '6자리 코드를 확인해 주세요.' }, 400);
    const { data: set, error } = await supabase
      .from('growing_correction_sets')
      .select('title, mode, sentences, status')
      .eq('short_code', code)
      .maybeSingle();
    if (error) return internalError(error);
    if (!set) return jsonResponse({ error: '코드에 해당하는 과제를 찾을 수 없습니다.' }, 404);
    if (set.status !== 'open') return jsonResponse({ error: '제출이 마감된 과제입니다.' }, 403);
    return jsonResponse({ set: { title: set.title, mode: set.mode, sentences: sentenceList(set.sentences) } });
  }

  if (payload.action === 'submit') {
    const code = cleanText(payload.code).toUpperCase();
    if (!isValidCode(code)) return jsonResponse({ error: '6자리 코드를 확인해 주세요.' }, 400);
    const name = normalizeName(payload.name);
    if (!name) return jsonResponse({ error: '이름을 20자 이내로 적어 주세요.' }, 400);
    if (!takeSubmitAttempt(req, code)) {
      return jsonResponse({ error: '제출이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    }

    const { data: set, error: setError } = await supabase
      .from('growing_correction_sets')
      .select('id, owner_id, mode, sentences, status')
      .eq('short_code', code)
      .maybeSingle();
    if (setError) return internalError(setError);
    if (!set) return jsonResponse({ error: '코드에 해당하는 과제를 찾을 수 없습니다.' }, 404);
    if (set.status !== 'open') return jsonResponse({ error: '제출이 마감된 과제입니다.' }, 403);
    if (!isCorrectionMode(set.mode)) return internalError(new Error(`invalid mode ${set.mode}`));

    const sentences = sentenceList(set.sentences).slice(0, MAX_SENTENCES);
    const answers = validateAnswers(payload.answers, sentences.length);
    if (!answers) return jsonResponse({ error: '답안 형식을 확인해 주세요. (문장당 1,000자 이내)' }, 400);
    if (answers.every(answer => answer === '')) return jsonResponse({ error: '한 문장 이상 적어 주세요.' }, 400);

    const graded = await gradeWithAi(set.mode, sentences, answers);
    const items = graded ?? ungradedItems(answers);
    const scores = summarize(items);
    const resultToken = makeResultToken();
    const { error: insertError } = await supabase.from('growing_correction_submissions').insert({
      owner_id: set.owner_id,
      set_id: set.id,
      student_name: name,
      items,
      completeness: scores.completeness,
      accuracy: scores.accuracy,
      grading_status: graded ? 'graded' : 'failed',
      published: false,
      result_token: resultToken,
    });
    if (insertError) return internalError(insertError, '제출을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return jsonResponse({ ok: true, resultToken });
  }

  if (payload.action === 'get_result') {
    const token = cleanText(payload.token);
    if (!isValidResultToken(token)) return jsonResponse({ error: '결과 링크를 확인해 주세요.' }, 400);
    const { data: submission, error } = await supabase
      .from('growing_correction_submissions')
      .select('set_id, owner_id, student_name, items, completeness, accuracy, published, submitted_at')
      .eq('result_token', token)
      .maybeSingle();
    if (error) return internalError(error);
    if (!submission) return jsonResponse({ error: '결과를 찾을 수 없습니다.' }, 404);
    const { data: set, error: setError } = await supabase
      .from('growing_correction_sets')
      .select('title, mode, sentences')
      .eq('id', submission.set_id)
      .eq('owner_id', submission.owner_id)
      .single();
    if (setError) return internalError(setError);

    const base = {
      set: { title: set.title, mode: set.mode, sentences: sentenceList(set.sentences) },
      studentName: submission.student_name,
      submittedAt: submission.submitted_at,
      published: Boolean(submission.published),
    };
    if (!submission.published) return jsonResponse(base);
    return jsonResponse({
      ...base,
      completeness: submission.completeness,
      accuracy: submission.accuracy,
      items: submission.items,
    });
  }

  // regrade — 선생님 로그인 필요. 학생 답은 그대로 두고 AI 첨삭만 다시 받는다.
  const tokenMatch = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  const { data: userData, error: userError } = await supabase.auth.getUser(tokenMatch[1]);
  if (userError || !userData.user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const submissionId = cleanText(payload.submissionId);
  const { data: submission, error: submissionError } = await supabase
    .from('growing_correction_submissions')
    .select('id, set_id, owner_id, items')
    .eq('id', submissionId)
    .eq('owner_id', userData.user.id)
    .maybeSingle();
  if (submissionError) return internalError(submissionError);
  if (!submission) return jsonResponse({ error: '제출을 찾을 수 없습니다.' }, 404);
  const { data: set, error: setError } = await supabase
    .from('growing_correction_sets')
    .select('mode, sentences')
    .eq('id', submission.set_id)
    .eq('owner_id', userData.user.id)
    .single();
  if (setError) return internalError(setError);
  if (!isCorrectionMode(set.mode)) return internalError(new Error(`invalid mode ${set.mode}`));

  const sentences = sentenceList(set.sentences);
  const previous = Array.isArray(submission.items) ? submission.items as Partial<CorrectionItem>[] : [];
  const answers = sentences.map((_, index) => typeof previous[index]?.answer === 'string' ? String(previous[index]?.answer) : '');
  const graded = await gradeWithAi(set.mode, sentences, answers);
  if (!graded) return jsonResponse({ error: 'AI 첨삭에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
  const scores = summarize(graded);
  const { error: updateError } = await supabase
    .from('growing_correction_submissions')
    .update({
      items: graded,
      completeness: scores.completeness,
      accuracy: scores.accuracy,
      grading_status: 'graded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submission.id)
    .eq('owner_id', userData.user.id);
  if (updateError) return internalError(updateError);
  return jsonResponse({ items: graded, ...scores });
});
