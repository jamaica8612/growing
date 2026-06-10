import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kakao-skill-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SkillAction = 'connect_student' | 'attendance_today' | 'homework_today' | 'counsel_request' | 'ask_ai' | 'menu' | 'student_menu';

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
  status: 'present' | 'absent' | 'makeup' | 'supplement' | 'late';
  homework_status: 'done' | 'incomplete' | 'undone' | '' | null;
  check_in_time: string | null;
  check_out_time: string | null;
  makeup_for_date?: string | null;
  class_id?: string | null;
}

interface KakaoChannelRow {
  owner_id: string;
  enabled: boolean;
}

const statusLabel: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
  supplement: '보충',
  late: '지각',
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

interface QuickReplyDef {
  label: string;
  action: string;
  messageText?: string;
  studentId?: string;
}

function skillText(text: string, quickReplies: QuickReplyDef[] = []) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
      quickReplies: quickReplies.map(reply => ({
        label: reply.label,
        action: 'message',
        messageText: reply.messageText ?? reply.label,
        extra: reply.studentId
          ? { action: reply.action, student_id: reply.studentId }
          : { action: reply.action },
      })),
    },
  };
}

function makeMenuReplies(studentId?: string): QuickReplyDef[] {
  return [
    { label: '📅 오늘 출결', action: 'attendance_today', studentId },
    { label: '📝 숙제 확인', action: 'homework_today', studentId },
    { label: '🤖 아이비 질문', action: 'ask_ai', messageText: '아이비에게 질문', studentId },
    { label: '💬 상담 요청', action: 'counsel_request', studentId },
  ];
}

