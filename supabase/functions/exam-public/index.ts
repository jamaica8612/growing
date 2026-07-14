import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import {
  MAX_ANSWER_COUNT,
  VERIFICATION_TTL_SECONDS,
  isPlainObject,
  isValidCode,
  isValidResultToken,
  isValidStudentKey,
  isValidVerificationTokenShape,
  makeStudentKey,
  maskStudentName,
  normalizeVerificationSecret,
  phoneMatchesLast4,
  readJsonBody,
  signVerificationToken,
  validatedAnswers,
  verifyVerificationToken,
  type AnswerValue,
} from './security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Row = Record<string, unknown>;
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const PUBLIC_ACTIONS = ['get_exam', 'verify_student', 'submit', 'get_result'] as const;
const VERIFY_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const VERIFY_ATTEMPT_LIMIT = 5;

interface VerifyAttempt {
  count: number;
  resetAt: number;
}

interface PublicPayload {
  action?: 'get_exam' | 'verify_student' | 'submit' | 'get_result';
  code?: string;
  token?: string;
  studentKey?: string;
  contactLast4?: string;
  verificationToken?: string;
  answers?: Record<string, AnswerValue>;
}

const verifyAttempts = new Map<string, VerifyAttempt>();

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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function internalError(error: unknown, message = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'): Response {
  console.error(error);
  return jsonResponse({ error: message }, 500);
}

function verificationSecret(): string | null {
  return normalizeVerificationSecret(Deno.env.get('EXAM_VERIFICATION_SECRET'));
}

function verificationAttemptKey(req: Request, code: string, studentKey: string): string {
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    ?? 'unknown';
  return `${ip}:${code}:${studentKey}`;
}

function takeVerificationAttempt(key: string): boolean {
  const now = Date.now();
  if (verifyAttempts.size >= 10_000) {
    for (const [attemptKey, attempt] of verifyAttempts) {
      if (attempt.resetAt <= now || verifyAttempts.size >= 9_000) verifyAttempts.delete(attemptKey);
    }
  }
  const current = verifyAttempts.get(key);
  if (!current || current.resetAt <= now) {
    verifyAttempts.set(key, { count: 1, resetAt: now + VERIFY_ATTEMPT_WINDOW_MS });
    return true;
  }
  if (current.count >= VERIFY_ATTEMPT_LIMIT) return false;
  current.count += 1;
  return true;
}

function clearVerificationAttempts(key: string): void {
  verifyAttempts.delete(key);
}

function normalizeAnswer(value: unknown): AnswerValue {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return '';
}

