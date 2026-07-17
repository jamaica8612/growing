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
import {
  CONNECT_ATTEMPT_LIMIT,
  CONNECT_ATTEMPT_WINDOW_MS,
  getKakaoAppUserId,
  normalizeConnectCredentials,
  readKakaoSkillPayload,
  safeEventStatus,
  sha256Hex,
} from './security.ts';

// The Edge Function intentionally uses the dynamic database shape. Supabase's
// generic factory must be instantiated before ReturnType is taken, otherwise
// newer TypeScript versions collapse every table operation to `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kakao-skill-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responseSecurityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const SCHEDULE_RESPONSE_TIMEOUT_MS = 2_500;
const KAKAO_GLOBAL_DEADLINE_MS = 4_000;
const SCHEDULE_UNAVAILABLE_MESSAGE = '일정 확인이 잠시 지연되고 있습니다. 잠시 후 다시 질문해 주세요.';
const PARENT_REQUEST_LIMIT = 5;
const PARENT_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const KAKAO_CONSENT_VERSION = '2026-07-17-v1';
const KAKAO_COUNSEL_CONSENT_VERSION = '2026-07-17-counsel-v1';
const KAKAO_PRIVACY_URL = 'https://jamaica8612.github.io/growing/privacy.html';
const KAKAO_CONSENT_NOTICE = [
  '학생 연결을 위해 카카오 사용자 정보와 연결할 학생 정보를 이용합니다.',
  '입력한 휴대폰 번호는 학원 등록정보 확인에만 사용하며 그로잉 연결정보·운영로그에는 별도 저장하지 않습니다.',
  '연결 정보는 연결 중 보유하고, 연결 해제 후 1년 이내 삭제합니다.',
  '챗봇의 연결 해제로 언제든 동의를 철회하고 조회 권한을 중지할 수 있습니다.',
  '동의하지 않아도 휴강 안내와 상담은 이용할 수 있습니다.',
  `자세히: ${KAKAO_PRIVACY_URL}`,
].join('\n');
const KAKAO_COUNSEL_CONSENT_NOTICE = [
  '입학 상담을 위해 개인정보 수집에 동의해 주세요.',
  '• 항목: 상담 내용, 연락 가능한 휴대폰 번호',
  '• 목적: 상담 접수 및 회신',
  '• 보유: 처리 완료 후 90일, 미처리 시 최대 1년',
  '• 거부: 동의하지 않을 수 있으나 상담 접수는 제한됩니다.',
  `자세히: ${KAKAO_PRIVACY_URL}`,
].join('\n');

interface CounselConsentEvidence {
  consentAt: string;
  consentVersion: string;
  consentTextHash: string;
}

interface StudentRow {
  id: string;
  name: string;
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
    headers: {
      ...corsHeaders,
      ...responseSecurityHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

interface StudentConnectRow extends StudentRow {
  parent_contact: string | null;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getSkillSecret(req: Request): string {
  return req.headers.get('x-kakao-skill-secret')?.trim() ?? '';
}

function createRequestSupabase(signal: AbortSignal): UntypedSupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
          ...init,
          signal: init?.signal ?? signal,
        }),
      },
    },
  ) as UntypedSupabaseClient;
}

function logEvent(
  supabase: UntypedSupabaseClient,
  payload: KakaoSkillPayload,
  ownerId: string | null,
  status: string,
  _responseBody: unknown,
): Promise<void> {
  void _responseBody;
  const user = payload.userRequest?.user;
  const task = (async () => {
    try {
      const { error } = await supabase.from('growing_kakao_events').insert({
        owner_id: ownerId,
        kakao_user_key: user?.id ?? '',
        plusfriend_user_key: user?.properties?.plusfriendUserKey ?? null,
        event_type: 'skill',
        intent: getAction(payload),
        status: safeEventStatus(status),
        raw_payload: null,
        response_body: null,
      });
      if (error) console.error('Kakao event log failed', error.message);
    } catch (error) {
      console.error('Kakao event log failed', error);
    }
  })();
  runInBackground(task, 'Kakao event log');
  return Promise.resolve();
}

