import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.4';
import {
  type KakaoSkillPayload,
  type QuickReplyDef,
  cleanPhone,
  extractPhone,
  getAction,
  getParam,
  isCounselPlaceholder,
  kstToday,
  makeMenuReplies,
  parseConnectInput,
  skillText,
} from './logic.ts';
import {
  createPushAuthHeaders,
  isPushInternalSecretConfigured,
} from '../_shared/push-auth.ts';
import { getHolidayForDate, getScheduleInfo } from './holiday-calendar.ts';

// The Edge Function intentionally uses the dynamic database shape. Supabase's
// generic factory must be instantiated before ReturnType is taken, otherwise
// newer TypeScript versions collapse every table operation to `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kakao-skill-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SCHEDULE_RESPONSE_TIMEOUT_MS = 2_500;
const SCHEDULE_UNAVAILABLE_MESSAGE = '일정 확인이 잠시 지연되고 있습니다. 잠시 후 다시 질문해 주세요.';

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

async function logEvent(
  supabase: UntypedSupabaseClient,
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

async function findActiveLinks(supabase: UntypedSupabaseClient, ownerId: string, kakaoUserKey: string): Promise<ParentLinkRow[]> {
  const { data, error } = await supabase
    .from('growing_kakao_parent_links')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .is('blocked_at', null);
  if (error) throw error;
  return (data ?? []) as ParentLinkRow[];
}

async function resolveChannel(supabase: UntypedSupabaseClient, skillSecret: string): Promise<{ ownerId: string; autoReply: boolean } | null> {
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

async function getStudent(supabase: UntypedSupabaseClient, studentId: string): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('growing_students')
    .select('id, name, parent_contact, status')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data as StudentRow | null;
}

async function createParentRequest(
  supabase: UntypedSupabaseClient,
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
  supabase: UntypedSupabaseClient,
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
    const hw = r.homework_status
      ? ` 숙제:${homeworkLabel[r.homework_status] ?? r.homework_status}`
      : '';
    const time = (r.check_in_time || r.check_out_time)
      ? ` 등원:${r.check_in_time ?? '-'} 하원:${r.check_out_time ?? '-'}`
      : '';
    return `${r.date} ${st}${time}${hw}`;
  }).join('\n') || '기록 없음';

  // 숙제 통계
  const hwRows = recent30.filter(r => r.homework_status);
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

/** 직전 응답이 상담 사유 입력 안내였는지 (10분 이내) */
async function wasRecentlyPromptedForCounsel(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  kakaoUserKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('growing_kakao_events')
    .select('status, created_at')
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { status: string; created_at: string } | null;
  if (!row || row.status !== 'counsel_prompt') return false;
  return Date.now() - new Date(row.created_at).getTime() < 10 * 60 * 1000;
}

async function sendPushToOwner(
  callerOwnerId: string,
  recipientOwnerId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    if (callerOwnerId !== recipientOwnerId) {
      console.error('Counsel push blocked: caller and recipient owners do not match');
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const internalSecret = Deno.env.get('PUSH_INTERNAL_SECRET');
    if (!supabaseUrl || !isPushInternalSecretConfigured(internalSecret)) {
      console.error('Counsel push skipped: PUSH_INTERNAL_SECRET must be at least 32 bytes');
      return;
    }

    const rawBody = JSON.stringify({ owner_id: recipientOwnerId, title, body, tag: 'counsel' });
    const authHeaders = await createPushAuthHeaders({
      secret: internalSecret,
      ownerId: callerOwnerId,
      rawBody,
    });
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: rawBody,
    });
    if (!response.ok && response.status !== 204) {
      console.error(`Counsel push failed with status ${response.status}`);
    }
  } catch (error) {
    console.error('Counsel push failed', error);
    // push failures must never interrupt the main response
  }
}

