// Supabase Edge Function: AI 학원 비서 '아이비' (Phase 2 — 쓰기 + 확인 카드)
//
// 정적 호스팅(GitHub Pages)에서는 GEMINI_API_KEY를 노출할 수 없으므로, 이
// 함수가 프론트엔드와 Gemini API 사이의 중계 계층 역할을 한다. 호출은 항상
// 로그인한 원장님의 Supabase JWT로 이루어지며, 그 토큰으로 만든 Supabase
// 클라이언트로 DB를 읽기 때문에 RLS가 본인 학원 데이터로 자동 격리한다.
//
// Phase 2 추가: propose_attendance_change / propose_payment_change 도구로
// 변경 제안 객체만 반환. execute_action 모드에서 승인된 action을 실제로 DB에 반영.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
} as const;

// ---- 한국 시간(KST) 헬퍼 ----
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstNow = () => new Date(Date.now() + KST_OFFSET_MS);
const kstToday = () => kstNow().toISOString().slice(0, 10);
const kstMonth = () => kstNow().toISOString().slice(0, 7);
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
// PendingAction 타입 (프론트와 공유하는 구조)
// =====================================================================
interface UpdateAttendanceAction {
  type: 'update_attendance';
  attendance_id: string;
  student_name: string;
  date: string;
  old_status: string;
  new_status: string;
}

interface CreateAttendanceAction {
  type: 'create_attendance';
  student_id: string;
  student_name: string;
  date: string;
  old_status: string;
  new_status: string;
}

interface UpdatePaymentAction {
  type: 'update_payment';
  payment_id: string;
  student_name: string;
  billing_month: string;
  amount: number;
}

interface CreateCounselLogAction {
  type: 'create_counsel_log';
  student_id: string;
  student_name: string;
  date: string;
  title: string;
  content: string;
  log_type: string;
  score?: string;
}

interface UpdateStudentMemoAction {
  type: 'update_student_memo';
  student_id: string;
  student_name: string;
  old_memo: string;
  new_memo: string;
}

type PendingAction =
  | UpdateAttendanceAction
  | CreateAttendanceAction
  | UpdatePaymentAction
  | CreateCounselLogAction
  | UpdateStudentMemoAction;