interface GradeResult {
  is_correct: boolean;
  is_partial: boolean;
  gained_points: number;
  feedback: string | null;
  graded_by: 'auto' | 'ai';
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

function clampPoints(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function fallbackGradeOne(question: Row, answer: AnswerValue): GradeResult {
  const points = Number(question.points ?? 0);
  const correctAnswer = normalizeAnswer(question.answer);
  const hasChoices = Array.isArray(question.choices);
  if (hasChoices) {
    const selected = typeof answer === 'number' || (typeof answer === 'string' && answer.trim() !== '') ? Number(answer) : NaN;
    const correctIndex = typeof correctAnswer === 'number' || (typeof correctAnswer === 'string' && correctAnswer.trim() !== '') ? Number(correctAnswer) : NaN;
    const isCorrect = Number.isFinite(selected) && Number.isFinite(correctIndex) && selected === correctIndex;
    return {
      is_correct: isCorrect,
      is_partial: false,
      gained_points: isCorrect ? points : 0,
      feedback: isCorrect ? null : '정답과 보기를 다시 확인해 보세요.',
      graded_by: 'auto',
    };
  }

  const expected = String(correctAnswer).trim().toLowerCase().replace(/[.\s]+$/g, '');
  const actual = String(answer).trim().toLowerCase().replace(/[.\s]+$/g, '');
  const isCorrect = expected.length > 0 && actual === expected;
  const isPartial = !isCorrect && actual.length > 0;
  return {
    is_correct: isCorrect,
    is_partial: isPartial,
    gained_points: isCorrect ? points : isPartial ? Math.round(points * 0.5) : 0,
    feedback: isCorrect ? null : '어순, 핵심 어휘, 빠진 표현을 다시 확인해 보세요.',
    graded_by: 'auto',
  };
}

async function gradeWritingWithAi(question: Row, answer: AnswerValue): Promise<GradeResult | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const actual = String(answer).trim();
  if (!apiKey || !actual) return null;
  const points = Number(question.points ?? 0);
  const expected = String(normalizeAnswer(question.answer)).trim();
  const prompt = `
You are grading an English exam answer in Korea.
Return ONLY valid JSON:
{
  "gainedPoints": 0,
  "isCorrect": false,
  "isPartial": true,
  "feedback": "Korean one-sentence feedback for the student"
}

Rules:
- Max points: ${points}
- Grade according to the level implied by the exam question and model answer.
- Award full points only when the student's answer is meaningfully equivalent to the model answer.
- Award partial points for answers with useful correct grammar/vocabulary but missing words, wrong order, or small expression errors.
- Award 0 for random strings such as "abc", copied letters, unrelated words, or answers with no meaningful overlap with the model answer.
- Do not award more than 70% unless the answer is mostly correct.
- Award 0 for blank, unrelated, or mostly incorrect answers.
- Feedback must be short Korean and mention what to check.
- This is an AI draft grade. Be conservative.

Question:
${String(question.prompt ?? '')}

Passage:
${String(question.passage ?? '')}

Model answer:
${expected}

Student answer:
${actual}
`.trim();

  let lastError: unknown = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.15,
            responseMimeType: 'application/json',
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `Gemini ${res.status}`);
      const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('\n') ?? '';
      const parsed = JSON.parse(stripFence(text)) as { gainedPoints?: unknown; isCorrect?: unknown; isPartial?: unknown; feedback?: unknown };
      const gained = clampPoints(parsed.gainedPoints, points);
      const isCorrect = Boolean(parsed.isCorrect) || gained >= points;
      const isPartial = !isCorrect && (Boolean(parsed.isPartial) || gained > 0);
      return {
        is_correct: isCorrect,
        is_partial: isPartial,
        gained_points: isCorrect ? points : gained,
        feedback: isCorrect ? null : typeof parsed.feedback === 'string' && parsed.feedback.trim() ? parsed.feedback.trim().slice(0, 240) : '어순, 핵심 어휘, 빠진 표현을 다시 확인해 보세요.',
        graded_by: 'ai',
      };
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('AI writing grade failed; falling back to rule grade', lastError);
  return null;
}