async function findActiveLinks(supabase: UntypedSupabaseClient, ownerId: string, kakaoUserKey: string): Promise<ParentLinkRow[]> {
  const { data, error } = await supabase
    .from('growing_kakao_parent_links')
    .select('id, owner_id, student_id, kakao_user_key, plusfriend_user_key, blocked_at')
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .eq('consent_version', KAKAO_CONSENT_VERSION)
    .is('revoked_at', null)
    .is('channel_blocked_at', null)
    .is('blocked_at', null);
  if (error) throw error;
  return (data ?? []) as ParentLinkRow[];
}

async function resolveChannel(supabase: UntypedSupabaseClient, skillSecret: string): Promise<{ ownerId: string; autoReply: boolean } | null> {
  if (new TextEncoder().encode(skillSecret).byteLength < 32) return null;
  const skillSecretHash = await sha256Hex(skillSecret);
  const { data, error } = await supabase
    .from('growing_kakao_channels')
    .select('owner_id, enabled, auto_reply')
    .eq('skill_secret_hash', skillSecretHash)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw error;
  const row = data as (KakaoChannelRow & { auto_reply: boolean | null }) | null;
  if (!row) return null;
  return { ownerId: row.owner_id, autoReply: row.auto_reply !== false };
}

async function getStudent(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  studentId: string,
): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('growing_students')
    .select('id, name, status')
    .eq('owner_id', ownerId)
    .eq('id', studentId)
    .eq('status', 'active')
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
  _payload: KakaoSkillPayload,
  privacyConsent?: CounselConsentEvidence,
): Promise<boolean> {
  const normalizedMessage = message.trim().slice(0, 500);
  const allowed = await consumeRateLimit(
    supabase,
    ownerId,
    'parent_request',
    kakaoUserKey,
    PARENT_REQUEST_LIMIT,
    Math.floor(PARENT_REQUEST_WINDOW_MS / 1000),
  );
  if (!allowed) {
    throw new Error('parent_request_rate_limited');
  }

  const { data, error } = await supabase.rpc('growing_create_kakao_parent_request', {
    p_owner_id: ownerId,
    p_student_id: studentId,
    p_kakao_user_key: kakaoUserKey,
    p_request_type: requestType,
    p_message: normalizedMessage,
    p_request_id: _payload.requestId ?? '',
    p_privacy_consent_at: privacyConsent?.consentAt ?? null,
    p_privacy_consent_version: privacyConsent?.consentVersion ?? null,
    p_privacy_consent_text_hash: privacyConsent?.consentTextHash ?? null,
  });
  if (error) throw error;
  return data === true;
}

async function findStudentByExactConnectCredentials(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  studentName: string,
  phone: string,
): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('growing_students')
    .select('id, name, status, parent_contact')
    .eq('owner_id', ownerId)
    .eq('name', studentName)
    .eq('status', 'active');
  if (error) throw error;

  const matches = ((data ?? []) as StudentConnectRow[])
    .filter(student => cleanPhone(student.parent_contact ?? '') === phone);
  if (matches.length !== 1) return null;
  const [{ id, name, status }] = matches;
  return { id, name, status };
}

