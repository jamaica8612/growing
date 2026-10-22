import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import { isPlainObject, normalizeVerificationSecret, readJsonBody } from '../exam-public/security.ts';
import { createResponse, openAIConfig, outputText } from '../_shared/openai.ts';
import {
  LOGIN_LOCK_MS,
  MAX_FAILED_LOGINS,
  MAX_SENTENCES,
  buildGradePrompt,
  constantTimeEqual,
  hashPin,
  isCorrectionMode,
  isUuid,
  isValidPin,
  makePinSalt,
  normalizeName,
  parseGradeResult,
  sentenceList,
  signSession,
  summarize,
  ungradedItems,
  validateAnswers,
  verifySession,
  type CorrectionItem,
  type CorrectionMode,
  type SessionClaims,
} from './logic.ts';

// 해석/영작 첨삭 게시판 — 학생은 로그인 없이 게시판 링크(#/board/<선생님 id>)로 들어와
// 이름 + 4자리 비번으로 본인 확인 후 제출한다. 첨삭은 선생님이 공개한 뒤에만 학생에게 보인다.
// regrade만 선생님 로그인(JWT)이 필요하다.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACTIONS = ['board', 'get_set', 'login', 'my_submission', 'submit', 'my_list', 'regrade'] as const;
const GRADE_MAX_OUTPUT_TOKENS = 12_000;
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
// 학원 와이파이 하나로 반 전체가 제출하므로 넉넉하게 둔다.
const SUBMIT_LIMIT = 60;

interface Payload {
  action?: typeof ACTIONS[number];
  ownerId?: unknown;
  setId?: unknown;
  name?: unknown;
  pin?: unknown;
  register?: unknown;
  token?: unknown;
  answers?: unknown;
  submissionId?: unknown;
}

type Row = Record<string, unknown>;

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

