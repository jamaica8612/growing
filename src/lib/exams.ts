import { supabase } from './supabase';

// ============================================================================
// 평가관리(온라인 시험) 데이터/SDK 레이어
//
// 백엔드는 이미 구축되어 있다(코덱스 작업):
//   테이블  growing_exams / _questions / _submissions / _answers /
//           _materials / _result_links  (owner_id RLS, class_id·student_id 실제 FK)
//   엣지함수 exam-generate (JWT, AI 출제/수정 — Gemini)
//           exam-public   (무로그인, 서비스롤 — 학생 응시/제출, 학부모 결과)
//
// 이 모듈은 그 백엔드에 대응하는 타입과 호출 래퍼를 제공한다.
// difficulty/status 등 enum은 DB가 영문값(normal/published…)을 쓰므로 매핑한다.
// ============================================================================

export type ExamQType = 'vocab' | 'grammar' | 'reading' | 'writing';
export type ExamStatus = 'draft' | 'published' | 'closed';

// DB는 영문 난이도, UI는 한국어. 양방향 매핑.
export const DIFFICULTY_TO_DB: Record<string, string> = { 쉬움: 'easy', 보통: 'normal', 어려움: 'hard' };
export const DIFFICULTY_FROM_DB: Record<string, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

export interface ExamQuestion {
  id?: string;
  orderNo: number;
  type: ExamQType;
  points: number;
  source: string;
  prompt: string;
  passage: string | null;
  choices: string[] | null;
  answer: number | string;
  explanation: string;
}

export interface Exam {
  id: string;
  classId: string | null;
  title: string;
  targetLabel: string;
  topic: string;
  date: string;
  difficulty: string; // 한국어 (쉬움/보통/어려움)
  status: ExamStatus;
  shortCode: string;
  questions: ExamQuestion[];
  createdAt?: number;
}

type Row = Record<string, unknown>;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const toQuestion = (r: Row): ExamQuestion => ({
  id: String(r.id),
  orderNo: Number(r.order_no ?? 0),
  type: (r.type as ExamQType) ?? 'vocab',
  points: Number(r.points ?? 0),
  source: String(r.source ?? ''),
  prompt: String(r.prompt ?? ''),
  passage: r.passage ? String(r.passage) : null,
  choices: Array.isArray(r.choices) ? (r.choices as string[]) : null,
  answer: (r.answer as number | string) ?? '',
  explanation: String(r.explanation ?? ''),
});

const toExam = (r: Row, questions: ExamQuestion[] = []): Exam => ({
  id: String(r.id),
  classId: r.class_id ? String(r.class_id) : null,
  title: String(r.title ?? ''),
  targetLabel: String(r.target_label ?? ''),
  topic: String(r.topic ?? ''),
  date: String(r.date ?? ''),
  difficulty: DIFFICULTY_FROM_DB[String(r.difficulty)] ?? String(r.difficulty ?? '보통'),
  status: (r.status as ExamStatus) ?? 'draft',
  shortCode: String(r.short_code ?? ''),
  questions,
  createdAt: r.created_at ? new Date(r.created_at as string).getTime() : undefined,
});

// 응시코드(6자 대문자/숫자) — 혼동되는 0/O/1/I 제외
function makeShortCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  score: number;
  totalPoints: number;
  status: string;
  submittedAt: string;
}

export interface ExamAnswer {
  submissionId: string;
  questionId: string;
  answer: number | string;
  isCorrect: boolean;
  isPartial: boolean;
  gainedPoints: number;
  feedback: string;
}

export interface ExamListItem {
  id: string;
  title: string;
  targetLabel: string;
  topic: string;
  date: string;
  difficulty: string;
  status: ExamStatus;
  shortCode: string;
  count: number;
  types: ExamQType[];
  totalPoints: number;
}