// =====================================================================
// tool 정의
// =====================================================================
const TOOL_DECLARATIONS = [
  {
    name: 'list_students',
    description: '학원 학생 목록을 조회한다. 이름/학교로 검색하거나 재원/휴원/퇴원 상태로 필터할 수 있다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', enum: ['active', 'paused', 'inactive', 'all'], description: '재원(active)/휴원(paused)/퇴원(inactive)/전체(all). 기본 active' },
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
    description: '특정 월의 출결 통계를 학생별로 집계한다(출석/결석/보강 횟수와 출석률).',
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
    description: '오늘의 학원 현황 요약: 요일/날짜, 오늘 수업과 반별 출결 진행, 이번 달 미납 건수/금액.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'compose_parent_notice',
    description: '학부모에게 보낼 안내문 초안을 만든다. 실제 발송이나 DB 변경은 하지 않는다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: {
          type: 'STRING',
          enum: ['payment_reminder', 'attendance_followup', 'general'],
          description: '안내문 종류: 미납 안내, 출결 후속 안내, 일반 안내',
        },
        studentName: { type: 'STRING', description: '학생 이름(선택)' },
        month: { type: 'STRING', description: '조회 월 YYYY-MM 형식. 생략 시 이번 달' },
        extraNote: { type: 'STRING', description: '반드시 포함할 추가 안내(선택)' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'remember_note',
    description: '대화에서 알게 된 안정적 사실·선호를 메모로 저장한다. 추측·일시적 정보·민감정보는 저장하지 않는다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: { type: 'STRING', enum: ['academy', 'student'], description: 'academy: 학원 전반 원칙/말투, student: 특정 학생·학부모 선호/특이사항' },
        studentName: { type: 'STRING', description: 'scope=student일 때 학생 이름(부분 검색)' },
        category: { type: 'STRING', description: '분류 키워드(예: parent_pref, student_trait, rule, tone)' },
        content: { type: 'STRING', description: '기억할 내용. 간결하게 한 문장. 최대 300자.' },
      },
      required: ['scope', 'category', 'content'],
    },
  },
  {
    name: 'recall_notes',
    description: '과거에 저장한 메모를 조회한다. 학생 관련 질문에 답하기 전 필요 시 호출한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '특정 학생 이름(부분 검색). 생략 시 학원 전반(academy) 노트 반환.' },
        query: { type: 'STRING', description: '내용 부분 검색어(선택)' },
      },
    },
  },
  {
    name: 'propose_attendance_change',
    description: '학생의 출결 상태 변경을 제안한다. 실제 DB를 변경하지 않고 원장님의 승인을 받을 확인 카드를 생성한다. 출결 수정 요청 시 반드시 이 도구를 사용한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '학생 이름(부분 검색 가능)' },
        date: { type: 'STRING', description: '날짜 YYYY-MM-DD 형식. 생략 시 오늘' },
        newStatus: {
          type: 'STRING',
          enum: ['present', 'absent', 'makeup'],
          description: '변경할 출결 상태: 출석(present)/결석(absent)/보강(makeup)',
        },
      },
      required: ['studentName', 'newStatus'],
    },
  },
  {
    name: 'propose_payment_change',
    description: '학생의 미납 수납을 완납으로 처리할 것을 제안한다. 실제 DB를 변경하지 않고 원장님의 승인을 받을 확인 카드를 생성한다. 수납 처리 요청 시 반드시 이 도구를 사용한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '학생 이름(부분 검색 가능)' },
        billingMonth: { type: 'STRING', description: '청구 월 YYYY-MM 형식. 생략 시 이번 달' },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'propose_counsel_log',
    description: '학생의 상담/진도/시험 일지 작성을 제안한다. 실제 DB를 저장하지 않고 원장님의 승인을 받을 확인 카드를 생성한다. 상담/진도/시험 기록 작성 요청 시 반드시 이 도구를 사용한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '학생 이름(부분 검색 가능)' },
        logType: { type: 'STRING', enum: ['counsel', 'progress', 'test'], description: '상담(counsel)/진도(progress)/시험(test)' },
        title: { type: 'STRING', description: '일지 제목(간결하게)' },
        content: { type: 'STRING', description: '일지 본문' },
        score: { type: 'STRING', description: '시험 점수(logType=test일 때, 예: 95/100). 선택' },
        date: { type: 'STRING', description: '날짜 YYYY-MM-DD. 생략 시 오늘' },
      },
      required: ['studentName', 'logType', 'title', 'content'],
    },
  },
  {
    name: 'propose_student_memo',
    description: '학생의 메모(특이사항)에 내용을 추가하거나 교체할 것을 제안한다. 실제 DB를 변경하지 않고 원장님의 승인을 받을 확인 카드를 생성한다. 학생 메모 수정 요청 시 반드시 이 도구를 사용한다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        studentName: { type: 'STRING', description: '학생 이름(부분 검색 가능)' },
        memo: { type: 'STRING', description: '추가하거나 교체할 메모 내용' },
        mode: { type: 'STRING', enum: ['append', 'replace'], description: '기존 메모에 덧붙이기(append, 기본) 또는 통째로 교체(replace)' },
      },
      required: ['studentName', 'memo'],
    },
  },
  {
    name: 'list_data_sources',
    description: '아이비가 읽을 수 있는 모든 데이터 테이블(growing_*) 목록을 조회한다. 전용 도구로 다루지 않는 데이터(키오스크/숙제 알림, 발송 로그, 설정, 향후 추가되는 기능 등)를 query_table로 읽기 전에 먼저 사용한다.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'query_table',
    description: "지정한 growing_* 테이블의 데이터를 직접 조회한다. 전용 도구(list_students, get_payments 등)가 있으면 그것을 우선 쓰고, 전용 도구가 없는 데이터(알림 대기열·발송 로그·설정 등)에만 이 도구를 사용한다. 학생 식별은 student_id(UUID)로 들어 있을 수 있으니 필요하면 list_students로 이름을 대조한다.",
    parameters: {
      type: 'OBJECT',
      properties: {
        table: { type: 'STRING', description: "조회할 테이블명. 반드시 'growing_'로 시작. list_data_sources로 확인 가능." },
        limit: { type: 'NUMBER', description: '최대 행 수(기본 50, 최대 200)' },
        filterColumn: { type: 'STRING', description: '동등 조건으로 거를 컬럼명(선택)' },
        filterValue: { type: 'STRING', description: 'filterColumn의 값(선택). filterColumn과 함께 써야 적용된다.' },
      },
      required: ['table'],
    },
  },
];

// =====================================================================
// tool 실행기
// =====================================================================
type Json = Record<string, unknown>;

async function fetchStudents(sb: SupabaseClient) {
  const { data, error } = await sb.from('growing_students').select('*');
  if (error) throw error;
  return data ?? [];
}

const norm = (v: unknown) => (typeof v === 'string' ? v : '');
const matchName = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());
const formatWon = (amount: number) => `${Math.round(amount).toLocaleString('ko-KR')}원`;

