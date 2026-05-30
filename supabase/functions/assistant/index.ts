// Supabase Edge Function: AI 학원 비서 '아이비' (Phase 1 — 읽기 비서)
//
// 정적 호스팅(GitHub Pages)에서는 GEMINI_API_KEY를 노출할 수 없으므로, 이
// 함수가 프론트엔드와 Gemini API 사이의 중계 계층 역할을 한다. 호출은 항상
// 로그인한 원장님의 Supabase JWT로 이루어지며, 그 토큰으로 만든 Supabase
// 클라이언트로 DB를 읽기 때문에 RLS가 본인 학원 데이터로 자동 격리한다.
//
// Phase 1 범위: Gemini function-calling으로 6개 읽기 tool을 제공한다.
// (학생/반/출결/수납/상담 조회 + 오늘 현황). 쓰기(청구서 발행·출결 변경)는
// Phase 2, 멀티 에이전트는 Phase 3에서 추가한다.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 모델 티어링: 단순 작업은 lite, 품질이 필요한 작업은 flash. Phase 1은 단일
// 에이전트라 tool 선택·종합 신뢰도를 위해 flash를 사용한다.
const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
} as const;

// ---- 한국 시간(KST) 헬퍼: 서버는 UTC라 '오늘'/'이번 달'을 KST로 계산 ----
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstNow = () => new Date(Date.now() + KST_OFFSET_MS);
const kstToday = () => kstNow().toISOString().slice(0, 10); // YYYY-MM-DD
const kstMonth = () => kstNow().toISOString().slice(0, 7); // YYYY-MM
const KDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const kstDayOfWeek = () => KDAYS[kstNow().getUTCDay()];

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// =====================================================================
// 조회 tool 정의 (Gemini functionDeclarations)
// =====================================================================
const TOOL_DECLARATIONS = [
  {
    name: 'list_students',
    description: '학원 학생 목록을 조회한다. 이름/학교로 검색하거나 재원/퇴원 상태로 필터할 수 있다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', enum: ['active', 'inactive', 'all'], description: '재원(active)/퇴원(inactive)/전체(all). 기본 active' },
        query: { type: 'STRING', description: '이름 또는 학교명 부분 검색어(선택)' },
      },
    },
  },
  {
    name: 'list_classes',
    description: '개설된 반(클래스)과 요일·시간표, 각 반의 수강 학생을 조회한다.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_attendance_summary',
    description: '특정 월의 출결 통계를 학생별로 집계한다(출석/지각/결석/보강 횟수와 출석률). 학생 이름이나 반 이름으로 좁힐 수 있다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'STRING', description: '조회 월 YYYY-MM 형식. 생략 시 이번 달' },
        studentName: { type: 'STRING', description: '특정 학생 이름(부분 검색, 선택)' },
        className: { type: 'STRING', description: '특정 반 이름(부분 검색, 선택)' },
      },
    },
  },
  {
    name: 'get_payments',
    description: '교육비 수납 현황을 조회한다. 미납/완납 필터, 특정 월, 특정 학생으로 좁힐 수 있고 합계도 함께 준다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'STRING', description: '청구 월 YYYY-MM 형식. 생략 시 이번 달' },
        status: { type: 'STRING', enum: ['paid', 'unpaid', 'all'], description: '완납/미납/전체. 기본 all' },
        studentName: { type: 'STRING', description: '특정 학생 이름(부분 검색, 선택)' },
      },
    },
  },
  {
    name: 'get_counsel_logs',
    description: '특정 학생의 상담/진도/시험 일지를 조회한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '학생 이름(부분 검색)' },
        type: { type: 'STRING', enum: ['counsel', 'progress', 'test'], description: '상담/진도/시험 중 종류(선택)' },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'get_today_overview',
    description: '오늘의 학원 현황 요약: 오늘 요일/날짜, 오늘 예정된 수업과 반별 학생 수·출결 진행, 이번 달 미납 건수/금액.',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

// =====================================================================
// tool 실행기 (모두 RLS-스코프된 supabase 클라이언트로 읽는다)
// =====================================================================
type Json = Record<string, unknown>;

// 학생 목록을 한 번 받아 id↔이름 매핑/검색에 재사용.
async function fetchStudents(sb: SupabaseClient) {
  const { data, error } = await sb.from('growing_students').select('*');
  if (error) throw error;
  return data ?? [];
}

const norm = (v: unknown) => (typeof v === 'string' ? v : '');
const matchName = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());

