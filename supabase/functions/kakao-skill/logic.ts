// kakao-skill 순수 로직 (Deno 의존성 없음 — vitest로 테스트 가능)

export type SkillAction =
  | 'connect_student'
  | 'connect_student_confirm'
  | 'schedule_info'
  | 'attendance_today'
  | 'homework_today'
  | 'counsel_request'
  | 'counsel_consent_confirm'
  | 'counsel_cancel'
  | 'counsel_cancel_confirm'
  | 'ask_ai'
  | 'menu'
  | 'student_menu'
  | 'unlink_student';

export interface KakaoSkillPayload {
  requestId?: string;
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
        appUserId?: string;
        app_user_id?: string;
        isFriend?: boolean;
      };
    };
  };
}

export interface QuickReplyDef {
  label: string;
  action: string;
  messageText?: string;
  studentId?: string;
  connectNonce?: string;
}

const MAX_SIMPLE_TEXT_LENGTH = 950;
const MAX_QUICK_REPLIES = 10;
const MAX_QUICK_REPLY_LABEL_LENGTH = 14;

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function skillText(text: string, quickReplies: QuickReplyDef[] = []) {
  const seenReplies = new Set<string>();
  const safeQuickReplies = quickReplies
    .filter(reply => {
      const key = `${reply.action}\u0000${reply.studentId ?? ''}`;
      if (seenReplies.has(key)) return false;
      seenReplies.add(key);
      return true;
    })
    .slice(0, MAX_QUICK_REPLIES)
    .map(reply => ({
      label: truncateText(reply.label, MAX_QUICK_REPLY_LABEL_LENGTH),
      action: 'message',
      messageText: truncateText(reply.messageText ?? reply.label, MAX_SIMPLE_TEXT_LENGTH),
      extra: {
        action: reply.action,
        ...(reply.studentId ? { student_id: reply.studentId } : {}),
        ...(reply.connectNonce ? { connect_nonce: reply.connectNonce } : {}),
      },
    }));

  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: truncateText(text, MAX_SIMPLE_TEXT_LENGTH) } }],
      quickReplies: safeQuickReplies,
    },
  };
}

export function makeMenuReplies(studentId?: string, showSwitch = false): QuickReplyDef[] {
  const replies: QuickReplyDef[] = [
    { label: '📅 휴강일 안내', action: 'schedule_info', studentId },
    { label: '📅 오늘 출결', action: 'attendance_today', studentId },
    { label: '📝 숙제 확인', action: 'homework_today', studentId },
    { label: '💬 상담 요청', action: 'counsel_request', studentId },
  ];
  if (showSwitch) replies.push({ label: '🔄 자녀 전환', action: 'student_menu' });
  replies.push({ label: '➕ 학생 추가 연결', action: 'connect_student' });
  if (studentId) replies.push({ label: '🔗 연결 해제', action: 'unlink_student', studentId });
  return replies;
}

export function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function extractPhone(text: string): string {
  const match = text.match(/01[0-9][- ]?\d{3,4}[- ]?\d{4}/);
  return match ? cleanPhone(match[0]) : '';
}

export function kstToday(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/** 휴강·공휴일·가까운 날짜의 수업 여부를 묻는 문장인지 판별한다. */
export function isScheduleInquiry(value: string): boolean {
  const compact = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!compact) return false;

  if (/(휴강|공휴일|대체휴일|대체공휴일|임시공휴일|학원휴무|명절)/.test(compact)) {
    return true;
  }

  if (/(설날|설연휴|설에|설은|구정|추석|한가위|신정|새해첫날|삼일절|3[ㆍ·.]1절|광복절|개천절|한글날|어린이날|현충일|제헌절|성탄절|크리스마스|부처님오신날|석가탄신일|근로자의날|노동절)/.test(compact)) {
    return true;
  }

  const hasRelativeDate = /(오늘|금일|내일|낼|모레|글피|이번주|금주|다음주|담주|차주|이번달|다음달)/.test(compact);
  if (hasRelativeDate && /(수업|학원|쉬|휴무|휴강|일정|가나|가요|가는날)/.test(compact)) {
    return true;
  }

  const hasExplicitDate = /\d{4}(?:년|[-./])\d{1,2}(?:월|[-./])\d{1,2}일?/.test(compact) ||
    /\d{1,2}(?:월|[-./])\d{1,2}일?/.test(compact);
  if (hasExplicitDate && /(수업|학원|쉬|휴무|휴강|일정)/.test(compact)) {
    return true;
  }

  return /(수업).*(하나요|하냐|하니|하나|해요|해|있나요|있냐|있니|있나|있어요|있어|없나요|없어|쉬나요|쉬어)|(학원).*(쉬나요|쉬어요|쉬어|가나요|가요|가야|가는날|여나요|열어요|문여나요)/.test(compact);
}