async function consumeRateLimit(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  scope: 'connect' | 'parent_request',
  subject: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('growing_consume_kakao_rate_limit', {
    p_owner_id: ownerId,
    p_scope: scope,
    p_subject: subject,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

/** 직전 상담 입력 안내와 선택된 자녀를 10분 동안 복원한다. */
async function getRecentCounselPrompt(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  kakaoUserKey: string,
): Promise<{ recent: boolean; studentId?: string; privacyConsent?: CounselConsentEvidence }> {
  const { data, error } = await supabase.rpc('growing_get_kakao_counsel_prompt', {
    p_owner_id: ownerId,
    p_kakao_user_key: kakaoUserKey,
  });
  if (error) throw error;
  const state = data as {
    found?: boolean;
    student_id?: string | null;
    privacy_consent_at?: string | null;
    privacy_consent_version?: string | null;
    privacy_consent_text_hash?: string | null;
  } | null;
  if (!state?.found) return { recent: false };
  const privacyConsent = state.privacy_consent_at &&
      state.privacy_consent_version && state.privacy_consent_text_hash
    ? {
      consentAt: state.privacy_consent_at,
      consentVersion: state.privacy_consent_version,
      consentTextHash: state.privacy_consent_text_hash,
    }
    : undefined;
  return {
    recent: true,
    ...(state.student_id ? { studentId: state.student_id } : {}),
    ...(privacyConsent ? { privacyConsent } : {}),
  };
}

async function setCounselPrompt(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  kakaoUserKey: string,
  studentId?: string,
  privacyConsent?: { version: string; textHash: string },
): Promise<void> {
  const { data, error } = await supabase.rpc('growing_set_kakao_counsel_prompt', {
    p_owner_id: ownerId,
    p_kakao_user_key: kakaoUserKey,
    p_student_id: studentId ?? null,
    p_privacy_consent_version: privacyConsent?.version ?? null,
    p_privacy_consent_text_hash: privacyConsent?.textHash ?? null,
  });
  if (error) throw error;
  if (data !== true) throw new Error('counsel_prompt_state_failed');
}

async function clearCounselPrompt(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  kakaoUserKey: string,
): Promise<void> {
  const { error } = await supabase.rpc('growing_clear_kakao_counsel_prompt', {
    p_owner_id: ownerId,
    p_kakao_user_key: kakaoUserKey,
  });
  if (error) throw error;
}

async function cancelPendingCounselRequests(
  supabase: UntypedSupabaseClient,
  ownerId: string,
  kakaoUserKey: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('growing_parent_requests')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('kakao_user_key', kakaoUserKey)
    .eq('request_type', 'counsel')
    .in('status', ['pending', 'drafted'])
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
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

async function withGlobalResponseDeadline(
  taskFactory: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guardedTask = taskFactory(controller.signal).catch(error => {
    console.error('Kakao skill request failed', error);
    return jsonResponse(skillText('지금은 요청을 처리하기 어렵습니다. 잠시 후 다시 시도해 주세요.'));
  });
  const deadline = new Promise<Response>(resolve => {
    timeout = setTimeout(() => {
      controller.abort(new DOMException('Kakao response deadline exceeded', 'TimeoutError'));
      resolve(jsonResponse(skillText('응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')));
    }, KAKAO_GLOBAL_DEADLINE_MS);
  });
  const response = await Promise.race([guardedTask, deadline]);
  if (timeout !== undefined) clearTimeout(timeout);
  return response;
}

async function handleKakaoSkillRequest(req: Request, signal: AbortSignal): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, ...responseSecurityHeaders } });
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let supabase: UntypedSupabaseClient;
  let channelOwnerId: string;
  let autoReply: boolean;
  try {
    supabase = createRequestSupabase(signal);
    const channel = await resolveChannel(supabase, getSkillSecret(req));
    if (!channel) return jsonResponse({ error: 'Unauthorized channel' }, 401);
    channelOwnerId = channel.ownerId;
    autoReply = channel.autoReply;
  } catch (error) {
    console.error('Kakao skill initialization failed', error);
    return jsonResponse(skillText('지금은 요청을 처리하기 어렵습니다. 잠시 후 다시 시도해 주세요.'));
  }

  let payload: KakaoSkillPayload;

  try {
    payload = await readKakaoSkillPayload(req);
    const requestId = req.headers.get('x-request-id')?.trim() ?? '';
    payload.requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? requestId : undefined;
  } catch {
    return jsonResponse(skillText('요청 형식이 올바르지 않습니다. 학원으로 문의해 주세요.'), 400);
  }

  try {
    let action = getAction(payload);
    const kakaoUserKey = payload.userRequest?.user?.id ?? '';
    const plusfriendUserKey = payload.userRequest?.user?.properties?.plusfriendUserKey ?? '';

    if (!kakaoUserKey) {
      const response = skillText('카카오 사용자 정보를 확인할 수 없습니다. 채널 채팅방에서 다시 시도해 주세요.');
      await logEvent(supabase, payload, channelOwnerId, 'missing_user', response);
      return jsonResponse(response);
    }

    if (action === 'connect_student') {
      const connectInput = parseConnectInput(payload);
      const credentials = normalizeConnectCredentials(connectInput.studentName, connectInput.phone);
      if (!credentials) {
        const response = skillText(
          '학생 이름과 학원에 등록된 학부모 휴대폰 번호 전체를 한 메시지에 입력해 주세요.\n' +
          '예: 김서윤 010-1234-5678\n\n' +
          '입력한 이름·휴대폰 번호는 등록정보 확인에만 사용하고 그로잉 연결정보·운영로그에는 별도 저장하지 않습니다.',
        );
        await logEvent(supabase, payload, channelOwnerId, 'connect_prompt', response);
        return jsonResponse(response);
      }

      const allowed = await consumeRateLimit(
        supabase,
        channelOwnerId,
        'connect',
        kakaoUserKey,
        CONNECT_ATTEMPT_LIMIT,
        Math.floor(CONNECT_ATTEMPT_WINDOW_MS / 1000),
      );
      if (!allowed) {
        const response = skillText('학생 연결 시도가 잠시 제한되었습니다. 15분 후 다시 시도하거나 학원에 문의해 주세요.');
        await logEvent(supabase, payload, channelOwnerId, 'connect_rate_limited', response);
        return jsonResponse(response);
      }

      const student = await findStudentByExactConnectCredentials(
        supabase,
        channelOwnerId,
        credentials.studentName,
        credentials.phone,
      );
      if (!student) {
        const response = skillText('학생 이름 또는 휴대폰 번호가 등록정보와 일치하지 않습니다. 다시 확인하거나 학원에 문의해 주세요.');
        await logEvent(supabase, payload, channelOwnerId, 'connect_failed', response);
        return jsonResponse(response);
      }

      const connectNonce = crypto.randomUUID().replaceAll('-', '');
      const { data: pendingSaved, error: pendingError } = await supabase.rpc('growing_set_kakao_connect_pending', {
        p_owner_id: channelOwnerId,
        p_kakao_user_key: kakaoUserKey,
        p_student_id: student.id,
        p_state_nonce: connectNonce,
      });
      if (pendingError) throw pendingError;
      if (pendingSaved !== true) {
        const response = skillText('학생 연결 정보를 확인하지 못했습니다. 잠시 후 다시 시도하거나 학원에 문의해 주세요.');
        await logEvent(supabase, payload, channelOwnerId, 'connect_failed', response);
        return jsonResponse(response);
      }

      const response = skillText(
        `${student.name} 학생으로 확인되었습니다.\n\n${KAKAO_CONSENT_NOTICE}\n\n동의하고 연결하시겠어요?`,
        [
          { label: '동의하고 연결', action: 'connect_student_confirm', connectNonce },
          { label: '연결하지 않기', action: 'menu' },
        ],
      );
      await logEvent(supabase, payload, channelOwnerId, 'connect_consent_prompt', response);
      return jsonResponse(response);
    }

    if (action === 'connect_student_confirm') {
      const connectNonce = getParam(payload, 'connectNonce', 'connect_nonce');
      if (!/^[a-f0-9]{32,64}$/i.test(connectNonce)) {
        const response = skillText('연결 확인 정보가 만료되었습니다. 학생 이름과 휴대폰 번호를 한 메시지에 다시 입력해 주세요.');
        await logEvent(supabase, payload, channelOwnerId, 'connect_failed', response);
        return jsonResponse(response);
      }
      const { data: claimData, error: claimError } = await supabase.rpc('growing_claim_kakao_pending_link', {
        p_owner_id: channelOwnerId,
        p_kakao_user_key: kakaoUserKey,
        p_plusfriend_user_key: plusfriendUserKey,
        p_app_user_id: getKakaoAppUserId(payload),
        p_consent_text_hash: await sha256Hex(KAKAO_CONSENT_NOTICE),
        p_consent_version: KAKAO_CONSENT_VERSION,
        p_state_nonce: connectNonce,
      });
      if (claimError) throw claimError;
      const claim = claimData as {
        matched?: boolean;
        student_id?: string;
        student_name?: string;
      } | null;
      if (!claim?.matched || !claim.student_id || !claim.student_name) {
        const response = skillText('연결 확인 정보가 만료되었습니다. 학생 이름과 휴대폰 번호를 한 메시지에 다시 입력해 주세요.');
        await logEvent(supabase, payload, channelOwnerId, 'connect_failed', response);
        return jsonResponse(response);
      }

      const allLinks = await findActiveLinks(supabase, channelOwnerId, kakaoUserKey);
      let connectResponse;
      if (allLinks.length > 1) {
        const allStudents = await Promise.all(allLinks.map(l => getStudent(supabase, channelOwnerId, l.student_id)));
        const pickerReplies = allStudents
          .filter((s): s is StudentRow => s !== null)
          .map(s => ({ label: s.name, action: 'student_menu', studentId: s.id }));
        connectResponse = skillText(`${claim.student_name} 학생이 추가 연결되었습니다. 자녀를 선택해 주세요.`, pickerReplies);
      } else {
        connectResponse = skillText(
          `${claim.student_name} 학생 보호자로 연결되었습니다.\n이제 출결 확인, 숙제 확인, 상담 요청을 이용할 수 있어요.`,
          makeMenuReplies(claim.student_id, false),
        );
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

    // 보안: clientExtra와 저장된 상담 상태의 student_id가 실제 부모 링크에 있을 때만 사용
    const rawSelectedId = payload.action?.clientExtra?.student_id;
    let promptedStudentId: string | undefined;
    let recentCounselPrompt: Awaited<ReturnType<typeof getRecentCounselPrompt>> | undefined;

    // 직전에 상담 사유 입력을 안내했다면 일반 자유 입력을 상담 내용으로 처리한다.
    const utterance = payload.userRequest?.utterance?.trim() ?? '';
    const isPlainMenuCommand = /^(메뉴|처음|시작|start|안녕|안녕하세요|하이)$/i.test(utterance);
    if ((action === 'menu' || action === 'counsel_request') &&
      utterance.length > 1 && !isPlainMenuCommand && !isCounselPlaceholder(utterance)) {
      recentCounselPrompt = await getRecentCounselPrompt(supabase, channelOwnerId, kakaoUserKey);
      if (recentCounselPrompt.recent) {
        if (action === 'menu') action = 'counsel_request';
        promptedStudentId = recentCounselPrompt.studentId;
      }
    }

    const selectedStudentId = [rawSelectedId, promptedStudentId]
      .find(candidate => candidate && links.some(link => link.student_id === candidate));

    if (action === 'counsel_consent_confirm') {
      const promptStudentId = selectedStudentId ?? links[0]?.student_id;
      const privacyConsent = links.length === 0
        ? {
          version: KAKAO_COUNSEL_CONSENT_VERSION,
          textHash: await sha256Hex(KAKAO_COUNSEL_CONSENT_NOTICE),
        }
        : undefined;
      await setCounselPrompt(
        supabase,
        channelOwnerId,
        kakaoUserKey,
        promptStudentId,
        privacyConsent,
      );
      const response = skillText(links.length === 0
        ? '동의가 확인되었습니다. 상담 내용과 연락 가능한 휴대폰 번호를 함께 입력해 주세요.\n\n예: 입학 문의드려요. 010-1234-5678'
        : '어떤 내용으로 상담을 요청하시겠어요?\n간단히 입력해 주세요. 😊');
      await logEvent(supabase, payload, channelOwnerId, 'counsel_consent_confirmed', response);
      return jsonResponse(response);
    }

    if (action === 'counsel_cancel') {
      const response = skillText('대기 중인 상담 요청을 모두 취소할까요?', [
        { label: '상담 취소 확인', action: 'counsel_cancel_confirm' },
        { label: '취소하지 않기', action: 'menu' },
      ]);
      await logEvent(supabase, payload, channelOwnerId, 'counsel_cancel_prompt', response);
      return jsonResponse(response);
    }

    if (action === 'counsel_cancel_confirm') {
      const cancelledCount = await cancelPendingCounselRequests(supabase, channelOwnerId, kakaoUserKey);
      await clearCounselPrompt(supabase, channelOwnerId, kakaoUserKey);
      const response = cancelledCount > 0
        ? skillText(`접수된 상담 요청 ${cancelledCount}건을 취소했습니다.`, links.length > 0
          ? makeMenuReplies(selectedStudentId ?? links[0].student_id, links.length > 1)
          : [
            { label: '📅 휴강일 안내', action: 'schedule_info' },
            { label: '학생 연결', action: 'connect_student' },
            { label: '💬 상담 요청', action: 'counsel_request' },
          ])
        : skillText('취소할 상담 요청이 없습니다. 이미 처리된 요청은 학원에 직접 문의해 주세요.');
      await logEvent(supabase, payload, channelOwnerId, 'counsel_cancelled', response);
      return jsonResponse(response);
    }

    // 상담 요청은 학생 연결 없이도 가능
    if (action === 'counsel_request') {
      const rawMessage = getParam(payload, 'message', '문의내용') || payload.userRequest?.utterance || '';
      const isNewInquiry = links.length === 0;
      const currentCounselConsentHash = isNewInquiry
        ? await sha256Hex(KAKAO_COUNSEL_CONSENT_NOTICE)
        : '';
      const savedPrivacyConsent = recentCounselPrompt?.privacyConsent;
      const privacyConsent = savedPrivacyConsent &&
          savedPrivacyConsent.consentVersion === KAKAO_COUNSEL_CONSENT_VERSION &&
          savedPrivacyConsent.consentTextHash === currentCounselConsentHash
        ? savedPrivacyConsent
        : undefined;

      if (isNewInquiry && !privacyConsent) {
        const response = skillText(
          `${KAKAO_COUNSEL_CONSENT_NOTICE}\n\n동의 후 상담 내용을 입력하시겠어요?`,
          [
            { label: '동의하고 상담', action: 'counsel_consent_confirm' },
            { label: '동의하지 않기', action: 'menu' },
          ],
        );
        await logEvent(supabase, payload, channelOwnerId, 'counsel_consent_prompt', response);
        return jsonResponse(response);
      }

      if (isCounselPlaceholder(rawMessage)) {
        if (links.length > 1 && !selectedStudentId) {
          const linkedStudents = await Promise.all(
            links.map(link => getStudent(supabase, channelOwnerId, link.student_id)),
          );
          const response = skillText(
            '어떤 자녀의 상담을 요청하시겠어요?',
            linkedStudents
              .filter((student): student is StudentRow => student !== null)
              .map(student => ({
                label: student.name,
                action: 'counsel_request',
                messageText: '상담 요청',
                studentId: student.id,
              })),
          );
          return jsonResponse(response);
        }
        const promptText = '어떤 내용으로 상담을 요청하시겠어요?\n간단히 입력해 주세요. 😊';
        const response = skillText(promptText);
        await setCounselPrompt(
          supabase,
          channelOwnerId,
          kakaoUserKey,
          selectedStudentId ?? links[0]?.student_id,
        );
        await logEvent(
          supabase,
          payload,
          channelOwnerId,
          'counsel_prompt',
          response,
        );
        return jsonResponse(response);
      }

      const counselStudentId = selectedStudentId ?? links[0]?.student_id ?? null;
      const counselStudentName = counselStudentId
        ? (await getStudent(supabase, channelOwnerId, counselStudentId))?.name ?? null : null;
      const ownerId = links[0]?.owner_id ?? channelOwnerId;

      // 신규 문의: 메시지에서 전화번호 추출해 함께 저장
      const phone = isNewInquiry ? extractPhone(rawMessage) : '';
      if (isNewInquiry && !phone) {
        const response = skillText(
          '상담 접수를 완료하려면 연락 가능한 휴대폰 번호를 함께 입력해 주세요.\n' +
          '예: 입학 문의드려요. 010-1234-5678',
        );
        await logEvent(supabase, payload, ownerId, 'counsel_phone_required', response);
        return jsonResponse(response);
      }
      const savedMessage = phone
        ? `[연락처: ${phone}] ${rawMessage.trim()}`
        : rawMessage.trim();

      const requestCreated = await createParentRequest(
        supabase,
        ownerId,
        counselStudentId,
        kakaoUserKey,
        'counsel',
        savedMessage,
        payload,
        isNewInquiry ? privacyConsent : undefined,
      );
      await clearCounselPrompt(supabase, ownerId, kakaoUserKey);
      const confirmMsg = !requestCreated
        ? '같은 상담 요청이 이미 접수되어 있습니다. 원장님이 확인 후 연락드리겠습니다.'
        : counselStudentName
          ? `${counselStudentName} 학생 상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.`
          : phone
            ? `상담 요청이 접수되었습니다.\n원장님이 ${phone}으로 연락드리겠습니다.`
            : '상담 요청이 접수되었습니다.\n원장님이 확인 후 연락드리겠습니다.';
      const counselMenuReplies = links.length > 0
        ? makeMenuReplies(counselStudentId ?? undefined, links.length > 1)
        : [
          { label: '📅 휴강일 안내', action: 'schedule_info' },
          { label: '학생 연결', action: 'connect_student' },
          { label: '💬 상담 요청', action: 'counsel_request' },
        ];
      const response = skillText(confirmMsg, counselMenuReplies);
      await logEvent(supabase, payload, ownerId, requestCreated ? 'counsel_queued' : 'counsel_duplicate', response);

      // 원장님 폰 푸시 알림 (실패해도 응답에 영향 없음)
      if (requestCreated) {
        runInBackground(
          sendPushToOwner(channelOwnerId, ownerId, '카카오 상담 요청', '새 상담 요청이 접수되었습니다.'),
          'Kakao counsel push',
        );
      }

      return jsonResponse(response);
    }

    if (links.length === 0) {
      const response = skillText('안녕하세요! 그로잉영어입니다. 😊\n\n현재 휴강·공휴일 일정, 학생 출결·숙제 확인, 상담 요청을 지원합니다.\n재원생 학부모님은 학생 연결 후 이용해 주세요.\n입학 문의는 상담 요청 버튼을 눌러주세요.', [
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
      const targetStudent = await getStudent(supabase, channelOwnerId, targetId);
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
      const allStudents = await Promise.all(links.map(l => getStudent(supabase, channelOwnerId, l.student_id)));
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

    const student = await getStudent(supabase, link.owner_id, link.student_id);
    if (!student) {
      const response = skillText('연결된 학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.');
      await logEvent(supabase, payload, link.owner_id, 'student_missing', response);
      return jsonResponse(response);
    }

    if (action === 'unlink_student') {
      const revokedAt = new Date().toISOString();
      const { error: unlinkError } = await supabase
        .from('growing_kakao_parent_links')
        .update({ blocked_at: revokedAt, revoked_at: revokedAt })
        .eq('owner_id', channelOwnerId)
        .eq('kakao_user_key', kakaoUserKey)
        .eq('student_id', student.id);
      if (unlinkError) throw unlinkError;

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
        const remainStudents = await Promise.all(remainingLinks.map(l => getStudent(supabase, channelOwnerId, l.student_id)));
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
      runInBackground(logEvent(supabase, payload, link.owner_id, 'attendance_answered', response), 'Kakao attendance event log');
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
      runInBackground(logEvent(supabase, payload, link.owner_id, 'homework_answered', response), 'Kakao homework event log');
      return jsonResponse(response);
    }

    if (action === 'ask_ai') {
      const response = skillText(
        '개인정보 보호를 위해 자유형 AI 답변은 현재 제공하지 않습니다.\n휴강·출결·숙제·상담 메뉴를 이용해 주세요.',
        makeMenuReplies(student.id, links.length > 1),
      );
      await logEvent(supabase, payload, link.owner_id, 'ask_ai_disabled', response);
      return jsonResponse(response);
    }

    const response = skillText(
      '현재 휴강·출결·숙제·상담을 지원합니다. 원하시는 메뉴를 선택해 주세요.',
      makeMenuReplies(student.id, links.length > 1),
    );
    return jsonResponse(response);
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === 'parent_request_rate_limited';
    const response = skillText(rateLimited
      ? '요청이 잠시 제한되었습니다. 15분 후 다시 시도하거나 학원에 문의해 주세요.'
      : '처리 중 오류가 발생했습니다. 학원으로 문의해 주세요.');
    await logEvent(supabase, payload, channelOwnerId, `error:${error instanceof Error ? error.message : 'unknown'}`, response).catch(() => {});
    return jsonResponse(response);
  }
}

Deno.serve(req => withGlobalResponseDeadline(signal => handleKakaoSkillRequest(req, signal)));