function takeSubmitAttempt(req: Request): boolean {
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    ?? 'unknown';
  // 새 이름을 계속 만들어 AI 비용을 쓰는 걸 막으려고 학생이 아니라 IP 기준으로 센다.
  const key = ip;
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

async function loadOpenSet(supabase: SupabaseClient, ownerId: string, setId: unknown): Promise<Row | Response> {
  if (!isUuid(setId)) return jsonResponse({ error: '과제를 찾을 수 없습니다.' }, 404);
  const { data: set, error } = await supabase
    .from('growing_correction_sets')
    .select('id, owner_id, title, mode, sentences, status')
    .eq('id', setId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) return internalError(error);
  if (!set) return jsonResponse({ error: '과제를 찾을 수 없습니다.' }, 404);
  if (set.status !== 'open') return jsonResponse({ error: '제출이 마감된 과제입니다.' }, 403);
  return set;
}

function answersOf(items: unknown, count: number): string[] {
  const list = Array.isArray(items) ? items as Partial<CorrectionItem>[] : [];
  return Array.from({ length: count }, (_, index) => typeof list[index]?.answer === 'string' ? String(list[index]?.answer) : '');
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

  if (payload.action === 'regrade') return regrade(req, supabase, payload);

  // 학생 로그인 토큰 서명용. 시험 응시 확인과 같은 시크릿을 쓴다.
  const secret = normalizeVerificationSecret(Deno.env.get('EXAM_VERIFICATION_SECRET'));
  if (!secret) {
    console.error('EXAM_VERIFICATION_SECRET must be configured with at least 32 characters');
    return jsonResponse({ error: '게시판을 사용할 수 없습니다. 선생님에게 문의해 주세요.' }, 503);
  }

  if (payload.action === 'board') {
    if (!isUuid(payload.ownerId)) return jsonResponse({ error: '게시판 주소를 확인해 주세요.' }, 400);
    const { data, error } = await supabase
      .from('growing_correction_sets')
      .select('id, title, mode, sentences, created_at')
      .eq('owner_id', payload.ownerId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return internalError(error);
    return jsonResponse({
      sets: (data ?? []).map(set => ({
        id: set.id,
        title: set.title,
        mode: set.mode,
        sentenceCount: sentenceList(set.sentences).length,
        createdAt: set.created_at,
      })),
    });
  }

  if (payload.action === 'get_set') {
    if (!isUuid(payload.ownerId)) return jsonResponse({ error: '게시판 주소를 확인해 주세요.' }, 400);
    const set = await loadOpenSet(supabase, payload.ownerId, payload.setId);
    if (set instanceof Response) return set;
    return jsonResponse({ set: { id: set.id, title: set.title, mode: set.mode, sentences: sentenceList(set.sentences) } });
  }

  if (payload.action === 'login') {
    if (!isUuid(payload.ownerId)) return jsonResponse({ error: '게시판 주소를 확인해 주세요.' }, 400);
    const ownerId = payload.ownerId;
    const name = normalizeName(payload.name);
    if (!name) return jsonResponse({ error: '이름을 20자 이내로 적어 주세요.' }, 400);
    if (!isValidPin(payload.pin)) return jsonResponse({ error: '비번은 숫자 4자리예요.' }, 400);
    const pin = payload.pin;

    const { data: student, error } = await supabase
      .from('growing_correction_students')
      .select('id, name, pin_salt, pin_hash, failed_attempts, locked_until')
      .eq('owner_id', ownerId)
      .eq('name', name)
      .maybeSingle();
    if (error) return internalError(error);

    if (!student) {
      // 처음 온 학생 — 앱에서 "이 이름과 비번으로 등록할까요?" 확인을 받은 뒤 register=true로 다시 부른다.
      if (payload.register !== true) return jsonResponse({ needsRegister: true });
      const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(ownerId);
      if (ownerError || !owner.user) return jsonResponse({ error: '게시판 주소를 확인해 주세요.' }, 404);
      const salt = makePinSalt();
      const { data: created, error: createError } = await supabase
        .from('growing_correction_students')
        .insert({ owner_id: ownerId, name, pin_salt: salt, pin_hash: await hashPin(salt, pin) })
        .select('id, name')
        .single();
      if (createError) {
        if (createError.code === '23505') return jsonResponse({ error: '이미 등록된 이름이에요. 다시 로그인해 주세요.' }, 409);
        return internalError(createError);
      }
      return jsonResponse({ token: await signSession(secret, { ownerId, studentId: created.id, name: created.name }), name: created.name, registered: true });
    }

    if (student.locked_until && new Date(student.locked_until).getTime() > Date.now()) {
      return jsonResponse({ error: '비번을 여러 번 틀렸어요. 10분 뒤에 다시 하거나 선생님께 말해 주세요.' }, 429);
    }
    const ok = constantTimeEqual(await hashPin(String(student.pin_salt), pin), String(student.pin_hash));
    if (!ok) {
      const failed = Number(student.failed_attempts ?? 0) + 1;
      const locked = failed >= MAX_FAILED_LOGINS;
      await supabase
        .from('growing_correction_students')
        .update({
          failed_attempts: locked ? 0 : failed,
          locked_until: locked ? new Date(Date.now() + LOGIN_LOCK_MS).toISOString() : null,
        })
        .eq('id', student.id);
      return jsonResponse({
        error: locked
          ? '비번을 여러 번 틀렸어요. 10분 뒤에 다시 하거나 선생님께 말해 주세요.'
          : `비번이 맞지 않아요. (${failed}/${MAX_FAILED_LOGINS}) 같은 이름의 다른 학생이면 이름 뒤에 숫자를 붙여 주세요.`,
      }, 401);
    }
    if (Number(student.failed_attempts ?? 0) > 0 || student.locked_until) {
      await supabase.from('growing_correction_students').update({ failed_attempts: 0, locked_until: null }).eq('id', student.id);
    }
    return jsonResponse({ token: await signSession(secret, { ownerId, studentId: String(student.id), name: String(student.name) }), name: student.name });
  }

  // 여기부터는 학생 로그인 토큰 필요
  const claims = await verifySession(secret, payload.token);
  if (!claims) return jsonResponse({ error: '로그인 시간이 지났어요. 이름과 비번을 다시 넣어 주세요.', loginRequired: true }, 401);
  const { data: studentRow, error: studentError } = await supabase
    .from('growing_correction_students')
    .select('id')
    .eq('id', claims.studentId)
    .eq('owner_id', claims.ownerId)
    .maybeSingle();
  if (studentError) return internalError(studentError);
  if (!studentRow) return jsonResponse({ error: '학생 정보를 찾을 수 없어요. 다시 로그인해 주세요.', loginRequired: true }, 401);

  if (payload.action === 'my_submission') return mySubmission(supabase, claims, payload.setId);
  if (payload.action === 'submit') return submit(req, supabase, claims, payload);
  return myList(supabase, claims);
});

async function mySubmission(supabase: SupabaseClient, claims: SessionClaims, setId: unknown): Promise<Response> {
  const set = await loadOpenSet(supabase, claims.ownerId, setId);
  if (set instanceof Response) return set;
  const { data, error } = await supabase
    .from('growing_correction_submissions')
    .select('items, published')
    .eq('set_id', set.id)
    .eq('student_id', claims.studentId)
    .maybeSingle();
  if (error) return internalError(error);
  if (!data) return jsonResponse({ submission: null });
  return jsonResponse({ submission: { answers: answersOf(data.items, sentenceList(set.sentences).length), published: Boolean(data.published) } });
}

async function submit(req: Request, supabase: SupabaseClient, claims: SessionClaims, payload: Payload): Promise<Response> {
  const set = await loadOpenSet(supabase, claims.ownerId, payload.setId);
  if (set instanceof Response) return set;
  if (!isCorrectionMode(set.mode)) return internalError(new Error(`invalid mode ${set.mode}`));
  if (!takeSubmitAttempt(req)) {
    return jsonResponse({ error: '제출이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
  }

  const sentences = sentenceList(set.sentences).slice(0, MAX_SENTENCES);
  const answers = validateAnswers(payload.answers, sentences.length);
  if (!answers) return jsonResponse({ error: '답안 형식을 확인해 주세요. (문장당 1,000자 이내)' }, 400);
  if (answers.every(answer => answer === '')) return jsonResponse({ error: '한 문장 이상 적어 주세요.' }, 400);

  const { data: existing, error: existingError } = await supabase
    .from('growing_correction_submissions')
    .select('id, published')
    .eq('set_id', set.id)
    .eq('student_id', claims.studentId)
    .maybeSingle();
  if (existingError) return internalError(existingError);
  if (existing?.published) return jsonResponse({ error: '선생님이 이미 첨삭을 공개해서 다시 낼 수 없어요. ‘내 제출’에서 확인해 주세요.' }, 409);

  const graded = await gradeWithAi(set.mode, sentences, answers);
  const items = graded ?? ungradedItems(answers);
  const scores = summarize(items);
  const row = {
    items,
    completeness: scores.completeness,
    accuracy: scores.accuracy,
    grading_status: graded ? 'graded' : 'failed',
    student_name: claims.name,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from('growing_correction_submissions').update(row).eq('id', existing.id).eq('published', false)
    : await supabase.from('growing_correction_submissions').insert({
      ...row,
      owner_id: claims.ownerId,
      set_id: set.id,
      student_id: claims.studentId,
      published: false,
    });
  if (error) return internalError(error, '제출을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return jsonResponse({ ok: true, resubmitted: Boolean(existing) });
}

async function myList(supabase: SupabaseClient, claims: SessionClaims): Promise<Response> {
  const { data: submissions, error } = await supabase
    .from('growing_correction_submissions')
    .select('set_id, items, completeness, accuracy, published, submitted_at')
    .eq('owner_id', claims.ownerId)
    .eq('student_id', claims.studentId)
    .order('submitted_at', { ascending: false })
    .limit(200);
  if (error) return internalError(error);
  const setIds = [...new Set((submissions ?? []).map(item => String(item.set_id)))];
  const setsRes = setIds.length > 0
    ? await supabase.from('growing_correction_sets').select('id, title, mode, sentences').eq('owner_id', claims.ownerId).in('id', setIds)
    : { data: [], error: null };
  if (setsRes.error) return internalError(setsRes.error);
  const setsById = new Map((setsRes.data ?? []).map(set => [String(set.id), set]));

  return jsonResponse({
    name: claims.name,
    submissions: (submissions ?? []).flatMap(item => {
      const set = setsById.get(String(item.set_id));
      if (!set) return [];
      const sentences = sentenceList(set.sentences);
      const base = {
        setId: set.id,
        title: set.title,
        mode: set.mode,
        sentences,
        submittedAt: item.submitted_at,
        published: Boolean(item.published),
      };
      // 공개 전에는 자기 답만 보여 주고 AI 초안은 숨긴다.
      if (!item.published) return [{ ...base, answers: answersOf(item.items, sentences.length) }];
      return [{ ...base, answers: answersOf(item.items, sentences.length), completeness: item.completeness, accuracy: item.accuracy, items: item.items }];
    }),
  });
}

// regrade — 선생님 로그인 필요. 학생 답은 그대로 두고 AI 첨삭만 다시 받는다.
async function regrade(req: Request, supabase: SupabaseClient, payload: Payload): Promise<Response> {
  const tokenMatch = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  const { data: userData, error: userError } = await supabase.auth.getUser(tokenMatch[1]);
  if (userError || !userData.user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  if (!isUuid(payload.submissionId)) return jsonResponse({ error: '제출을 찾을 수 없습니다.' }, 404);
  const { data: submission, error: submissionError } = await supabase
    .from('growing_correction_submissions')
    .select('id, set_id, items')
    .eq('id', payload.submissionId)
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
  const graded = await gradeWithAi(set.mode, sentences, answersOf(submission.items, sentences.length));
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
}