async function withResponseTimeout<T>(task: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guardedTask = task.catch(error => {
    console.error('Kakao schedule lookup failed', error);
    return fallback;
  });
  const deadline = new Promise<T>(resolve => {
    timeout = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([guardedTask, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function runInBackground(task: Promise<unknown>, label: string): void {
  const guardedTask = task.catch(error => console.error(`${label} failed`, error));
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(guardedTask);
  else void guardedTask;
}

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

  let action = getAction(payload);
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
      const { error: upsertError } = await supabase.from('growing_kakao_parent_links').upsert({
        owner_id: channelOwnerId,
        student_id: student.id,
        kakao_user_key: kakaoUserKey,
        plusfriend_user_key: plusfriendUserKey,
        parent_phone: cleanPhone(student.parent_contact ?? ''),
        verified_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        blocked_at: null,
      }, { onConflict: 'owner_id,kakao_user_key,student_id' });
      if (upsertError) throw upsertError;

      const allLinks = await findActiveLinks(supabase, channelOwnerId, kakaoUserKey);
      let connectResponse;
      if (allLinks.length > 1) {
        const allStudents = await Promise.all(allLinks.map(l => getStudent(supabase, l.student_id)));
        const pickerReplies = allStudents
          .filter((s): s is StudentRow => s !== null)
          .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id }));
        connectResponse = skillText(`${student.name} 학생이 추가 연결되었습니다. 자녀를 선택해 주세요.`, pickerReplies);
      } else {
        connectResponse = skillText(`${student.name} 학생 보호자로 연결되었습니다.\n이제 출결 확인, 숙제 확인, 아이비 질문, 상담 요청을 이용할 수 있어요.`, makeMenuReplies(student.id, allLinks.length > 1));
      }
      await logEvent(supabase, payload, channelOwnerId, 'connect_success', connectResponse);
      return jsonResponse(connectResponse);
    }

    // 휴강 일정은 학생 연결 여부와 관계없이 학원 설정을 기준으로 안내한다.
    // 카카오 스킬의 5초 제한을 위해 링크 조회를 생략하고 이벤트 기록은 백그라운드로 보낸다.
    if (action === 'schedule_info') {
      const utterance = payload.userRequest?.utterance?.trim() ?? '';
      const { message } = await withResponseTimeout(
        getScheduleInfo(supabase, channelOwnerId, utterance),
        { message: SCHEDULE_UNAVAILABLE_MESSAGE },
        SCHEDULE_RESPONSE_TIMEOUT_MS,
      );
      const response = skillText(message, [
        { label: '📅 휴강일 안내', action: 'schedule_info' },
        { label: '학생 연결', action: 'connect_student' },
        { label: '💬 상담 요청', action: 'counsel_request' },
      ]);
      runInBackground(logEvent(supabase, payload, channelOwnerId, 'schedule_info', response), 'Kakao schedule event log');
      return jsonResponse(response);
    }

    // 링크 전체 조회 (counsel_request 포함 이후 모든 핸들러에서 사용)
    const links = await findActiveLinks(supabase, channelOwnerId, kakaoUserKey);

    // 직전에 상담 사유 입력을 안내했다면, '상담' 키워드가 없는 자유 입력도 상담 접수로 처리
    if (action === 'ask_ai' && await wasRecentlyPromptedForCounsel(supabase, channelOwnerId, kakaoUserKey)) {
      action = 'counsel_request';
    }

    // 보안: clientExtra의 student_id가 이 부모의 링크에 없으면 무시
    const rawSelectedId = payload.action?.clientExtra?.student_id;
    const selectedStudentId = rawSelectedId && links.some(l => l.student_id === rawSelectedId)
      ? rawSelectedId : undefined;

    // 상담 요청은 학생 연결 없이도 가능
    if (action === 'counsel_request') {
      const rawMessage = getParam(payload, 'message', '문의내용') || payload.userRequest?.utterance || '';
      const isNewInquiry = links.length === 0;

      if (isCounselPlaceholder(rawMessage)) {
        const promptText = isNewInquiry
          ? '어떤 내용으로 상담을 요청하시겠어요?\n연락 가능한 전화번호도 함께 남겨주세요 😊\n\n예: 입학 문의드려요. 010-1234-5678'
          : '어떤 내용으로 상담을 요청하시겠어요?\n간단히 입력해 주세요. 😊';
        const response = skillText(promptText);
        await logEvent(supabase, payload, channelOwnerId, 'counsel_prompt', response);
        return jsonResponse(response);
      }

      const counselStudentId = selectedStudentId ?? links[0]?.student_id ?? null;
      const counselStudentName = counselStudentId
        ? (await getStudent(supabase, counselStudentId))?.name ?? null : null;
      const ownerId = links[0]?.owner_id ?? channelOwnerId;

      // 신규 문의: 메시지에서 전화번호 추출해 함께 저장
      const phone = isNewInquiry ? extractPhone(rawMessage) : '';
      const savedMessage = phone
        ? `[연락처: ${phone}] ${rawMessage.trim()}`
        : rawMessage.trim();

      const confirmMsg = counselStudentName
        ? `${counselStudentName} 학생 상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.`
        : phone
          ? `상담 요청이 접수되었습니다.\n원장님이 ${phone}으로 연락드리겠습니다.`
          : '상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.';

      await createParentRequest(supabase, ownerId, counselStudentId, kakaoUserKey, 'counsel', savedMessage, payload);
      const counselMenuReplies = links.length > 0
        ? makeMenuReplies(counselStudentId ?? undefined, links.length > 1)
        : [
          { label: '📅 휴강일 안내', action: 'schedule_info' },
          { label: '학생 연결', action: 'connect_student' },
          { label: '💬 상담 요청', action: 'counsel_request' },
        ];
      const response = skillText(confirmMsg, counselMenuReplies);
      await logEvent(supabase, payload, ownerId, 'counsel_queued', response);

      // 원장님 폰 푸시 알림 (실패해도 응답에 영향 없음)
      const pushTitle = counselStudentName ? `${counselStudentName} 상담 요청` : isNewInquiry ? '신규 상담 문의' : '카카오 상담 요청';
      void sendPushToOwner(channelOwnerId, ownerId, pushTitle, savedMessage.slice(0, 100));

      return jsonResponse(response);
    }

    if (links.length === 0) {
      // 자유 텍스트 입력이면 상담으로 자동 접수
      if (action === 'ask_ai') {
        const rawMessage = payload.userRequest?.utterance?.trim() ?? '';
        if (rawMessage) {
          const phone = extractPhone(rawMessage);
          const savedMessage = phone ? `[연락처: ${phone}] ${rawMessage}` : rawMessage;
          await createParentRequest(supabase, channelOwnerId, null, kakaoUserKey, 'counsel', savedMessage, payload);
          const confirmText = phone
            ? `상담 요청이 접수되었습니다.\n원장님이 ${phone}으로 연락드리겠습니다.`
            : '상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.\n\n연락처를 남겨주시면 더 빨리 연락드릴 수 있어요 😊';
          const response = skillText(confirmText, [
            { label: '📅 휴강일 안내', action: 'schedule_info' },
            { label: '학생 연결', action: 'connect_student' },
            { label: '💬 상담 요청', action: 'counsel_request' },
          ]);
          await logEvent(supabase, payload, channelOwnerId, 'counsel_queued_unlinked', response);
          void sendPushToOwner(channelOwnerId, channelOwnerId, '신규 상담 문의', savedMessage.slice(0, 100));
          return jsonResponse(response);
        }
      }
      const response = skillText('안녕하세요! 그로잉영어입니다. 😊\n\n카카오톡 하나로 이런 게 다 돼요! 👇\n✅ 휴강일과 공휴일 수업 일정 확인\n✅ 오늘 우리 아이 출석했는지 바로 확인\n✅ 숙제 했는지 실시간 체크\n✅ "이번 달 결석 몇 번이에요?" "보강 남은 거 있어요?" — AI가 24시간 답변\n✅ 상담 요청도 한 번에\n\n재원생 학부모님은 학생 연결 후 바로 이용하세요.\n입학 문의는 상담 요청 버튼을 눌러주세요! 🙌', [
        { label: '📅 휴강일 안내', action: 'schedule_info' },
        { label: '학생 연결', action: 'connect_student' },
        { label: '💬 상담 요청', action: 'counsel_request' },
      ]);
      await logEvent(supabase, payload, channelOwnerId, 'unverified', response);
      return jsonResponse(response);
    }

    // student_menu: 선택된 학생의 메뉴 표시
    if (action === 'student_menu') {
      const targetId = selectedStudentId ?? links[0].student_id;
      const targetStudent = await getStudent(supabase, targetId);
      if (!targetStudent) {
        const response = skillText('학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.');
        return jsonResponse(response);
      }
      const menuReplies: QuickReplyDef[] = [
        ...makeMenuReplies(targetId, links.length > 1),
        { label: '🔗 연결 해제', action: 'unlink_student', studentId: targetId },
      ];
      const response = skillText(`${targetStudent.name} 학생, 무엇이 궁금하신가요?`, menuReplies);
      return jsonResponse(response);
    }

    // 2명 이상 연결이고 student_id 미지정 → 학생 선택 화면
    if (links.length > 1 && !selectedStudentId) {
      const allStudents = await Promise.all(links.map(l => getStudent(supabase, l.student_id)));
      const pickerReplies: QuickReplyDef[] = [
        ...allStudents
          .filter((s): s is StudentRow => s !== null)
          .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id })),
        { label: '➕ 학생 추가 연결', action: 'connect_student' },
      ];
      const response = skillText('어떤 자녀에 대해 문의하시겠어요?', pickerReplies);
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

    if (action === 'unlink_student') {
      await supabase
        .from('growing_kakao_parent_links')
        .update({ blocked_at: new Date().toISOString() })
        .eq('owner_id', channelOwnerId)
        .eq('kakao_user_key', kakaoUserKey)
        .eq('student_id', student.id);

      const remainingLinks = links.filter(l => l.student_id !== student.id);
      let unlinkResponse;
      if (remainingLinks.length === 0) {
        unlinkResponse = skillText(`${student.name} 학생 연결을 해제했습니다.`, [
          { label: '📅 휴강일 안내', action: 'schedule_info' },
          { label: '학생 연결', action: 'connect_student' },
          { label: '💬 상담 요청', action: 'counsel_request' },
        ]);
      } else if (remainingLinks.length === 1) {
        unlinkResponse = skillText(
          `${student.name} 학생 연결을 해제했습니다.`,
          makeMenuReplies(remainingLinks[0].student_id, false),
        );
      } else {
        const remainStudents = await Promise.all(remainingLinks.map(l => getStudent(supabase, l.student_id)));
        const pickerReplies: QuickReplyDef[] = remainStudents
          .filter((s): s is StudentRow => s !== null)
          .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id }));
        unlinkResponse = skillText(`${student.name} 학생 연결을 해제했습니다. 자녀를 선택해 주세요.`, pickerReplies);
      }
      await logEvent(supabase, payload, link.owner_id, 'unlink_student', unlinkResponse);
      return jsonResponse(unlinkResponse);
    }

    if (action === 'attendance_today') {
      const today = kstToday();
      const holiday = await getHolidayForDate(supabase, link.owner_id, today);
      if (holiday.isClosed) {
        const response = skillText(
          `오늘은 ${holiday.name}로 휴강입니다.\n${student.name} 학생의 출결을 따로 확인하지 않으셔도 됩니다.`,
          makeMenuReplies(student.id, links.length > 1),
        );
        await logEvent(supabase, payload, link.owner_id, 'attendance_holiday', response);
        return jsonResponse(response);
      }
      if (!autoReply) {
        await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'attendance', '출결 확인 요청', payload);
        const response = skillText(`${student.name} 학생 출결 확인 요청을 접수했습니다.\n원장님이 확인 후 알려드리겠습니다.`, makeMenuReplies(student.id, links.length > 1));
        await logEvent(supabase, payload, link.owner_id, 'attendance_queued', response);
        return jsonResponse(response);
      }
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
      const response = skillText(message, makeMenuReplies(student.id, links.length > 1));
      return jsonResponse(response);
    }

    if (action === 'homework_today') {
      if (!autoReply) {
        await createParentRequest(supabase, link.owner_id, student.id, kakaoUserKey, 'homework', '숙제 확인 요청', payload);
        const response = skillText(`${student.name} 학생 숙제 확인 요청을 접수했습니다.\n원장님이 확인 후 알려드리겠습니다.`, makeMenuReplies(student.id, links.length > 1));
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
      let hwMessage: string;
      if (!attendance) {
        hwMessage = `${student.name} 학생의 오늘 출결 기록이 없어 숙제 상태를 확인할 수 없습니다.`;
      } else if (!attendance.homework_status) {
        hwMessage = `${student.name} 학생의 오늘 숙제 상태가 아직 기록되지 않았습니다.`;
      } else {
        hwMessage = `${student.name} 학생의 오늘 숙제 상태는 ${homeworkLabel[attendance.homework_status] ?? attendance.homework_status}입니다.`;
      }
      const response = skillText(hwMessage, makeMenuReplies(student.id, links.length > 1));
      return jsonResponse(response);
    }

    if (action === 'ask_ai') {
      const utterance = payload.userRequest?.utterance?.trim() ?? '';
      // 버튼 클릭으로 들어온 트리거 문구는 실제 질문이 아님 → 입력 유도
      const isTriggerPhrase = !utterance || ['아이비에게 질문', '아이비', '질문', 'ask_ai'].includes(utterance.toLowerCase());
      if (isTriggerPhrase) {
        const response = skillText(
          `${student.name} 학생에 대해 궁금한 점을 자유롭게 입력해 주세요.\n\n예) 이번 달 출결 어때요?\n예) 보강 몇 번 남았나요?\n예) 숙제 잘 하고 있나요?`,
          [{ label: '◀️ 메뉴로', action: 'student_menu', studentId: student.id }],
        );
        return jsonResponse(response);
      }

      const geminiKey = Deno.env.get('GEMINI_API_KEY_CHATBOT') ?? Deno.env.get('GEMINI_API_KEY') ?? '';
      if (!geminiKey) {
        const response = skillText('AI 서비스가 아직 준비 중입니다. 학원에 직접 문의해 주세요.', makeMenuReplies(student.id, links.length > 1));
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
        const errResponse = skillText(aiAnswer, makeMenuReplies(student.id, links.length > 1));
        await logEvent(supabase, payload, link.owner_id, `ask_ai_error:${msg.slice(0, 80)}`, errResponse).catch(() => {});
        return jsonResponse(errResponse);
      }

      const response = skillText(aiAnswer, makeMenuReplies(student.id, links.length > 1));
      return jsonResponse(response);
    }

    const response = skillText('원하시는 메뉴를 선택해 주세요.', makeMenuReplies(student.id, links.length > 1));
    return jsonResponse(response);
  } catch (error) {
    const response = skillText('처리 중 오류가 발생했습니다. 학원으로 문의해 주세요.');
    await logEvent(supabase, payload, channelOwnerId, `error:${error instanceof Error ? error.message : 'unknown'}`, response).catch(() => {});
    return jsonResponse(response);
  }
});