export const examsApi = {
  // ---- 선생님 측 (JWT / owner RLS) ----

  // 저장된 시험 목록 (문항 메타 집계 포함, 최신순)
  async list(): Promise<ExamListItem[]> {
    const { data, error } = await supabase
      .from('growing_exams')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const exams = (data ?? []).map(r => toExam(r));
    if (exams.length === 0) return [];
    const { data: qData, error: qErr } = await supabase
      .from('growing_exam_questions')
      .select('exam_id, type, points')
      .in('exam_id', exams.map(e => e.id));
    if (qErr) throw qErr;
    const byExam = new Map<string, { count: number; types: Set<ExamQType>; total: number }>();
    for (const r of qData ?? []) {
      const eid = String((r as Row).exam_id);
      const agg = byExam.get(eid) ?? { count: 0, types: new Set<ExamQType>(), total: 0 };
      agg.count += 1;
      agg.types.add((r as Row).type as ExamQType);
      agg.total += Number((r as Row).points ?? 0);
      byExam.set(eid, agg);
    }
    return exams.map(e => {
      const agg = byExam.get(e.id);
      return {
        id: e.id, title: e.title, targetLabel: e.targetLabel, topic: e.topic, date: e.date,
        difficulty: e.difficulty, status: e.status, shortCode: e.shortCode,
        count: agg?.count ?? 0, types: agg ? Array.from(agg.types) : [], totalPoints: agg?.total ?? 0,
      };
    });
  },

  // 시험 1건 + 문항 로드
  async get(id: string): Promise<Exam> {
    const [examRes, qRes] = await Promise.all([
      supabase.from('growing_exams').select('*').eq('id', id).single(),
      supabase.from('growing_exam_questions').select('*').eq('exam_id', id).order('order_no'),
    ]);
    if (examRes.error) throw examRes.error;
    if (qRes.error) throw qRes.error;
    return toExam(examRes.data, (qRes.data ?? []).map(toQuestion));
  },

  // AI 출제 (자료 텍스트 기반 신규 생성). exam-generate mode:'generate'
  async generate(input: { materialText: string; title?: string; targetLabel?: string; topic?: string; difficulty?: string; count?: number; types?: ExamQType[]; instruction?: string }): Promise<ExamQuestion[]> {
    const { data, error } = await supabase.functions.invoke('exam-generate', {
      body: { mode: 'generate', ...input, difficulty: DIFFICULTY_TO_DB[input.difficulty ?? '보통'] ?? 'normal' },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return arr<Row>(data?.questions).map(toQuestion);
  },

  // AI 편집(문항 추가/수정 등 자연어 지시). exam-generate mode:'revise'
  async revise(input: { materialText: string; instruction: string; questions: ExamQuestion[]; targetLabel?: string; topic?: string; difficulty?: string }): Promise<ExamQuestion[]> {
    const { data, error } = await supabase.functions.invoke('exam-generate', {
      body: { mode: 'revise', ...input, difficulty: DIFFICULTY_TO_DB[input.difficulty ?? '보통'] ?? 'normal' },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return arr<Row>(data?.questions).map(toQuestion);
  },

  // 신규 시험 저장: growing_exams insert → 문항 insert. owner_id는 DB default(auth.uid()).
  async create(input: { classId: string; targetLabel: string; title: string; topic: string; date: string; difficulty: string; questions: ExamQuestion[] }): Promise<Exam> {
    let examRow: Row | null = null;
    let examErr: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await supabase
        .from('growing_exams')
        .insert({
          class_id: input.classId,
          title: input.title,
          target_label: input.targetLabel,
          topic: input.topic,
          date: input.date || new Date().toISOString().slice(0, 10),
          difficulty: DIFFICULTY_TO_DB[input.difficulty] ?? 'normal',
          status: 'draft',
          short_code: makeShortCode(),
        })
        .select()
        .single();
      if (!result.error) {
        examRow = result.data as Row;
        examErr = null;
        break;
      }
      examErr = result.error;
      const duplicatedCode = result.error.code === '23505' && String(result.error.message ?? '').includes('short_code');
      if (!duplicatedCode) break;
    }
    if (examErr || !examRow) throw examErr ?? new Error('시험 저장에 실패했습니다.');
    const examId = String(examRow.id);
    if (input.questions.length > 0) {
      const { error: qErr } = await supabase.from('growing_exam_questions').insert(
        input.questions.map((q, i) => ({
          exam_id: examId,
          order_no: q.orderNo ?? i + 1,
          type: q.type,
          points: q.points,
          source: q.source,
          prompt: q.prompt,
          passage: q.passage ?? '',
          choices: q.choices ?? null,
          answer: q.answer,
          explanation: q.explanation,
        }))
      );
      if (qErr) {
        await supabase.from('growing_exams').delete().eq('id', examId);
        throw qErr;
      }
    }
    return this.get(examId);
  },

  async update(input: { id: string; classId: string | null; targetLabel: string; title: string; topic: string; date: string; difficulty: string; questions: ExamQuestion[] }): Promise<Exam> {
    const [examStatusRes, submittedRes] = await Promise.all([
      supabase.from('growing_exams').select('status').eq('id', input.id).single(),
      supabase.from('growing_exam_submissions').select('id').eq('exam_id', input.id).limit(1),
    ]);
    if (examStatusRes.error) throw examStatusRes.error;
    if (submittedRes.error) throw submittedRes.error;
    if (examStatusRes.data?.status === 'published') throw new Error('응시 진행 중인 시험은 마감 후 수정할 수 있습니다.');
    const submittedRows = submittedRes.data;
    if ((submittedRows ?? []).length > 0) throw new Error('이미 제출된 답안이 있는 시험은 수정할 수 없습니다.');

    const { error: examErr } = await supabase
      .from('growing_exams')
      .update({
        class_id: input.classId,
        title: input.title,
        target_label: input.targetLabel,
        topic: input.topic,
        date: input.date || new Date().toISOString().slice(0, 10),
        difficulty: DIFFICULTY_TO_DB[input.difficulty] ?? 'normal',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id);
    if (examErr) throw examErr;

    const isUuid = (value?: string) => !!value && /^[0-9a-f-]{36}$/i.test(value);
    const { data: existingQuestions, error: existingError } = await supabase
      .from('growing_exam_questions')
      .select('id')
      .eq('exam_id', input.id);
    if (existingError) throw existingError;
    const keepIds = new Set(input.questions.filter(q => isUuid(q.id)).map(q => q.id as string));
    const deleteIds = (existingQuestions ?? []).map(row => String(row.id)).filter(id => !keepIds.has(id));
    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase.from('growing_exam_questions').delete().in('id', deleteIds);
      if (deleteError) throw deleteError;
    }

    for (const [index, q] of input.questions.entries()) {
      const row = {
        order_no: q.orderNo ?? index + 1,
        type: q.type,
        points: q.points,
        source: q.source,
        prompt: q.prompt,
        passage: q.passage ?? '',
        choices: q.choices ?? null,
        answer: q.answer,
        explanation: q.explanation,
      };
      if (isUuid(q.id)) {
        const { error: updateError } = await supabase
          .from('growing_exam_questions')
          .update(row)
          .eq('id', q.id)
          .eq('exam_id', input.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('growing_exam_questions')
          .insert({ ...row, exam_id: input.id });
        if (insertError) throw insertError;
      }
    }

    return this.get(input.id);
  },

  // 배포 상태 토글 (published ↔ closed)
  async setStatus(id: string, status: ExamStatus): Promise<void> {
    const { error } = await supabase
      .from('growing_exams')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('growing_exams').delete().eq('id', id);
    if (error) throw error;
  },

  // 결과: 제출 목록 + 답안
  async submissions(examId: string): Promise<{ submissions: ExamSubmission[]; answers: ExamAnswer[] }> {
    const subRes = await supabase
      .from('growing_exam_submissions')
      .select('*')
      .eq('exam_id', examId)
      .order('submitted_at', { ascending: false });
    if (subRes.error) throw subRes.error;
    const subs = (subRes.data ?? []).map((r): ExamSubmission => ({
      id: String(r.id), examId: String(r.exam_id), studentId: String(r.student_id),
      studentName: String(r.student_name_snapshot ?? ''), score: Number(r.score ?? 0),
      totalPoints: Number(r.total_points ?? 0), status: String(r.status ?? ''),
      submittedAt: String(r.submitted_at ?? ''),
    }));
    const ids = subs.map(s => s.id);
    let answers: ExamAnswer[] = [];
    if (ids.length > 0) {
      const ansRes = await supabase.from('growing_exam_answers').select('*').in('submission_id', ids);
      if (ansRes.error) throw ansRes.error;
      answers = (ansRes.data ?? []).map((r): ExamAnswer => ({
        submissionId: String(r.submission_id), questionId: String(r.question_id),
        answer: (r.answer as number | string) ?? '', isCorrect: !!r.is_correct, isPartial: !!r.is_partial,
        gainedPoints: Number(r.gained_points ?? 0), feedback: String(r.feedback ?? ''),
      }));
    }
    return { submissions: subs, answers };
  },

  // 학부모 결과 공유 링크 생성 (토큰 발급)
  async createResultLink(examId: string, submissionId: string): Promise<string> {
    const token = crypto.randomUUID().replace(/-/g, '');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const ownerId = userData.user?.id;
    if (!ownerId) throw new Error('로그인이 필요합니다.');
    const { error: submissionError } = await supabase
      .from('growing_exam_submissions')
      .select('id')
      .eq('id', submissionId)
      .eq('exam_id', examId)
      .eq('owner_id', ownerId)
      .single();
    if (submissionError) throw submissionError;
    const { data: existing, error: existingError } = await supabase
      .from('growing_exam_result_links')
      .select('token, expires_at')
      .eq('owner_id', ownerId)
      .eq('exam_id', examId)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.token && (!existing.expires_at || new Date(existing.expires_at as string).getTime() > Date.now())) {
      return String(existing.token);
    }
    const { error } = await supabase
      .from('growing_exam_result_links')
      .insert({ owner_id: ownerId, exam_id: examId, submission_id: submissionId, token });
    if (error) throw error;
    return token;
  },

  // ---- 학생/학부모 무로그인 (exam-public, 별도 공개 라우트에서 사용) ----
  async publicGetExam(code: string) {
    const { data, error } = await supabase.functions.invoke('exam-public', { body: { action: 'get_exam', code } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { exam: Row; questions: Row[]; students: { id: string; no: number; name: string; submitted: boolean }[] };
  },
  async publicSubmit(code: string, studentId: string, answers: Record<string, number | string>) {
    const { data, error } = await supabase.functions.invoke('exam-public', { body: { action: 'submit', code, studentId, answers } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { ok: boolean; score: number; total: number };
  },
  async publicGetResult(token: string) {
    const { data, error } = await supabase.functions.invoke('exam-public', { body: { action: 'get_result', token } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { exam: Row; submission: Row; questions: Row[]; answers: Row[] };
  },
};
