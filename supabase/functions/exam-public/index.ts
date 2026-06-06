import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Row = Record<string, unknown>;
type AnswerValue = string | number;
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const payload = await req.json().catch(() => null) as {
    action?: 'get_exam' | 'submit' | 'get_result';
    code?: string;
    token?: string;
    studentId?: string;
    answers?: Record<string, AnswerValue>;
  } | null;

  if (!payload?.action) return jsonResponse({ error: 'Invalid request' }, 400);

  if (payload.action === 'get_exam') {
    const code = cleanText(payload.code).toUpperCase();
    if (!code) return jsonResponse({ error: '응시코드가 필요합니다.' }, 400);
    const { data: exam, error: examError } = await supabase
      .from('growing_exams')
      .select('*')
      .eq('short_code', code)
      .maybeSingle();
    if (examError) return jsonResponse({ error: examError.message }, 500);
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
    if (questionsRes.error) return jsonResponse({ error: questionsRes.error.message }, 500);
    if (classRes.error) return jsonResponse({ error: classRes.error.message }, 500);
    if ((questionsRes.data ?? []).length === 0) return jsonResponse({ error: '아직 문항이 없는 시험입니다.' }, 422);

    const studentIds = Array.isArray(classRes.data?.student_ids) ? classRes.data.student_ids as string[] : [];
    const studentsRes = studentIds.length > 0
      ? await supabase.from('growing_students').select('id, name, status').eq('owner_id', exam.owner_id).in('id', studentIds)
      : { data: [], error: null };
    if (studentsRes.error) return jsonResponse({ error: studentsRes.error.message }, 500);

    const submissionsRes = await supabase
      .from('growing_exam_submissions')
      .select('student_id')
      .eq('exam_id', exam.id)
      .eq('status', 'submitted');
    if (submissionsRes.error) return jsonResponse({ error: submissionsRes.error.message }, 500);
    const submittedIds = new Set((submissionsRes.data ?? []).map(row => row.student_id as string));

    const studentsById = new Map((studentsRes.data ?? []).map(row => [row.id as string, row]));

    return jsonResponse({
      exam: {
        id: exam.id,
        title: exam.title,
        targetLabel: exam.target_label,
        topic: exam.topic,
        date: exam.date,
        shortCode: exam.short_code,
      },
      questions: questionsRes.data ?? [],
      students: studentIds
        .map((id, index) => {
          const row = studentsById.get(id);
          if (!row || row.status !== 'active') return null;
          return { id: row.id, no: index + 1, name: row.name, submitted: submittedIds.has(row.id as string) };
        })
        .filter(row => row !== null),
    });
  }

  if (payload.action === 'submit') {
    const code = cleanText(payload.code).toUpperCase();
    const studentId = cleanText(payload.studentId);
    const answers = payload.answers ?? {};
    if (!code || !studentId) return jsonResponse({ error: '응시코드와 학생 정보가 필요합니다.' }, 400);
    const { data: exam, error: examError } = await supabase
      .from('growing_exams')
      .select('*')
      .eq('short_code', code)
      .maybeSingle();
    if (examError) return jsonResponse({ error: examError.message }, 500);
    if (!exam) return jsonResponse({ error: '응시코드에 해당하는 시험을 찾을 수 없습니다.' }, 404);
    if (exam.status !== 'published') return jsonResponse({ error: '아직 응시가 시작되지 않았습니다.' }, 403);
    if (!exam.class_id) return jsonResponse({ error: '응시 명단이 설정되지 않은 시험입니다.' }, 403);

    const [studentRes, questionsRes, classRes] = await Promise.all([
      supabase.from('growing_students').select('id, name, owner_id, status').eq('id', studentId).maybeSingle(),
      supabase.from('growing_exam_questions').select('*').eq('exam_id', exam.id).order('order_no'),
      exam.class_id
        ? supabase.from('growing_classes').select('student_ids').eq('id', exam.class_id).eq('owner_id', exam.owner_id).single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (studentRes.error || questionsRes.error || classRes.error) return jsonResponse({ error: studentRes.error?.message ?? questionsRes.error?.message ?? classRes.error?.message }, 500);
    if (!studentRes.data) return jsonResponse({ error: '학생 정보를 찾을 수 없습니다.' }, 404);
    const classStudentIds = Array.isArray(classRes.data?.student_ids) ? classRes.data.student_ids as string[] : [];
    const isClassStudent = classStudentIds.includes(studentId);
    if (exam.class_id && (!isClassStudent || studentRes.data.status !== 'active' || studentRes.data.owner_id !== exam.owner_id)) {
      return jsonResponse({ error: '해당 시험에 응시할 수 있는 학생만 제출할 수 있어요.' }, 403);
    }

    const questions = questionsRes.data ?? [];
    if (questions.length === 0) return jsonResponse({ error: '아직 문항이 없는 시험입니다.' }, 422);
    const total = questions.reduce((sum, question) => sum + Number(question.points ?? 0), 0);
    const graded = await Promise.all(questions.map(async question => {
      const answer = normalizeAnswer(answers[question.id as string]);
      return { question, answer, grade: await gradeOne(question, answer) };
    }));
    const score = graded.reduce((sum, item) => sum + item.grade.gained_points, 0);

    const { data: submission, error: submissionError } = await supabase
      .from('growing_exam_submissions')
      .insert({
        owner_id: exam.owner_id,
        exam_id: exam.id,
        student_id: studentId,
        student_name_snapshot: studentRes.data.name,
        score,
        total_points: total,
        graded_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (submissionError) return jsonResponse({ error: '이미 제출했거나 저장 중 오류가 발생했습니다.' }, 409);

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
      await supabase
        .from('growing_exam_submissions')
        .delete()
        .eq('id', submission.id)
        .eq('owner_id', exam.owner_id);
      return jsonResponse({ error: answersError.message }, 500);
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
    const token = cleanText(payload.token);
    if (!token) return jsonResponse({ error: '결과 토큰이 필요합니다.' }, 400);
    const { data: link, error: linkError } = await supabase
      .from('growing_exam_result_links')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (linkError) return jsonResponse({ error: linkError.message }, 500);
    if (!link) return jsonResponse({ error: '결과 링크를 찾을 수 없습니다.' }, 404);
    if (link.expires_at && new Date(link.expires_at as string).getTime() < Date.now()) {
      return jsonResponse({ error: '만료된 결과 링크입니다.' }, 410);
    }

    const [examRes, submissionRes, answersRes, questionsRes] = await Promise.all([
      supabase.from('growing_exams').select('title, target_label, topic, date').eq('id', link.exam_id).eq('owner_id', link.owner_id).single(),
      supabase.from('growing_exam_submissions').select('*').eq('id', link.submission_id).eq('exam_id', link.exam_id).eq('owner_id', link.owner_id).single(),
      supabase.from('growing_exam_answers').select('*').eq('submission_id', link.submission_id).eq('owner_id', link.owner_id),
      supabase.from('growing_exam_questions').select('*').eq('exam_id', link.exam_id).eq('owner_id', link.owner_id).order('order_no'),
    ]);
    const error = examRes.error || submissionRes.error || answersRes.error || questionsRes.error;
    if (error) return jsonResponse({ error: error.message }, 500);
    await supabase.from('growing_exam_result_links').update({ viewed_at: new Date().toISOString() }).eq('id', link.id);

    return jsonResponse({
      exam: examRes.data,
      submission: submissionRes.data,
      questions: questionsRes.data ?? [],
      answers: answersRes.data ?? [],
    });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
});