function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function kstToday(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function getAction(payload: KakaoSkillPayload): SkillAction {
  // Explicit action from button/block params
  const explicit =
    payload.action?.clientExtra?.action ||
    payload.action?.params?.action ||
    payload.intent?.name ||
    '';
  const ev = explicit.toLowerCase();
  if (ev.includes('connect') || ev.includes('연결')) return 'connect_student';
  if (ev.includes('attendance') || ev.includes('출결') || ev.includes('등원')) return 'attendance_today';
  if (ev.includes('homework') || ev.includes('숙제')) return 'homework_today';
  if (ev.includes('counsel') || ev.includes('상담')) return 'counsel_request';
  if (ev.includes('ask_ai') || ev.includes('아이비') || ev.includes('질문')) return 'ask_ai';
  if (ev.includes('student_menu')) return 'student_menu';

  // 자유 입력 텍스트 → 상담은 명시적 키워드만, 나머지는 AI로
  const utterance = (payload.userRequest?.utterance ?? '').trim();
  const uv = utterance.toLowerCase();
  if (uv === '상담' || uv === '상담 요청' || uv === '💬 상담 요청') return 'counsel_request';

  // 3자 초과 자유 입력은 AI로 라우팅 (출결/숙제 포함)
  const isMenuWord = ['메뉴', '처음', '시작', 'start', '안녕', '안녕하세요', '하이'].includes(uv);
  if (utterance.length > 3 && !isMenuWord) return 'ask_ai';

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

async function findActiveLinks(supabase: ReturnType<typeof createClient>, ownerId: string, kakaoUserKey: string): Promise<ParentLinkRow[]> {
  const { data, error } = await supabase
    .from('growing_kakao_parent_links')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .is('blocked_at', null);
  if (error) throw error;
  return (data ?? []) as ParentLinkRow[];
}

async function resolveChannel(supabase: ReturnType<typeof createClient>, skillSecret: string): Promise<{ ownerId: string; autoReply: boolean } | null> {
  if (!skillSecret) return null;
  const { data, error } = await supabase
    .from('growing_kakao_channels')
    .select('owner_id, enabled, auto_reply')
    .eq('skill_secret', skillSecret)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw error;
  const row = data as (KakaoChannelRow & { auto_reply: boolean | null }) | null;
  if (!row) return null;
  return { ownerId: row.owner_id, autoReply: row.auto_reply !== false };
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

// ── AI 질문 처리 ──────────────────────────────────────────────

async function buildStudentContext(
  supabase: ReturnType<typeof createClient>,
  studentId: string,
  ownerId: string,
  studentName: string,
): Promise<string> {
  const today = kstToday();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: records }, { data: classes }] = await Promise.all([
    supabase
      .from('growing_attendance')
      .select('date, status, homework_status, check_in_time, check_out_time, makeup_for_date, class_id')
      .eq('student_id', studentId)
      .gte('date', since)
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(60),
    supabase
      .from('growing_classes')
      .select('id, name')
      .eq('owner_id', ownerId)
      .contains('student_ids', [studentId]),
  ]);

  const rows = (records ?? []) as AttendanceRow[];
  const classMap = Object.fromEntries(
    ((classes ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
  );
  const classNames = Object.values(classMap).join(', ') || '미지정';

  // 최근 30일 출결 요약
  const recent30 = rows.slice(0, 30);
  const attendanceLines = recent30.map(r => {
    const st = statusLabel[r.status] ?? r.status;
    const hw = r.homework_status && r.homework_status !== ''
      ? ` 숙제:${homeworkLabel[r.homework_status] ?? r.homework_status}`
      : '';
    const time = (r.check_in_time || r.check_out_time)
      ? ` 등원:${r.check_in_time ?? '-'} 하원:${r.check_out_time ?? '-'}`
      : '';
    return `${r.date} ${st}${time}${hw}`;
  }).join('\n') || '기록 없음';

  // 숙제 통계
  const hwRows = recent30.filter(r => r.homework_status && r.homework_status !== '');
  const hwDone = hwRows.filter(r => r.homework_status === 'done').length;
  const hwIncomplete = hwRows.filter(r => r.homework_status === 'incomplete').length;
  const hwUndone = hwRows.filter(r => r.homework_status === 'undone').length;

  // 보강 현황
  const absences = rows.filter(r => r.status === 'absent').map(r => r.date);
  const completedMakeupDates = rows
    .filter(r => r.status === 'makeup' && r.makeup_for_date)
    .map(r => r.makeup_for_date!);
  const pendingAbsences = absences.filter(d => !completedMakeupDates.includes(d));
  const completedPairs = rows
    .filter(r => r.status === 'makeup' && r.makeup_for_date)
    .slice(0, 10)
    .map(r => `결석:${r.makeup_for_date} → 보강완료:${r.date}`);

  const pendingLines = pendingAbsences.length > 0
    ? pendingAbsences.map(d => `- ${d} 결석 (보강 미완료)`).join('\n')
    : '없음';
  const completedLines = completedPairs.length > 0
    ? completedPairs.map(p => `- ${p}`).join('\n')
    : '없음';

  return `학생: ${studentName}
수업 반: ${classNames}
기준일: ${today}

[최근 30일 출결]
${attendanceLines}

[숙제 (최근 30일 기록 ${hwRows.length}회)]
완료:${hwDone}회 미흡:${hwIncomplete}회 미제출:${hwUndone}회

[보강 현황]
미완료 보강 ${pendingAbsences.length}건:
${pendingLines}
완료된 보강 ${completedPairs.length}건:
${completedLines}`;
}

async function callGemini(apiKey: string, context: string, question: string): Promise<string> {
  const systemPrompt = `너는 그로잉영어 학원의 AI 비서 아이비야. 학부모가 카카오톡으로 자녀 학원 생활을 물어보면 따뜻하고 친절하게 답해줘.
아래 학생 데이터만 근거로 답하고, 데이터에 없는 내용은 "학원에 직접 문의해 주시면 자세히 안내해 드릴게요 😊"라고 해.
날짜 계산 시 기준일을 반드시 참고해서 '어제', '이번 달', '이번 주' 등을 정확히 계산해줘.
카카오톡 메시지이므로 답변은 200자 이내로 자연스럽게 써줘. 딱딱한 시스템 메시지 말투 금지.
학생 이름은 반드시 데이터에 명시된 정확한 이름 그대로 사용해. 유명인 이름과 비슷하더라도 절대 바꾸거나 수정하지 마.

${context}`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const headers = { 'Content-Type': 'application/json' };

  let res = await fetch(url, { method: 'POST', headers, body });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(url, { method: 'POST', headers, body });
  }
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || '죄송해요, 답변을 생성하지 못했습니다.';
}

// ─────────────────────────────────────────────────────────────

const MENU_REPLIES = makeMenuReplies();

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const skillSecret = getSkillSecret(req);
  const channel = await resolveChannel(supabase, skillSecret);
  if (!channel) {
    return jsonResponse({ error: 'Unauthorized channel' }, 401);
  }
  const channelOwnerId = channel.ownerId;
  const autoReply = channel.autoReply;

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

      const allLinks = await findActiveLinks(supabase, channelOwnerId, kakaoUserKey);
      let connectResponse;
      if (allLinks.length > 1) {
        const allStudents = await Promise.all(allLinks.map(l => getStudent(supabase, l.student_id)));
        const pickerReplies = allStudents
          .filter((s): s is StudentRow => s !== null)
          .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id }));
        connectResponse = skillText(`${student.name} 학생이 추가 연결되었습니다. 자녀를 선택해 주세요.`, pickerReplies);
      } else {
        connectResponse = skillText(`${student.name} 학생 보호자로 연결되었습니다.\n이제 출결 확인, 숙제 확인, 아이비 질문, 상담 요청을 이용할 수 있어요.`, makeMenuReplies(student.id));
      }
      await logEvent(supabase, payload, channelOwnerId, 'connect_success', connectResponse);
      return jsonResponse(connectResponse);
    }

    // 상담 요청은 학생 연결 없이도 가능
    if (action === 'counsel_request') {
      const rawMessage = getParam(payload, 'message', '문의내용') || payload.userRequest?.utterance || '';
      const isPlaceholder = !rawMessage || ['상담 요청', '💬 상담 요청'].includes(rawMessage.trim());

      if (isPlaceholder) {
        const response = skillText('어떤 내용으로 상담을 요청하시겠어요?\n간단히 입력해 주세요. 😊');
        await logEvent(supabase, payload, channelOwnerId, 'counsel_prompt', response);
        return jsonResponse(response);
      }

      const link = await findActiveLink(supabase, channelOwnerId, kakaoUserKey);
      const studentId = link?.student_id ?? null;
      const studentName = studentId ? (await getStudent(supabase, studentId))?.name ?? null : null;
      const ownerId = link?.owner_id ?? channelOwnerId;
      const confirmMsg = studentName
        ? `${studentName} 학생 상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.`
        : '상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.';

      await createParentRequest(supabase, ownerId, studentId, kakaoUserKey, 'counsel', rawMessage.trim(), payload);
      const response = skillText(confirmMsg, link ? MENU_REPLIES : [
        { label: '학생 연결', action: 'connect_student' },
        { label: '💬 상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, ownerId, 'counsel_queued', response);
      return jsonResponse(response);
    }

    const links = await findActiveLinks(supabase, channelOwnerId, kakaoUserKey);
    if (links.length === 0) {
      const response = skillText('안녕하세요! 그로잉영어입니다. 😊\n재원생 학부모님은 학생 연결 후 출결·숙제 확인을 이용하실 수 있어요.', [
        { label: '학생 연결', action: 'connect_student' },
        { label: '💬 상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, channelOwnerId, 'unverified', response);
      return jsonResponse(response);
    }

    const selectedStudentId = payload.action?.clientExtra?.student_id;

    // student_menu: 선택된 학생의 메뉴 표시
    if (action === 'student_menu') {
      const targetId = selectedStudentId ?? links[0].student_id;
      const targetStudent = await getStudent(supabase, targetId);
      if (!targetStudent) {
        const response = skillText('학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.');
        return jsonResponse(response);
      }
      const response = skillText(`${targetStudent.name} 학생, 무엇이 궁금하신가요?`, makeMenuReplies(targetId));
      await logEvent(supabase, payload, links[0].owner_id, 'student_menu', response);
      return jsonResponse(response);
    }

    // 2명 이상 연결이고 student_id 미지정 → 학생 선택 화면
    if (links.length > 1 && !selectedStudentId) {
      const allStudents = await Promise.all(links.map(l => getStudent(supabase, l.student_id)));
      const pickerReplies = allStudents
        .filter((s): s is StudentRow => s !== null)
        .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id }));
      const response = skillText('어떤 자녀에 대해 문의하시겠어요?', pickerReplies);
      await logEvent(supabase, payload, links[0].owner_id, 'student_picker', response);
      return jsonResponse(response);
    }

    const link = selectedStudentId
      ? (links.find(l => l.student_id === selectedStudentId) ?? links[0])
      : links[0];

    const student = await getStudent(supabase, link.student_id);
    if (!student) {
      const response = skillText('연결된 학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.');
      await logEvent(supabase, payload, link.owner_id, 'student_missing', response);
      return jsonResponse(response);
    }

    if (action === 'attendance_today') {
      if (!autoReply) {
        await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'attendance', '출결 확인 요청', payload);
        const response = skillText(`${student.name} 학생 출결 확인 요청을 접수했습니다.\n원장님이 확인 후 알려드리겠습니다.`, makeMenuReplies(student.id));
        await logEvent(supabase, payload, link.owner_id, 'attendance_queued', response);
        return jsonResponse(response);
      }
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
      const response = skillText(message, makeMenuReplies(student.id));
      await logEvent(supabase, payload, link.owner_id, 'attendance_ok', response);
      return jsonResponse(response);
    }

    if (action === 'homework_today') {
      if (!autoReply) {
        await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'homework', '숙제 확인 요청', payload);
        const response = skillText(`${student.name} 학생 숙제 확인 요청을 접수했습니다.\n원장님이 확인 후 알려드리겠습니다.`, makeMenuReplies(student.id));
        await logEvent(supabase, payload, link.owner_id, 'homework_queued', response);
        return jsonResponse(response);
      }
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
      const response = skillText(`${student.name} 학생의 오늘 숙제 상태는 ${homeworkLabel[homeworkStatus] ?? '기록 없음'}입니다.`, makeMenuReplies(student.id));
      await logEvent(supabase, payload, link.owner_id, 'homework_ok', response);
      return jsonResponse(response);
    }

    if (action === 'ask_ai') {
      const utterance = payload.userRequest?.utterance?.trim() ?? '';
      // 버튼 클릭으로 들어온 트리거 문구는 실제 질문이 아님 → 입력 유도
      const isTriggerPhrase = !utterance || ['아이비에게 질문', '아이비', '질문', 'ask_ai'].includes(utterance.toLowerCase());
      if (isTriggerPhrase) {
        const response = skillText(
          `${student.name} 학생에 대해 궁금한 점을 자유롭게 입력해 주세요.\n\n예) 이번 달 출결 어때요?\n예) 보강 몇 번 남았나요?\n예) 숙제 잘 하고 있나요?`,
        );
        await logEvent(supabase, payload, link.owner_id, 'ask_ai_prompt', response);
        return jsonResponse(response);
      }

      const geminiKey = Deno.env.get('GEMINI_API_KEY_CHATBOT') ?? Deno.env.get('GEMINI_API_KEY') ?? '';
      if (!geminiKey) {
        const response = skillText('AI 서비스가 아직 준비 중입니다. 학원에 직접 문의해 주세요.', makeMenuReplies(student.id));
        await logEvent(supabase, payload, link.owner_id, 'ask_ai_no_key', response);
        return jsonResponse(response);
      }

      let aiAnswer: string;
      try {
        const context = await buildStudentContext(supabase, student.id, link.owner_id, student.name);
        aiAnswer = await callGemini(geminiKey, context, utterance);
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : '';
        aiAnswer = '지금은 답변이 어려워요. 학원에 직접 문의해 주시면 친절히 안내해 드리겠습니다. 😊';
        await logEvent(supabase, payload, link.owner_id, `ask_ai_error:${msg.slice(0, 80)}`, skillText(aiAnswer, makeMenuReplies(student.id))).catch(() => {});
      }

      const response = skillText(aiAnswer, makeMenuReplies(student.id));
      await logEvent(supabase, payload, link.owner_id, 'ask_ai_ok', response);
      return jsonResponse(response);
    }

    const response = skillText('원하시는 메뉴를 선택해 주세요.', makeMenuReplies(student.id));
    await logEvent(supabase, payload, link.owner_id, 'menu', response);
    return jsonResponse(response);
  } catch (error) {
    const response = skillText('처리 중 오류가 발생했습니다. 학원으로 문의해 주세요.');
    await logEvent(supabase, payload, channelOwnerId, `error:${error instanceof Error ? error.message : 'unknown'}`, response).catch(() => {});
    return jsonResponse(response);
  }
});
