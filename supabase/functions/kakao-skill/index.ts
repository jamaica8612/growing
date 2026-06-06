import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kakao-skill-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SkillAction = 'connect_student' | 'attendance_today' | 'homework_today' | 'counsel_request' | 'menu';

interface KakaoSkillPayload {
  intent?: { name?: string };
  action?: {
    params?: Record<string, string>;
    clientExtra?: Record<string, string>;
  };
  userRequest?: {
    utterance?: string;
    user?: {
      id?: string;
      properties?: {
        plusfriendUserKey?: string;
        isFriend?: boolean;
      };
    };
  };
}

interface StudentRow {
  id: string;
  name: string;
  parent_contact: string | null;
  status: string;
}

interface ParentLinkRow {
  id: string;
  owner_id: string;
  student_id: string;
  kakao_user_key: string;
  plusfriend_user_key: string;
  blocked_at: string | null;
}

interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: 'present' | 'absent' | 'makeup';
  homework_status: 'done' | 'incomplete' | 'undone' | '' | null;
  check_in_time: string | null;
  check_out_time: string | null;
}

interface KakaoChannelRow {
  owner_id: string;
  enabled: boolean;
}

const statusLabel: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
};

const homeworkLabel: Record<string, string> = {
  done: '완료',
  incomplete: '미흡',
  undone: '미제출',
  '': '기록 없음',
};

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

function getSkillSecret(req: Request): string {
  const url = new URL(req.url);
  return (
    req.headers.get('x-kakao-skill-secret') ||
    url.searchParams.get('secret') ||
    url.searchParams.get('skill_secret') ||
    ''
  );
}

function skillText(text: string, quickReplies: { label: string; action: SkillAction; messageText?: string }[] = []) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
      quickReplies: quickReplies.map(reply => ({
        label: reply.label,
        action: 'message',
        messageText: reply.messageText ?? reply.label,
        extra: { action: reply.action },
      })),
    },
  };
}