function compactLines(lines: (string | false | null | undefined)[]) {
  return lines.filter(Boolean).join('\n');
}

const ATTENDANCE_KO: Record<string, string> = {
  present: '출석', absent: '결석', makeup: '보강',
};

const DATA_SOURCE_LABELS: Record<string, string> = {
  growing_students: '학생 기본 정보',
  growing_classes: '반/시간표 정보',
  growing_attendance: '출결·등하원·숙제 기록',
  growing_payments: '수납·미납 기록',
  growing_counsel_logs: '상담·진도·시험 일지',
  growing_kiosk_alerts: '키오스크 등하원 알림 대기열',
  growing_homework_alerts: '숙제 알림 대기열',
  growing_message_logs: '알림장/알림톡 발송 기록',
  growing_settings: '학원 설정과 메시지 템플릿',
  growing_assistant_memory: '아이비 운영 기준 메모',
  growing_assistant_notes: '아이비 자가학습 메모',
};

function labelDataSource(tableName: string): string {
  return DATA_SOURCE_LABELS[tableName] ?? tableName.replace(/^growing_/, '').replaceAll('_', ' ');
}

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
          schedules: c.schedules ?? [],
          tuitionFee: c.tuition_fee,
          tuitionOverrides: c.tuition_overrides ?? {},
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
      // 이름/반을 콕 집어 물으면 휴원생도 답하되, 일반 집계 요약은 재원생만 센다
      // (앱의 출결 통계 정책과 일치).
      const activeIds = new Set(students.filter((s: Json) => s.status === 'active').map((s: Json) => s.id as string));
      const acc: Record<string, Json> = {};
      for (const r of attRes.data ?? []) {
        const sid = r.student_id as string;
        if (targetIds && !targetIds.has(sid)) continue;
        if (!targetIds && !activeIds.has(sid)) continue;
        const row = (acc[sid] ??= { name: nameById.get(sid) ?? '(알수없음)', present: 0, absent: 0, makeup: 0, total: 0 });
        const normalizedStatus = r.status as string;
        if (normalizedStatus in row) (row[normalizedStatus] as number)++;
        row.total = (row.total as number) + 1;
      }
      const rows = Object.values(acc).map(r => {
        const attended = (r.present as number) + (r.makeup as number);
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
        month, count: rows.length,
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
      // 출결 대상은 재원생만(휴원/퇴원생은 오늘 명단에서 제외).
      const activeIds = new Set(students.filter((s: Json) => s.status === 'active').map((s: Json) => s.id as string));
      const todayClasses = (classesRes.data ?? []).filter((c: Json) => ((c.days as string[]) ?? []).includes(day));
      const att = attRes.data ?? [];
      const classes = todayClasses.map((c: Json) => {
        const ids = ((c.student_ids as string[]) ?? []).filter(id => activeIds.has(id));
        const recs = att.filter((a: Json) => ids.includes(a.student_id as string));
        return {
          name: c.name, time: `${c.start_time}~${c.end_time}`,
          studentCount: ids.length, checkedCount: recs.length,
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

    case 'compose_parent_notice': {
      const kind = (args.kind as string) || 'general';
      const studentName = (args.studentName as string) ?? '';
      const month = (args.month as string) || kstMonth();
      const extraNote = (args.extraNote as string) ?? '';
      const students = await fetchStudents(sb);
      const matchedStudents = studentName ? students.filter((s: Json) => matchName(norm(s.name), studentName)) : [];
      const student = matchedStudents[0] as Json | undefined;

      if (studentName && !student) {
        return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다. 이름을 확인해 주세요.` };
      }

      if (kind === 'payment_reminder') {
        let q = sb.from('growing_payments').select('*').eq('billing_month', month).eq('status', 'unpaid');
        if (student) q = q.eq('student_id', student.id);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data ?? [];
        const amount = rows.reduce((sum, p: Json) => sum + (p.amount as number), 0);
        const targetLabel = student ? `${norm(student.name)} 학부모님` : '학부모님';
        return {
          found: true, kind, month, unpaidCount: rows.length, unpaidAmount: amount,
          draft: compactLines([
            `${targetLabel}, 안녕하세요. 그로잉영어입니다.`,
            rows.length > 0
              ? `${month} 교육비 ${formatWon(amount)} 수납 확인이 아직 되지 않아 안내드립니다.`
              : `${month} 교육비 수납 관련해 안내드립니다.`,
            '이미 납부해 주셨다면 확인 중일 수 있으니 편하게 말씀 부탁드립니다.',
            extraNote, '늘 함께해 주셔서 감사합니다.',
          ]),
          caution: '초안만 생성했으며 실제 발송이나 수납 상태 변경은 하지 않았습니다.',
        };
      }

      if (kind === 'attendance_followup') {
        if (!student) return { found: false, message: '출결 후속 안내문은 학생 이름이 필요합니다.' };
        const { data, error } = await sb
          .from('growing_attendance').select('*')
          .eq('student_id', student.id).like('date', `${month}%`).order('date', { ascending: false });
        if (error) throw error;
        const absences = (data ?? []).filter((r: Json) => r.status === 'absent');
        return {
          found: true, kind, month, studentName: student.name,
          absentCount: absences.length,
          draft: compactLines([
            `${student.name} 학부모님, 안녕하세요. 그로잉영어입니다.`,
            `${month} 출결 확인 결과 결석 ${absences.length}회로 기록되어 안내드립니다.`,
            '수업 흐름이 끊기지 않도록 필요한 보강이나 학습 점검을 함께 챙기겠습니다.',
            extraNote, '확인하시고 궁금하신 점이 있으면 언제든 말씀 주세요.',
          ]),
          caution: '초안만 생성했으며 실제 발송이나 출결 변경은 하지 않았습니다.',
        };
      }

      return {
        found: true, kind,
        draft: compactLines([
          `${norm(student?.name) || ''}${student ? ' 학부모님' : '학부모님'}, 안녕하세요. 그로잉영어입니다.`,
          extraNote || '전달드릴 안내사항이 있어 연락드립니다.',
          '확인하시고 궁금하신 점이 있으면 언제든 말씀 주세요.',
          '감사합니다.',
        ]),
        caution: '초안만 생성했으며 실제 발송이나 DB 변경은 하지 않았습니다.',
      };
    }

    case 'remember_note': {
      const scope = (args.scope as string) || 'academy';
      const studentName = (args.studentName as string) ?? '';
      const category = (args.category as string) ?? 'general';
      const rawContent = (args.content as string) ?? '';
      const content = rawContent.slice(0, 300).trim();
      if (!content) return { saved: false, reason: '내용이 비어 있어 저장하지 않았습니다.' };

      let studentId: string | null = null;
      if (scope === 'student') {
        if (!studentName) return { saved: false, reason: 'scope=student에는 studentName이 필요합니다.' };
        const students = await fetchStudents(sb);
        const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
        if (matched.length === 0) return { saved: false, reason: `'${studentName}' 학생을 찾지 못해 저장하지 않았습니다.` };
        studentId = matched[0].id as string;
      }

      const { data: existing } = await sb
        .from('growing_assistant_notes').select('id')
        .eq('scope', scope).eq('content', content).is('student_id', studentId).maybeSingle();
      if (existing) return { saved: false, reason: '이미 동일한 내용이 저장되어 있습니다.' };

      const { error } = await sb.from('growing_assistant_notes').insert({
        scope, category, content,
        ...(studentId ? { student_id: studentId } : {}),
      });
      if (error) throw error;
      return { saved: true, scope, category, content, studentName: studentName || null };
    }

    case 'recall_notes': {
      const studentName = (args.studentName as string) ?? '';
      const query = (args.query as string) ?? '';
      let qb = sb.from('growing_assistant_notes').select('*').order('created_at', { ascending: false });
      if (studentName) {
        const students = await fetchStudents(sb);
        const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
        if (matched.length === 0) return { found: false, notes: [], message: `'${studentName}' 학생 노트가 없습니다.` };
        const ids = matched.map((s: Json) => s.id as string);
        qb = qb.in('student_id', ids).eq('scope', 'student');
      } else {
        qb = qb.eq('scope', 'academy');
      }
      const { data, error } = await qb;
      if (error) throw error;
      let notes = (data ?? []).map((r: Json) => ({ category: r.category, content: r.content, createdAt: r.created_at }));
      if (query) notes = notes.filter(n => matchName(n.content as string, query));
      return { found: true, count: notes.length, notes };
    }

    // ---- Phase 2: 변경 제안 도구 ----

    case 'propose_attendance_change': {
      const studentName = (args.studentName as string) ?? '';
      const date = (args.date as string) || kstToday();
      const newStatus = (args.newStatus as string) ?? '';

      if (!studentName || !newStatus) return { error: '학생 이름과 변경할 상태는 필수입니다.' };

      const students = await fetchStudents(sb);
      const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
      if (matched.length === 0) return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다.` };
      if (matched.length > 1) {
        return { found: false, message: `'${studentName}'로 검색된 학생이 여러 명입니다: ${matched.map((s: Json) => s.name).join(', ')}. 더 구체적인 이름을 사용해 주세요.` };
      }

      const student = matched[0] as Json;
      const { data: attData, error: attErr } = await sb
        .from('growing_attendance').select('*')
        .eq('student_id', student.id).eq('date', date).maybeSingle();
      if (attErr) throw attErr;

      const newStatusKo = ATTENDANCE_KO[newStatus] ?? newStatus;

      if (!attData) {
        return {
          action_proposed: true,
          action: {
            type: 'create_attendance',
            student_id: student.id,
            student_name: student.name,
            date, old_status: '(기록없음)', new_status: newStatus,
          } satisfies CreateAttendanceAction,
          summary: `${student.name} 학생의 ${date} 출결 기록이 없어 ${newStatusKo}으로 새로 등록합니다.`,
        };
      }

      const oldStatus = attData.status as string;
      if (oldStatus === newStatus) {
        return { action_proposed: false, message: `${student.name} 학생의 ${date} 출결은 이미 '${ATTENDANCE_KO[oldStatus] ?? oldStatus}' 상태입니다.` };
      }

      return {
        action_proposed: true,
        action: {
          type: 'update_attendance',
          attendance_id: attData.id as string,
          student_name: norm(student.name),
          date, old_status: oldStatus, new_status: newStatus,
        } satisfies UpdateAttendanceAction,
        summary: `${student.name} 학생의 ${date} 출결을 '${ATTENDANCE_KO[oldStatus] ?? oldStatus}' → '${newStatusKo}'으로 변경 예정입니다.`,
      };
    }

    case 'propose_payment_change': {
      const studentName = (args.studentName as string) ?? '';
      const billingMonth = (args.billingMonth as string) || kstMonth();

      if (!studentName) return { error: '학생 이름은 필수입니다.' };

      const students = await fetchStudents(sb);
      const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
      if (matched.length === 0) return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다.` };
      if (matched.length > 1) {
        return { found: false, message: `'${studentName}'로 검색된 학생이 여러 명입니다: ${matched.map((s: Json) => s.name).join(', ')}. 더 구체적인 이름을 사용해 주세요.` };
      }

      const student = matched[0] as Json;
      const { data: payData, error: payErr } = await sb
        .from('growing_payments').select('*')
        .eq('student_id', student.id).eq('billing_month', billingMonth).eq('status', 'unpaid').maybeSingle();
      if (payErr) throw payErr;

      if (!payData) {
        return { action_proposed: false, message: `${student.name} 학생의 ${billingMonth} 미납 수납 기록을 찾지 못했습니다. 이미 완납 처리됐거나 청구 내역이 없을 수 있습니다.` };
      }

      return {
        action_proposed: true,
        action: {
          type: 'update_payment',
          payment_id: payData.id as string,
          student_name: norm(student.name),
          billing_month: billingMonth,
          amount: payData.amount as number,
        } satisfies UpdatePaymentAction,
        summary: `${student.name} 학생의 ${billingMonth} 수납 ${formatWon(payData.amount as number)}을 완납으로 처리 예정입니다.`,
      };
    }

    case 'propose_counsel_log': {
      const studentName = (args.studentName as string) ?? '';
      const logType = (args.logType as string) ?? 'counsel';
      const title = (args.title as string) ?? '';
      const content = (args.content as string) ?? '';
      const score = (args.score as string) ?? '';
      const date = (args.date as string) || kstToday();
      if (!studentName || !title || !content) return { error: '학생 이름·제목·본문은 필수입니다.' };

      const students = await fetchStudents(sb);
      const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
      if (matched.length === 0) return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다.` };
      if (matched.length > 1) {
        return { found: false, message: `'${studentName}'로 검색된 학생이 여러 명입니다: ${matched.map((s: Json) => s.name).join(', ')}. 더 구체적인 이름을 사용해 주세요.` };
      }
      const student = matched[0] as Json;
      const typeKo = logType === 'progress' ? '진도' : logType === 'test' ? '시험' : '상담';
      return {
        action_proposed: true,
        action: {
          type: 'create_counsel_log',
          student_id: student.id as string,
          student_name: norm(student.name),
          date, title, content, log_type: logType,
          ...(logType === 'test' && score ? { score } : {}),
        } satisfies CreateCounselLogAction,
        summary: `${student.name} 학생의 ${date} ${typeKo} 일지 '${title}'을(를) 새로 작성합니다.`,
      };
    }

    case 'propose_student_memo': {
      const studentName = (args.studentName as string) ?? '';
      const memo = (args.memo as string) ?? '';
      const mode = (args.mode as string) === 'replace' ? 'replace' : 'append';
      if (!studentName || !memo.trim()) return { error: '학생 이름과 메모 내용은 필수입니다.' };

      const students = await fetchStudents(sb);
      const matched = students.filter((s: Json) => matchName(norm(s.name), studentName));
      if (matched.length === 0) return { found: false, message: `'${studentName}' 학생을 찾지 못했습니다.` };
      if (matched.length > 1) {
        return { found: false, message: `'${studentName}'로 검색된 학생이 여러 명입니다: ${matched.map((s: Json) => s.name).join(', ')}. 더 구체적인 이름을 사용해 주세요.` };
      }
      const student = matched[0] as Json;
      const oldMemo = norm(student.memo);
      const newMemo = mode === 'replace'
        ? memo.trim()
        : (oldMemo ? `${oldMemo}\n${memo.trim()}` : memo.trim());
      return {
        action_proposed: true,
        action: {
          type: 'update_student_memo',
          student_id: student.id as string,
          student_name: norm(student.name),
          old_memo: oldMemo, new_memo: newMemo,
        } satisfies UpdateStudentMemoAction,
        summary: `${student.name} 학생의 메모를 ${mode === 'replace' ? '교체' : '추가'}합니다.`,
      };
    }

    case 'list_data_sources': {
      const { data, error } = await sb.rpc('growing_list_tables');
      if (error) throw error;
      const tableNames = ((data ?? []) as unknown[])
        .map(row => typeof row === 'string' ? row : norm((row as Json).table_name ?? (row as Json).table))
        .filter(Boolean);
      return {
        dataSources: tableNames.map(table => labelDataSource(table)),
        instruction: '사용자에게는 dataSources의 업무용 이름만 보여준다. 내부 테이블명은 노출하지 않는다.',
      };
    }

    case 'query_table': {
      const table = (args.table as string) ?? '';
      // growing_ 접두사만 허용 — 다른 앱 테이블/시스템 카탈로그 접근 차단.
      // 데이터 격리는 각 테이블의 RLS(로그인 원장 본인 데이터)로 추가 보장된다.
      if (!table.startsWith('growing_')) {
        return { error: "growing_ 로 시작하는 학원 테이블만 조회할 수 있습니다." };
      }
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const filterColumn = (args.filterColumn as string) ?? '';
      const filterValue = (args.filterValue as string) ?? '';
      let q = sb.from(table).select('*').limit(limit);
      if (filterColumn && filterValue) q = q.eq(filterColumn, filterValue);
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = (data ?? []) as Json[];
      // student_id가 들어 있으면 학생 이름을 덧붙여 가독성을 높인다(알림/로그 등).
      if (rows.some(r => 'student_id' in r && r.student_id)) {
        const students = await fetchStudents(sb);
        const nameById = new Map(students.map((s: Json) => [s.id, s.name]));
        rows = rows.map(r => ('student_id' in r && r.student_id)
          ? { ...r, student_name: nameById.get(r.student_id as string) ?? null }
          : r);
      }
      return { table, count: rows.length, rows };
    }

    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}

// =====================================================================
// execute_action: 승인된 action을 실제 DB에 반영
// =====================================================================
async function executeAction(sb: SupabaseClient, action: PendingAction): Promise<Json> {
  switch (action.type) {
    case 'update_attendance': {
      const { error } = await sb.from('growing_attendance').update({ status: action.new_status }).eq('id', action.attendance_id);
      if (error) throw error;
      const oldKo = ATTENDANCE_KO[action.old_status] ?? action.old_status;
      const newKo = ATTENDANCE_KO[action.new_status] ?? action.new_status;
      return { success: true, message: `${action.student_name} 학생의 ${action.date} 출결을 **${oldKo} → ${newKo}**으로 변경했습니다.` };
    }
    case 'create_attendance': {
      const { error } = await sb.from('growing_attendance').insert({ student_id: action.student_id, date: action.date, status: action.new_status });
      if (error) throw error;
      const newKo = ATTENDANCE_KO[action.new_status] ?? action.new_status;
      return { success: true, message: `${action.student_name} 학생의 ${action.date} 출결을 **${newKo}**으로 등록했습니다.` };
    }
    case 'update_payment': {
      const { error } = await sb.from('growing_payments').update({ status: 'paid', payment_date: kstToday() }).eq('id', action.payment_id);
      if (error) throw error;
      return { success: true, message: `${action.student_name} 학생의 ${action.billing_month} 수납 **${formatWon(action.amount)}** 완납 처리했습니다.` };
    }
    case 'create_counsel_log': {
      const { error } = await sb.from('growing_counsel_logs').insert({
        student_id: action.student_id,
        date: action.date,
        title: action.title,
        content: action.content,
        type: action.log_type,
        ...(action.score ? { score: action.score } : {}),
      });
      if (error) throw error;
      const typeKo = action.log_type === 'progress' ? '진도' : action.log_type === 'test' ? '시험' : '상담';
      return { success: true, message: `${action.student_name} 학생의 ${typeKo} 일지 **${action.title}**을(를) 저장했습니다.` };
    }
    case 'update_student_memo': {
      const { error } = await sb.from('growing_students').update({ memo: action.new_memo }).eq('id', action.student_id);
      if (error) throw error;
      return { success: true, message: `${action.student_name} 학생의 메모를 업데이트했습니다.` };
    }
    default:
      throw new Error('알 수 없는 action type입니다.');
  }
}

// =====================================================================
// 기억 조회 + 시스템 프롬프트
// =====================================================================

const ACADEMY_NOTES_CHAR_CAP = 1500;

async function fetchMemory(sb: SupabaseClient): Promise<string> {
  try {
    const [memRes, notesRes] = await Promise.all([
      sb.from('growing_assistant_memory').select('memory_text').maybeSingle(),
      sb.from('growing_assistant_notes')
        .select('category, content').eq('scope', 'academy')
        .order('created_at', { ascending: false }).limit(30),
    ]);
    const manual = (memRes.data?.memory_text as string | null) ?? '';
    const autoNotes = (notesRes.data ?? [])
      .map((r: Record<string, unknown>) => `[${r.category}] ${r.content}`)
      .join('\n');
    const combined = [manual.trim(), autoNotes.trim()].filter(Boolean).join('\n\n');
    return combined.slice(0, ACADEMY_NOTES_CHAR_CAP);
  } catch {
    return '';
  }
}

function systemPrompt(memory: string): string {
  const memorySection = memory.trim()
    ? `\n\n[원장님이 설정한 운영 기준 및 아이비가 학습한 원칙 — 반드시 따른다]\n${memory.trim()}`
    : '';
  return `당신은 '그로잉영어' 영어 교습소의 AI 운영 비서 '아이비(Ivy)'입니다.
오늘은 ${kstToday()} (${kstDayOfWeek()}요일)이며, 이번 달은 ${kstMonth()}입니다.
원장님을 도와 학생·출결·수납·상담 업무를 돕습니다. 스스로를 소개할 때는 아이비라고 합니다.

[원칙]
- 사용자를 직접 부를 일이 있으면 반드시 "지선쌤"이라고 부릅니다. "원장님"은 역할 설명이 필요할 때만 쓰고, 호칭으로는 쓰지 않습니다.
- 학원 데이터에 대한 질문은 반드시 제공된 도구로 실제 데이터를 조회한 뒤 답합니다. 절대 추측하거나 지어내지 않습니다.
- 도구 결과가 비어 있으면 해당 데이터가 없다고 솔직히 답합니다.
- 출결 변경·수납 처리·상담일지 작성·학생 메모 수정 같은 DB 변경 요청은 반드시 propose_attendance_change / propose_payment_change / propose_counsel_log / propose_student_memo 도구를 사용해 원장님의 승인을 구합니다. 직접 변경하지 않습니다.
- propose_* 도구가 action_proposed: true를 반환하면 "아래 내용으로 변경하시겠어요? 확인 버튼을 눌러 승인해 주세요."처럼 안내합니다.
- 데이터를 근거로 답할 때는 마지막에 어떤 자료를 봤는지 한 줄로 덧붙입니다(예: "(오늘 현황·이번 달 수납 기준)"). 여러 자료가 필요하면 한 번에 여러 도구를 호출해도 됩니다.
- 사용자에게 내부 구현명, DB 테이블명, 컬럼명, RPC 이름, 도구 이름을 그대로 노출하지 않습니다. 특히 list_data_sources 결과를 설명할 때는 "학생 정보", "출결 기록", "수납 기록"처럼 업무용 이름으로만 말합니다. 사용자가 개발자용 내부 이름을 명시적으로 요청한 경우에만 테이블명을 보여줍니다.
- "브리핑" 또는 "오늘 어때" 같은 요청에는 get_today_overview로 오늘 수업·출결·미납을 확인하고, 필요하면 출결 요약도 함께 본 뒤, 챙겨야 할 학생(잦은 결석·미납 등)을 짚어 간결한 아침 브리핑으로 정리합니다.
- 항상 한국어로 간결하고 정중하게(존댓말) 답하며, 금액은 천 단위 구분(예: 150,000원), 목록은 보기 좋게 정리합니다.
- 학부모에게 보낼 문구를 요청받으면 따뜻하고 정중한 안내문을 작성합니다.
- 대화에서 운영에 반복적으로 유용할 안정적 사실·선호를 알게 되면 remember_note로 간결히 저장합니다. 추측·일시적 정보·민감정보는 저장하지 않습니다.
- 학생 관련 질문에 답하기 전 과거 메모가 필요하다고 판단되면 recall_notes로 먼저 확인합니다.
- 전용 도구로 다루지 않는 데이터(키오스크 등하원 알림, 숙제 알림, 발송 로그, 설정, 이후 추가되는 기능 등)는 list_data_sources로 사용할 수 있는 테이블을 확인한 뒤 query_table로 직접 조회합니다.${memorySection}`;
}

// =====================================================================
// Gemini function-calling 루프
// =====================================================================
interface GeminiPart { text?: string; functionCall?: { name: string; args: Json }; functionResponse?: { name: string; response: Json } }
interface GeminiContent { role: string; parts: GeminiPart[] }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callGeminiRaw(contents: GeminiContent[], memory: string): Promise<GeminiContent> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 시크릿이 설정되지 않았습니다.');

  const modelChain = [MODELS.flash, MODELS.lite];
  let overloaded = false;

  for (const model of modelChain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt(memory) }] },
            contents,
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const content = data?.candidates?.[0]?.content;
        if (!content) throw new Error('Gemini 응답이 비어 있어요. 다시 한 번 말씀해 주시겠어요?');
        return content as GeminiContent;
      }

      const detail = await res.text();
      if (res.status === 503 || res.status === 429) {
        overloaded = true;
        if (attempt < 2) { await sleep(700 * attempt); continue; }
        break;
      }
      throw new Error(`Gemini 호출 실패 (${res.status}): ${detail.slice(0, 300)}`);
    }
  }

  if (overloaded) throw new Error('지금 AI 서버가 잠시 혼잡해요(일시적 과부하). 잠깐 뒤 다시 시도해 주세요. 🙏');
  throw new Error('AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
}