async function gradeOne(question: Row, answer: AnswerValue): Promise<GradeResult> {
  const hasChoices = Array.isArray(question.choices);
  if (!hasChoices) {
    const aiGrade = await gradeWritingWithAi(question, answer);
    if (aiGrade) return aiGrade;
  }
  return fallbackGradeOne(question, answer);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const payload = isPlainObject(body.value) ? body.value as PublicPayload : null;

  if (!payload?.action || !PUBLIC_ACTIONS.includes(payload.action)) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  const secret = payload.action === 'get_result' ? null : verificationSecret();
  if (payload.action !== 'get_result' && !secret) {
    console.error('EXAM_VERIFICATION_SECRET must be configured with at least 32 characters');
    return jsonResponse({ error: '응시 서비스를 사용할 수 없습니다. 선생님에게 문의해 주세요.' }, 503);
  }
  const publicSecret = secret ?? '';
  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));

  if (payload.action === 'get_exam') {
    const code = cleanText(payload.code).trim().toUpperCase();
    if (!isValidCode(code)) return jsonResponse({ error: '6자리 응시코드를 확인해 주세요.' }, 400);
    const { data: exam, error: examError } = await supabase
      .from('growing_exams')
      .select('id, owner_id, class_id, status, title, target_label, topic, date, short_code')
      .eq('short_code', code)
      .maybeSingle();
    if (examError) return internalError(examError);
    if (!exam) return jsonResponse({ error: '응시코드에 해당하는 시험을 찾을 수 없습니다.' }, 404);
    if (exam.status !== 'published') return jsonResponse({ error: '아직 응시가 시작되지 않았습니다. 선생님이 배포/응시에서 시험 상태를 응시중으로 바꿔야 합니다.' }, 403);
    if (!exam.class_id) return jsonResponse({ error: '응시 명단이 설정되지 않은 시험입니다.' }, 403);

    const [questionsRes, classRes] = await Promise.all([
      supabase
        .from('growing_exam_questions')
        .select('id, order_no, type, points, source, prompt, passage, choices')
        .eq('exam_id', exam.id)
        .order('order_no'),
      exam.class_id
        ? supabase.from('growing_classes').select('student_ids').eq('id', exam.class_id).eq('owner_id', exam.owner_id).single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (questionsRes.error) return internalError(questionsRes.error);
    if (classRes.error) return internalError(classRes.error);
    if ((questionsRes.data ?? []).length === 0) return jsonResponse({ error: '아직 문항이 없는 시험입니다.' }, 422);
    if ((questionsRes.data ?? []).length > MAX_ANSWER_COUNT) return jsonResponse({ error: '응시할 수 있는 문항 수를 초과한 시험입니다.' }, 422);

    const studentIds = Array.isArray(classRes.data?.student_ids) ? classRes.data.student_ids as string[] : [];
    const studentsRes = studentIds.length > 0
      ? await supabase.from('growing_students').select('id, name, status').eq('owner_id', exam.owner_id).in('id', studentIds)
      : { data: [], error: null };
    if (studentsRes.error) return internalError(studentsRes.error);

    const studentsById = new Map((studentsRes.data ?? []).map(row => [row.id as string, row]));
    const students = (await Promise.all(studentIds.map(async (id, index) => {
      const row = studentsById.get(id);
      if (!row || row.status !== 'active') return null;
      return {
        studentKey: await makeStudentKey(publicSecret, String(exam.id), String(row.id)),
        no: index + 1,
        name: maskStudentName(row.name),
      };
    }))).filter(row => row !== null);

    return jsonResponse({
      exam: {
        title: exam.title,
        targetLabel: exam.target_label,
        topic: exam.topic,
        date: exam.date,
        shortCode: exam.short_code,
      },
      questions: questionsRes.data ?? [],
      students,
    });
  }

  if (payload.action === 'verify_student') {
    const code = cleanText(payload.code).trim().toUpperCase();
    const studentKey = cleanText(payload.studentKey).trim();
    const contactLast4 = cleanText(payload.contactLast4).replace(/\D/g, '');
    if (!isValidCode(code) || !isValidStudentKey(studentKey) || !/^\d{4}$/.test(contactLast4)) {
      return jsonResponse({ error: '이름과 연락처 뒤 4자리를 확인해 주세요.' }, 400);
    }

    const attemptKey = verificationAttemptKey(req, code, studentKey);
    if (!takeVerificationAttempt(attemptKey)) {
      return jsonResponse({ error: '확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    }

    const { data: exam, error: examError } = await supabase
      .from('growing_exams')
      .select('id, owner_id, class_id, status')
      .eq('short_code', code)
      .maybeSingle();
    if (examError) return internalError(examError);
    if (!exam || exam.status !== 'published' || !exam.class_id) {
      return jsonResponse({ error: '입력한 정보로 본인 확인을 완료할 수 없습니다.' }, 403);
    }

    const classRes = await supabase
      .from('growing_classes')
      .select('student_ids')
      .eq('id', exam.class_id)
      .eq('owner_id', exam.owner_id)
      .maybeSingle();
    if (classRes.error) return internalError(classRes.error);
    const studentIds = Array.isArray(classRes.data?.student_ids) ? classRes.data.student_ids as string[] : [];
    const studentsRes = studentIds.length > 0
      ? await supabase
        .from('growing_students')
        .select('id, name, status, contact, parent_contact')
        .eq('owner_id', exam.owner_id)
        .in('id', studentIds)
      : { data: [], error: null };
    if (studentsRes.error) return internalError(studentsRes.error);

    let student: Row | null = null;
    for (const row of studentsRes.data ?? []) {
      if (row.status !== 'active') continue;
      const candidateKey = await makeStudentKey(publicSecret, String(exam.id), String(row.id));
      if (candidateKey === studentKey) {
        student = row;
        break;
      }
    }

    const matchesContact = student
      && (phoneMatchesLast4(student.contact, contactLast4) || phoneMatchesLast4(student.parent_contact, contactLast4));
    if (!student || !matchesContact) {
      return jsonResponse({ error: '입력한 정보로 본인 확인을 완료할 수 없습니다.' }, 403);
    }

    const submissionRes = await supabase
      .from('growing_exam_submissions')
      .select('id')
      .eq('exam_id', exam.id)
      .eq('student_id', student.id)
      .eq('status', 'submitted')
      .limit(1);
    if (submissionRes.error) return internalError(submissionRes.error);
    if ((submissionRes.data ?? []).length > 0) {
      clearVerificationAttempts(attemptKey);
      return jsonResponse({ error: '이미 제출이 완료된 시험입니다.' }, 409);
    }

    clearVerificationAttempts(attemptKey);
    return jsonResponse({
      verificationToken: await signVerificationToken(publicSecret, code, studentKey),
      expiresIn: VERIFICATION_TTL_SECONDS,
    });
  }

  if (payload.action === 'submit') {
    const code = cleanText(payload.code).trim().toUpperCase();
    const verificationToken = cleanText(payload.verificationToken);
    const answers = validatedAnswers(payload.answers ?? {});
    if (!isValidCode(code) || !isValidVerificationTokenShape(verificationToken)) {
      return jsonResponse({ error: '본인 확인이 필요합니다.' }, 401);
    }
    if (!answers) return jsonResponse({ error: '답안 형식을 확인해 주세요.' }, 400);
    const claims = await verifyVerificationToken(publicSecret, verificationToken, code);
    if (!claims) {
      return jsonResponse({ error: '본인 확인 시간이 만료되었습니다. 다시 확인해 주세요.' }, 401);
    }
    const { data: exam, error: examError } = await supabase
      .from('growing_exams')
      .select('id, owner_id, class_id, status, title, target_label, topic')
      .eq('short_code', code)
      .maybeSingle();
    if (examError) return internalError(examError);
    if (!exam) return jsonResponse({ error: '응시코드에 해당하는 시험을 찾을 수 없습니다.' }, 404);
    if (exam.status !== 'published') return jsonResponse({ error: '아직 응시가 시작되지 않았습니다.' }, 403);
    if (!exam.class_id) return jsonResponse({ error: '응시 명단이 설정되지 않은 시험입니다.' }, 403);

    const [questionsRes, classRes] = await Promise.all([
      supabase.from('growing_exam_questions').select('id, order_no, points, prompt, passage, choices, answer').eq('exam_id', exam.id).order('order_no'),
      exam.class_id
        ? supabase.from('growing_classes').select('student_ids').eq('id', exam.class_id).eq('owner_id', exam.owner_id).single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (questionsRes.error || classRes.error) return internalError(questionsRes.error ?? classRes.error);
    const classStudentIds = Array.isArray(classRes.data?.student_ids) ? classRes.data.student_ids as string[] : [];
    const studentsRes = classStudentIds.length > 0
      ? await supabase
        .from('growing_students')
        .select('id, name, owner_id, status')
        .eq('owner_id', exam.owner_id)
        .in('id', classStudentIds)
      : { data: [], error: null };
    if (studentsRes.error) return internalError(studentsRes.error);
    let student: Row | null = null;
    for (const row of studentsRes.data ?? []) {
      if (row.status !== 'active') continue;
      const candidateKey = await makeStudentKey(publicSecret, String(exam.id), String(row.id));
      if (candidateKey === claims.studentKey) {
        student = row;
        break;
      }
    }
    if (!student || student.owner_id !== exam.owner_id) {
      return jsonResponse({ error: '해당 시험에 응시할 수 있는 학생만 제출할 수 있어요.' }, 403);
    }
    const studentId = String(student.id);

    const questions = questionsRes.data ?? [];
    if (questions.length === 0) return jsonResponse({ error: '아직 문항이 없는 시험입니다.' }, 422);
    if (questions.length > MAX_ANSWER_COUNT) return jsonResponse({ error: '응시할 수 있는 문항 수를 초과한 시험입니다.' }, 422);
    const questionIds = new Set(questions.map(question => String(question.id)));
    if (Object.keys(answers).some(questionId => !questionIds.has(questionId))) {
      return jsonResponse({ error: '답안 형식을 확인해 주세요.' }, 400);
    }
    const total = questions.reduce((sum, question) => sum + Number(question.points ?? 0), 0);
    const { data: submission, error: submissionError } = await supabase
      .from('growing_exam_submissions')
      .insert({
        owner_id: exam.owner_id,
        exam_id: exam.id,
        student_id: studentId,
        student_name_snapshot: student.name,
        score: 0,
        total_points: total,
        status: 'submitted',
      })
      .select('id')
      .single();
    if (submissionError) return jsonResponse({ error: '이미 제출했거나 저장 중 오류가 발생했습니다.' }, 409);

    const cleanupSubmission = async () => {
      const { error } = await supabase
        .from('growing_exam_submissions')
        .delete()
        .eq('id', submission.id)
        .eq('owner_id', exam.owner_id);
      if (error) console.error('Failed to clean up reserved exam submission', error);
    };

    let graded: { question: Row; answer: AnswerValue; grade: GradeResult }[];
    try {
      graded = await Promise.all(questions.map(async question => {
        const answer = normalizeAnswer(answers[question.id as string]);
        return { question, answer, grade: await gradeOne(question, answer) };
      }));
    } catch (error) {
      await cleanupSubmission();
      return internalError(error, '답안을 채점하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    const score = graded.reduce((sum, item) => sum + item.grade.gained_points, 0);

    const { error: gradeUpdateError } = await supabase
      .from('growing_exam_submissions')
      .update({ score, total_points: total, graded_at: new Date().toISOString() })
      .eq('id', submission.id)
      .eq('owner_id', exam.owner_id);
    if (gradeUpdateError) {
      await cleanupSubmission();
      return internalError(gradeUpdateError);
    }

    const { error: answersError } = await supabase.from('growing_exam_answers').insert(
      graded.map(item => ({
        owner_id: exam.owner_id,
        submission_id: submission.id,
        question_id: item.question.id,
        answer: item.answer,
        ...item.grade,
      }))
    );
    if (answersError) {
      await cleanupSubmission();
      return internalError(answersError);
    }

    await supabase.from('growing_counsel_logs').insert({
      owner_id: exam.owner_id,
      student_id: studentId,
      date: new Date().toISOString().slice(0, 10),
      title: `${exam.title} 결과`,
      content: `${exam.target_label} ${exam.topic}\n점수: ${score}/${total}\n온라인 시험 제출 기록입니다.`,
      type: 'test',
      score: `${score}/${total}`,
    });

    return jsonResponse({ ok: true, score, total });
  }

  if (payload.action === 'get_result') {
    const token = cleanText(payload.token).trim();
    if (!isValidResultToken(token)) return jsonResponse({ error: '결과 링크를 확인해 주세요.' }, 400);
    const { data: link, error: linkError } = await supabase
      .from('growing_exam_result_links')
      .select('id, owner_id, exam_id, submission_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (linkError) return internalError(linkError);
    if (!link) return jsonResponse({ error: '결과 링크를 찾을 수 없습니다.' }, 404);
    if (link.expires_at && new Date(link.expires_at as string).getTime() < Date.now()) {
      return jsonResponse({ error: '만료된 결과 링크입니다.' }, 410);
    }

    const [examRes, submissionRes, answersRes, questionsRes] = await Promise.all([
      supabase.from('growing_exams').select('title, target_label, topic, date').eq('id', link.exam_id).eq('owner_id', link.owner_id).single(),
      supabase.from('growing_exam_submissions').select('student_name_snapshot, score, total_points, submitted_at').eq('id', link.submission_id).eq('exam_id', link.exam_id).eq('owner_id', link.owner_id).single(),
      supabase.from('growing_exam_answers').select('question_id, answer, is_correct, is_partial, gained_points, feedback, graded_by').eq('submission_id', link.submission_id).eq('owner_id', link.owner_id),
      supabase.from('growing_exam_questions').select('id, order_no, type, points, source, prompt, passage, choices, answer, explanation').eq('exam_id', link.exam_id).eq('owner_id', link.owner_id).order('order_no'),
    ]);
    const error = examRes.error || submissionRes.error || answersRes.error || questionsRes.error;
    if (error) return internalError(error);
    await supabase.from('growing_exam_result_links').update({ viewed_at: new Date().toISOString() }).eq('id', link.id);

    const questionKeyById = new Map<string, string>();
    const publicQuestions = (questionsRes.data ?? []).map((question, index) => {
      const questionKey = `q${index + 1}`;
      questionKeyById.set(String(question.id), questionKey);
      return {
        id: questionKey,
        order_no: question.order_no,
        type: question.type,
        points: question.points,
        source: question.source,
        prompt: question.prompt,
        passage: question.passage,
        choices: question.choices,
        answer: question.answer,
        explanation: question.explanation,
      };
    });
    const publicAnswers = (answersRes.data ?? []).map(answer => {
      const questionKey = questionKeyById.get(String(answer.question_id));
      if (!questionKey) return null;
      return {
        question_id: questionKey,
        answer: answer.answer,
        is_correct: answer.is_correct,
        is_partial: answer.is_partial,
        gained_points: answer.gained_points,
        feedback: answer.feedback,
        graded_by: answer.graded_by,
      };
    }).filter(answer => answer !== null);

    return jsonResponse({
      exam: {
        title: examRes.data.title,
        target_label: examRes.data.target_label,
        topic: examRes.data.topic,
        date: examRes.data.date,
      },
      submission: {
        student_name_snapshot: submissionRes.data.student_name_snapshot,
        score: submissionRes.data.score,
        total_points: submissionRes.data.total_points,
        submitted_at: submissionRes.data.submitted_at,
      },
      questions: publicQuestions,
      answers: publicAnswers,
    });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
});