async function execTool(sb: SupabaseClient, name: string, args: Json): Promise<Json> {
  switch (name) {
    case 'list_students': {
      const status = (args.status as string) ?? 'active';
      const query = (args.query as string) ?? '';
      const students = await fetchStudents(sb);
      const filtered = students.filter((s: Json) => {
        if (status !== 'all' && s.status !== status) return false;
        if (query && !(matchName(norm(s.name), query) || matchName(norm(s.school), query))) return false;
        return true;
      });
      return {
        count: filtered.length,
        students: filtered.map((s: Json) => ({
          name: s.name, school: s.school, grade: s.grade, status: s.status,
          parentContact: s.parent_contact, contact: s.contact, memo: s.memo,
          registrationDate: s.registration_date,
        })),
      };
    }

    case 'list_classes': {
      const [classesRes, students] = await Promise.all([
        sb.from('growing_classes').select('*').order('start_time'),
        fetchStudents(sb),
      ]);
      if (classesRes.error) throw classesRes.error;
      const nameById = new Map(students.map((s: Json) => [s.id, s.name]));
      return {
        count: (classesRes.data ?? []).length,
        classes: (classesRes.data ?? []).map((c: Json) => ({
          name: c.name, days: c.days, startTime: c.start_time, endTime: c.end_time,
          tuitionFee: c.tuition_fee,
          students: ((c.student_ids as string[]) ?? []).map(id => nameById.get(id)).filter(Boolean),
        })),
      };
    }

    case 'get_attendance_summary': {
      const month = (args.month as string) || kstMonth();
      const studentName = (args.studentName as string) ?? '';
      const className = (args.className as string) ?? '';
      const [students, classesRes, attRes] = await Promise.all([
        fetchStudents(sb),
        sb.from('growing_classes').select('*'),
        sb.from('growing_attendance').select('*').like('date', `${month}%`),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (attRes.error) throw attRes.error;

      // 대상 학생 id 집합 결정(이름/반 필터)
      let targetIds: Set<string> | null = null;
      if (studentName) {
        targetIds = new Set(students.filter((s: Json) => matchName(norm(s.name), studentName)).map((s: Json) => s.id as string));
      }
      if (className) {
        const cls = (classesRes.data ?? []).filter((c: Json) => matchName(norm(c.name), className));
        const ids = new Set<string>(cls.flatMap((c: Json) => (c.student_ids as string[]) ?? []));
        targetIds = targetIds ? new Set([...targetIds].filter(id => ids.has(id))) : ids;
      }

      const nameById = new Map(students.map((s: Json) => [s.id, s.name]));
      const acc: Record<string, Json> = {};
      for (const r of attRes.data ?? []) {
        const sid = r.student_id as string;
        if (targetIds && !targetIds.has(sid)) continue;
        const row = (acc[sid] ??= { name: nameById.get(sid) ?? '(알수없음)', present: 0, late: 0, absent: 0, makeup: 0, total: 0 });
        const st = r.status as string;
        if (st in row) (row[st] as number)++;
        row.total = (row.total as number) + 1;
      }
      const rows = Object.values(acc).map(r => {
        const attended = (r.present as number) + (r.late as number) + (r.makeup as number);
        return { ...r, rate: (r.total as number) > 0 ? Math.round((attended / (r.total as number)) * 100) : 0 };
      }).sort((a, b) => (a.rate as number) - (b.rate as number));
      return { month, studentCount: rows.length, summary: rows };
    }

    case 'get_payments': {
      const month = (args.month as string) || kstMonth();
      const status = (args.status as string) ?? 'all';
      const studentName = (args.studentName as string) ?? '';
      const [students, payRes] = await Promise.all([
        fetchStudents(sb),
        sb.from('growing_payments').select('*').eq('billing_month', month),
      ]);
      if (payRes.error) throw payRes.error;
      const byId = new Map(students.map((s: Json) => [s.id, s]));
      let rows = (payRes.data ?? []).map((p: Json) => {
        const stu = byId.get(p.student_id) as Json | undefined;
        return {
          studentName: stu?.name ?? '(알수없음)', parentContact: stu?.parent_contact ?? '',
          billingMonth: p.billing_month, amount: p.amount, status: p.status,
          paymentDate: p.payment_date, paymentMethod: p.payment_method,
        };
      });
      if (status !== 'all') rows = rows.filter(r => r.status === status);
      if (studentName) rows = rows.filter(r => matchName(r.studentName, studentName));
      const unpaid = rows.filter(r => r.status === 'unpaid');
      return {
        month,
        count: rows.length,
        totalAmount: rows.reduce((s, r) => s + (r.amount as number), 0),
        unpaidCount: unpaid.length,
        unpaidAmount: unpaid.reduce((s, r) => s + (r.amount as number), 0),
        payments: rows,
      };
    }

    case 'get_counsel_logs': {
      const studentName = (args.studentName as string) ?? '';
      const type = (args.type as string) ?? '';
      const students = await fetchStudents(sb);
      const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
      if (matched.length === 0) return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다.` };
      const ids = matched.map((s: Json) => s.id as string);
      let q = sb.from('growing_counsel_logs').select('*').in('student_id', ids).order('date', { ascending: false });
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;
      const nameById = new Map(matched.map((s: Json) => [s.id, s.name]));
      return {
        found: true,
        students: matched.map((s: Json) => s.name),
        count: (data ?? []).length,
        logs: (data ?? []).map((l: Json) => ({
          studentName: nameById.get(l.student_id), date: l.date, title: l.title,
          content: l.content, type: l.type, score: l.score,
        })),
      };
    }

    case 'get_today_overview': {
      const today = kstToday();
      const day = kstDayOfWeek();
      const month = kstMonth();
      const [students, classesRes, attRes, payRes] = await Promise.all([
        fetchStudents(sb),
        sb.from('growing_classes').select('*'),
        sb.from('growing_attendance').select('*').eq('date', today),
        sb.from('growing_payments').select('*').eq('billing_month', month).eq('status', 'unpaid'),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (attRes.error) throw attRes.error;
      if (payRes.error) throw payRes.error;
      const nameById = new Map(students.map((s: Json) => [s.id, s.name]));
      const todayClasses = (classesRes.data ?? []).filter((c: Json) => ((c.days as string[]) ?? []).includes(day));
      const att = attRes.data ?? [];
      const classes = todayClasses.map((c: Json) => {
        const ids = (c.student_ids as string[]) ?? [];
        const recs = att.filter((a: Json) => ids.includes(a.student_id as string));
        return {
          name: c.name, time: `${c.start_time}~${c.end_time}`,
          studentCount: ids.length,
          checkedCount: recs.length,
          students: ids.map(id => {
            const r = recs.find((a: Json) => a.student_id === id) as Json | undefined;
            return { name: nameById.get(id), status: r?.status ?? '미체크', checkInTime: r?.check_in_time ?? null, checkOutTime: r?.check_out_time ?? null };
          }),
        };
      });
      return {
        today, dayOfWeek: day,
        activeStudentCount: students.filter((s: Json) => s.status === 'active').length,
        todayClassCount: todayClasses.length,
        classes,
        unpaidThisMonth: { count: (payRes.data ?? []).length, amount: (payRes.data ?? []).reduce((s, p: Json) => s + (p.amount as number), 0) },
      };
    }

    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}

// =====================================================================
// Gemini function-calling 루프
// =====================================================================
function systemPrompt(): string {
  return `당신은 '그로잉영어' 영어 교습소의 AI 운영 비서 '아이비(Ivy)'입니다.
오늘은 ${kstToday()} (${kstDayOfWeek()}요일)이며, 이번 달은 ${kstMonth()}입니다.
원장님을 도와 학생·출결·수납·상담 업무를 돕습니다. 스스로를 소개할 때는 아이비라고 합니다.

[원칙]
- 학원 데이터(학생/반/출결/수납/상담)에 대한 질문은 반드시 제공된 도구(tool)로 실제 데이터를 조회한 뒤 답합니다. 절대 추측하거나 지어내지 않습니다.
- 도구 결과가 비어 있으면 해당 데이터가 없다고 솔직히 답합니다.
- 지금은 읽기 전용 단계입니다. 청구서 발행·출결 변경·메시지 발송 같은 데이터 변경 요청에는, 조회는 도와드리되 실제 변경은 곧 추가될 예정이라고 안내합니다.
- 항상 한국어로 간결하고 정중하게(존댓말) 답하며, 금액은 천 단위 구분(예: 150,000원), 목록은 보기 좋게 정리합니다.
- 학부모에게 보낼 문구를 요청받으면 따뜻하고 정중한 안내문을 작성합니다.`;
}

interface GeminiPart { text?: string; functionCall?: { name: string; args: Json }; functionResponse?: { name: string; response: Json } }
interface GeminiContent { role: string; parts: GeminiPart[] }

async function callGeminiRaw(model: string, contents: GeminiContent[]): Promise<GeminiContent> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 시크릿이 설정되지 않았습니다.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini 호출 실패 (${res.status}): ${detail.slice(0, 600)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content;
  if (!content) throw new Error('Gemini 응답이 비어 있습니다.');
  return content as GeminiContent;
}

// 대화 히스토리(텍스트) → Gemini contents, 이후 tool 루프를 돈다.
async function runAgent(sb: SupabaseClient, messages: ChatMessage[]): Promise<{ reply: string; toolsUsed: string[] }> {
  const contents: GeminiContent[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const toolsUsed: string[] = [];
  for (let i = 0; i < 5; i++) {
    const content = await callGeminiRaw(MODELS.flash, contents);
    const parts = content.parts ?? [];
    const calls = parts.filter(p => p.functionCall);

    if (calls.length === 0) {
      const text = parts.map(p => p.text ?? '').join('').trim();
      return { reply: text || '죄송해요, 답변을 생성하지 못했어요.', toolsUsed };
    }

    // 모델의 functionCall 턴을 히스토리에 추가
    contents.push({ role: 'model', parts });

    // 호출된 도구들을 실행하고 functionResponse를 모아 user 턴으로 추가
    const responseParts: GeminiPart[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      toolsUsed.push(fc.name);
      let result: Json;
      try {
        result = await execTool(sb, fc.name, fc.args ?? {});
      } catch (e) {
        result = { error: e instanceof Error ? e.message : '도구 실행 오류' };
      }
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return { reply: '요청이 너무 복잡해 처리하지 못했어요. 조금 더 구체적으로 말씀해 주시겠어요?', toolsUsed };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST 요청만 지원합니다.' }, 405);
  }

  try {
    // 인증 사용자 확인 + RLS-스코프 클라이언트 구성(이 토큰으로 읽는 DB는 본인 학원만)
    const authHeader = req.headers.get('Authorization') ?? '';
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: '인증이 필요합니다. 다시 로그인해 주세요.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return jsonResponse({ error: '메시지가 비어 있습니다.' }, 400);
    }

    const { reply, toolsUsed } = await runAgent(sb, messages);
    return jsonResponse({ reply, model: MODELS.flash, toolsUsed });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' }, 500);
  }
});