function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function kstToday(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function getAction(payload: KakaoSkillPayload): SkillAction {
  const raw =
    payload.action?.clientExtra?.action ||
    payload.action?.params?.action ||
    payload.intent?.name ||
    payload.userRequest?.utterance ||
    '';
  const value = raw.toLowerCase();
  if (value.includes('connect') || value.includes('연결')) return 'connect_student';
  if (value.includes('attendance') || value.includes('출결') || value.includes('등원')) return 'attendance_today';
  if (value.includes('homework') || value.includes('숙제')) return 'homework_today';
  if (value.includes('counsel') || value.includes('상담')) return 'counsel_request';
  return 'menu';
}

function getParam(payload: KakaoSkillPayload, ...keys: string[]): string {
  for (const key of keys) {
    const fromParams = payload.action?.params?.[key];
    if (fromParams) return String(fromParams).trim();
    const fromExtra = payload.action?.clientExtra?.[key];
    if (fromExtra) return String(fromExtra).trim();
  }
  return '';
}

function parseConnectInput(payload: KakaoSkillPayload) {
  const studentName = getParam(payload, 'studentName', 'student_name', 'name', '학생명');
  const phone = cleanPhone(getParam(payload, 'phone', 'parentPhone', 'parent_phone', '전화번호'));
  if (studentName && phone) return { studentName, phone };

  const utterance = payload.userRequest?.utterance ?? '';
  const phoneMatch = utterance.match(/(\d{4}|\d{10,11})/);
  const fallbackPhone = phoneMatch ? cleanPhone(phoneMatch[1]) : phone;
  const fallbackName = studentName || utterance.replace(phoneMatch?.[1] ?? '', '').replace(/학생|연결|전화|번호|휴대폰/g, '').trim();
  return { studentName: fallbackName, phone: fallbackPhone };
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  payload: KakaoSkillPayload,
  ownerId: string | null,
  status: string,
  responseBody: unknown,
) {
  const user = payload.userRequest?.user;
  await supabase.from('growing_kakao_events').insert({
    owner_id: ownerId,
    kakao_user_key: user?.id ?? '',
    plusfriend_user_key: user?.properties?.plusfriendUserKey ?? null,
    event_type: 'skill',
    intent: getAction(payload),
    status,
    raw_payload: payload,
    response_body: responseBody,
  });
}

async function findActiveLink(supabase: ReturnType<typeof createClient>, ownerId: string, kakaoUserKey: string): Promise<ParentLinkRow | null> {
  const { data, error } = await supabase
    .from('growing_kakao_parent_links')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .is('blocked_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ParentLinkRow | null;
}

async function resolveChannelOwner(supabase: ReturnType<typeof createClient>, skillSecret: string): Promise<string | null> {
  if (!skillSecret) return null;
  const { data, error } = await supabase
    .from('growing_kakao_channels')
    .select('owner_id, enabled')
    .eq('skill_secret', skillSecret)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw error;
  return (data as KakaoChannelRow | null)?.owner_id ?? null;
}

async function getStudent(supabase: ReturnType<typeof createClient>, studentId: string): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('growing_students')
    .select('id, name, parent_contact, status')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data as StudentRow | null;
}

async function createParentRequest(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  studentId: string | null,
  kakaoUserKey: string,
  requestType: 'attendance' | 'homework' | 'counsel' | 'connect',
  message: string,
  payload: KakaoSkillPayload,
) {
  await supabase.from('growing_parent_requests').insert({
    owner_id: ownerId,
    student_id: studentId,
    kakao_user_key: kakaoUserKey,
    request_type: requestType,
    message,
    raw_payload: payload,
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const skillSecret = getSkillSecret(req);
  const channelOwnerId = await resolveChannelOwner(supabase, skillSecret);
  if (!channelOwnerId) {
    return jsonResponse({ error: 'Unauthorized channel' }, 401);
  }

  let payload: KakaoSkillPayload;

  try {
    payload = await req.json();
  } catch {
    return jsonResponse(skillText('요청 형식이 올바르지 않습니다. 학원으로 문의해 주세요.'), 400);
  }

  const action = getAction(payload);
  const kakaoUserKey = payload.userRequest?.user?.id ?? '';
  const plusfriendUserKey = payload.userRequest?.user?.properties?.plusfriendUserKey ?? '';

  if (!kakaoUserKey) {
    const response = skillText('카카오 사용자 정보를 확인할 수 없습니다. 채널 채팅방에서 다시 시도해 주세요.');
    await logEvent(supabase, payload, channelOwnerId, 'missing_user', response);
    return jsonResponse(response);
  }

  try {
    if (action === 'connect_student') {
      const { studentName, phone } = parseConnectInput(payload);
      if (!studentName || !phone) {
        const response = skillText('학생 연결을 위해 학생 이름과 보호자 휴대폰 뒤 4자리를 함께 입력해 주세요.\n예: 김서윤 1234');
        await logEvent(supabase, payload, channelOwnerId, 'connect_need_info', response);
        return jsonResponse(response);
      }

      const { data: students, error } = await supabase
        .from('growing_students')
        .select('id, name, parent_contact, status')
        .eq('owner_id', channelOwnerId)
        .ilike('name', `%${studentName}%`)
        .eq('status', 'active');
      if (error) throw error;

      const matches = ((students ?? []) as StudentRow[]).filter(student => {
        const storedPhone = cleanPhone(student.parent_contact ?? '');
        return storedPhone.endsWith(phone) || (phone.length >= 10 && phone.endsWith(storedPhone));
      });

      if (matches.length !== 1) {
        const response = skillText('입력한 학생 정보와 보호자 번호가 일치하지 않습니다. 학원에 문의해 주세요.');
        await createParentRequest(supabase, channelOwnerId, null, kakaoUserKey, 'connect', `학생 연결 실패: ${studentName} / ${phone}`, payload);
        await logEvent(supabase, payload, channelOwnerId, 'connect_failed', response);
        return jsonResponse(response);
      }

      const student = matches[0];
      await supabase.from('growing_kakao_parent_links').upsert({
        owner_id: channelOwnerId,
        student_id: student.id,
        kakao_user_key: kakaoUserKey,
        plusfriend_user_key: plusfriendUserKey,
        parent_phone: cleanPhone(student.parent_contact ?? ''),
        verified_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        blocked_at: null,
      }, { onConflict: 'owner_id,kakao_user_key,student_id' });

      const response = skillText(`${student.name} 학생 보호자로 연결되었습니다.\n이제 오늘 출결 확인, 숙제 확인, 상담 요청을 이용할 수 있어요.`, [
        { label: '오늘 출결 확인', action: 'attendance_today' },
        { label: '숙제 확인', action: 'homework_today' },
        { label: '상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, channelOwnerId, 'connect_success', response);
      return jsonResponse(response);
    }

    const link = await findActiveLink(supabase, channelOwnerId, kakaoUserKey);
    if (!link) {
      const response = skillText('먼저 학생 연결이 필요합니다.\n학생 이름과 보호자 휴대폰 뒤 4자리를 입력해 주세요.\n예: 김서윤 1234', [
        { label: '학생 연결', action: 'connect_student' },
      ]);
      await logEvent(supabase, payload, channelOwnerId, 'unverified', response);
      return jsonResponse(response);
    }

    const student = await getStudent(supabase, link.student_id);
    if (!student) {
      const response = skillText('연결된 학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.');
      await logEvent(supabase, payload, link.owner_id, 'student_missing', response);
      return jsonResponse(response);
    }

    if (action === 'attendance_today') {
      const today = kstToday();
      const { data, error } = await supabase
        .from('growing_attendance')
        .select('id, student_id, date, status, homework_status, check_in_time, check_out_time')
        .eq('student_id', student.id)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const attendance = data as AttendanceRow | null;
      const message = attendance
        ? `${student.name} 학생의 오늘 출결은 ${statusLabel[attendance.status] ?? attendance.status}입니다.\n등원: ${attendance.check_in_time ?? '기록 없음'}\n하원: ${attendance.check_out_time ?? '기록 없음'}`
        : `${student.name} 학생의 오늘 출결 기록은 아직 없습니다.`;
      await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'attendance', '오늘 출결 확인', payload);
      const response = skillText(message, [
        { label: '숙제 확인', action: 'homework_today' },
        { label: '상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, link.owner_id, 'attendance_ok', response);
      return jsonResponse(response);
    }

    if (action === 'homework_today') {
      const today = kstToday();
      const { data, error } = await supabase
        .from('growing_attendance')
        .select('id, student_id, date, status, homework_status, check_in_time, check_out_time')
        .eq('student_id', student.id)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const attendance = data as AttendanceRow | null;
      const homeworkStatus = attendance?.homework_status ?? '';
      await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'homework', '오늘 숙제 확인', payload);
      const response = skillText(`${student.name} 학생의 오늘 숙제 상태는 ${homeworkLabel[homeworkStatus] ?? '기록 없음'}입니다.`, [
        { label: '오늘 출결 확인', action: 'attendance_today' },
        { label: '상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, link.owner_id, 'homework_ok', response);
      return jsonResponse(response);
    }

    if (action === 'counsel_request') {
      const message = payload.userRequest?.utterance || getParam(payload, 'message', '문의내용') || '상담 요청';
      await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'counsel', message, payload);
      const response = skillText(`${student.name} 학생 상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.`, [
        { label: '오늘 출결 확인', action: 'attendance_today' },
        { label: '숙제 확인', action: 'homework_today' },
      ]);
      await logEvent(supabase, payload, link.owner_id, 'counsel_queued', response);
      return jsonResponse(response);
    }

    const response = skillText('원하시는 메뉴를 선택해 주세요.', [
      { label: '오늘 출결 확인', action: 'attendance_today' },
      { label: '숙제 확인', action: 'homework_today' },
      { label: '상담 요청', action: 'counsel_request' },
    ]);
    await logEvent(supabase, payload, link.owner_id, 'menu', response);
    return jsonResponse(response);
  } catch (error) {
    const response = skillText('처리 중 오류가 발생했습니다. 학원으로 문의해 주세요.');
    await logEvent(supabase, payload, channelOwnerId, `error:${error instanceof Error ? error.message : 'unknown'}`, response).catch(() => {});
    return jsonResponse(response, 500);
  }
});