/** 이미 접수한 상담을 취소하거나 철회하려는 문장인지 판별한다. */
export function isCounselCancellation(value: string): boolean {
  const compact = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!compact || !/(상담|문의)/.test(compact)) return false;
  return /(취소|철회|접수취소|삭제|안할게|하지않을게|그만)/.test(compact);
}

export function getAction(payload: KakaoSkillPayload): SkillAction {
  // Explicit action from button/block params
  const explicit =
    payload.action?.clientExtra?.action ||
    payload.action?.params?.action ||
    payload.intent?.name ||
    '';
  const ev = explicit.toLowerCase();
  if (ev === 'unlink_student') return 'unlink_student';
  if (ev === 'connect_student_confirm') return 'connect_student_confirm';
  if (ev === 'counsel_consent_confirm') return 'counsel_consent_confirm';
  if (ev === 'counsel_cancel_confirm') return 'counsel_cancel_confirm';
  if (ev.includes('counsel_cancel') || isCounselCancellation(explicit)) return 'counsel_cancel';
  if (ev.includes('schedule_info') || ev.includes('holiday') || ev.includes('휴강') || ev.includes('공휴일')) return 'schedule_info';
  if (ev.includes('connect') || ev.includes('연결')) return 'connect_student';
  if (ev.includes('attendance') || ev.includes('출결') || ev.includes('등원')) return 'attendance_today';
  if (ev.includes('homework') || ev.includes('숙제')) return 'homework_today';
  if (ev.includes('counsel') || ev.includes('상담')) return 'counsel_request';
  if (ev.includes('ask_ai') || ev.includes('아이비') || ev.includes('질문')) return 'ask_ai';
  if (ev.includes('student_menu')) return 'student_menu';

  // 자유 입력 텍스트 라우팅
  const utterance = (payload.userRequest?.utterance ?? '').trim();
  const uv = utterance.toLowerCase();
  const uvCompact = uv.replace(/\s+/g, '');
  if (uvCompact.includes('연결해제')) return 'unlink_student';
  if (/(학생연결|자녀연결|연결하고싶|연결해주세요|연결해줘)/.test(uvCompact) ||
    isConnectCredentialInput(utterance)) return 'connect_student';
  if (isCounselCancellation(utterance)) return 'counsel_cancel';
  if (isScheduleInquiry(utterance)) return 'schedule_info';
  if (uv.includes('상담')) return 'counsel_request';

  // 지원 범위를 벗어난 자유 입력은 개인정보를 외부 AI로 보내지 않고 안전한 메뉴로 안내한다.
  return 'menu';
}

export function getParam(payload: KakaoSkillPayload, ...keys: string[]): string {
  for (const key of keys) {
    const fromParams = payload.action?.params?.[key];
    if (fromParams) return String(fromParams).trim();
    const fromExtra = payload.action?.clientExtra?.[key];
    if (fromExtra) return String(fromExtra).trim();
  }
  return '';
}

export function parseConnectInput(payload: KakaoSkillPayload) {
  const studentName = getParam(payload, 'studentName', 'student_name', 'name', '학생명');
  const phone = cleanPhone(getParam(payload, 'phone', 'parentPhone', 'parent_phone', '전화번호'));
  if (studentName && phone) return { studentName, phone };

  const utterance = payload.userRequest?.utterance ?? '';
  const fullPhoneMatch = utterance.match(/01[0-9][- ]?\d{3,4}[- ]?\d{4}/);
  if (!fullPhoneMatch) return { studentName, phone };
  const matchedPhone = fullPhoneMatch?.[0] ?? '';
  const fallbackPhone = matchedPhone ? cleanPhone(matchedPhone) : phone;
  const fallbackName = studentName || utterance
    .replace(matchedPhone, '')
    .replace(/학생|연결|전화|번호|휴대폰/g, '')
    .trim();
  return { studentName: fallbackName, phone: fallbackPhone };
}

function isConnectCredentialInput(utterance: string): boolean {
  const fullPhone = utterance.match(/01[0-9][- ]?\d{3,4}[- ]?\d{4}/)?.[0];
  if (!fullPhone) return false;
  const possibleName = utterance
    .replace(fullPhone, '')
    .replace(/학생|자녀|연결|휴대폰|전화번호|전화/g, '')
    .trim();
  return /^[가-힣]{2,10}$/.test(possibleName) || /^[A-Za-z][A-Za-z '-]{1,29}$/.test(possibleName);
}

/** 상담 사유 없이 버튼/키워드만 입력한 경우인지 판별 */
export function isCounselPlaceholder(message: string): boolean {
  const compact = message.trim().replace(/\s+/g, '');
  return !compact || ['상담', '상담요청', '💬상담요청'].includes(compact);
}