async function runAgent(
  sb: SupabaseClient,
  messages: ChatMessage[]
): Promise<{ reply: string; toolsUsed: string[]; action?: PendingAction }> {
  const memory = await fetchMemory(sb);

  const contents: GeminiContent[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const toolsUsed: string[] = [];
  let pendingAction: PendingAction | undefined;
  let dataSourceNames: string[] | null = null;

  for (let i = 0; i < 6; i++) {
    const content = await callGeminiRaw(contents, memory);
    const parts = content.parts ?? [];
    const calls = parts.filter(p => p.functionCall);

    if (calls.length === 0) {
      const text = parts.map(p => p.text ?? '').join('').trim();
      if (!text && dataSourceNames?.length) {
        return {
          reply: `지선쌤, 제가 읽을 수 있는 데이터는 아래와 같아요.\n\n${dataSourceNames.map(name => `- ${name}`).join('\n')}`,
          toolsUsed,
          action: pendingAction,
        };
      }
      return { reply: text || '죄송해요, 답변을 생성하지 못했어요.', toolsUsed, action: pendingAction };
    }

    contents.push({ role: 'model', parts });

    const responseParts: GeminiPart[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      toolsUsed.push(fc.name);
      let result: Json;
      try {
        result = await execTool(sb, fc.name, fc.args ?? {});
        if (fc.name === 'list_data_sources' && Array.isArray(result.dataSources)) {
          dataSourceNames = result.dataSources.map(item => String(item)).filter(Boolean);
        }
        if (result.action_proposed === true && result.action) {
          pendingAction = result.action as PendingAction;
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : '도구 실행 오류' };
      }
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return { reply: '요청이 너무 복잡해 처리하지 못했어요. 조금 더 구체적으로 말씀해 주시겠어요?', toolsUsed };
}

// =====================================================================
// HTTP 핸들러
// =====================================================================
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST 요청만 지원합니다.' }, 405);

  try {
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

    // execute_action 모드: action만 전달되면 직접 실행
    if (body?.action && !body?.messages) {
      const result = await executeAction(sb, body.action as PendingAction);
      return jsonResponse(result);
    }

    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) return jsonResponse({ error: '메시지가 비어 있습니다.' }, 400);

    const { reply, toolsUsed, action } = await runAgent(sb, messages);
    return jsonResponse({ reply, model: MODELS.flash, toolsUsed, action });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' }, 500);
  }
});
