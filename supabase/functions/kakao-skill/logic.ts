// kakao-skill 순수 로직 (Deno 의존성 없음 — vitest로 테스트 가능)

export type SkillAction =
  | 'connect_student'
  | 'attendance_today'
  | 'homework_today'
  | 'counsel_request'
  | 'ask_ai'
  | 'menu'
  | 'student_menu'
  | 'unlink_student';

export interface KakaoSkillPayload {
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

export interface QuickReplyDef {
  label: string;
  action: string;
  messageText?: string;
  studentId?: string;
}

export function skillText(text: string, quickReplies: QuickReplyDef[] = []) {
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

export function makeMenuReplies(studentId?: string, showSwitch = false): QuickReplyDef[] {
  const replies: QuickReplyDef[] = [
    { label: '📅 오늘 출결', action: 'attendance_today', studentId },
    { label: '📝 숙제 확인', action: 'homework_today', studentId },
    { label: '🤖 아이비 질문', action: 'ask_ai', messageText: '아이비에게 질문', studentId },
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

export function kstToday(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
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
  if (uv.includes('상담')) return 'counsel_request';

  // 3자 초과 자유 입력은 AI로 라우팅 (출결/숙제 포함)
  const isMenuWord = ['메뉴', '처음', '시작', 'start', '안녕', '안녕하세요', '하이'].includes(uv);
  if (utterance.length > 3 && !isMenuWord) return 'ask_ai';

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
  // 전체 번호(10~11자리)를 4자리보다 먼저 매칭해야 번호가 잘리지 않음
  const phoneMatch = utterance.match(/(\d{10,11}|\d{4})/);
  const fallbackPhone = phoneMatch ? cleanPhone(phoneMatch[1]) : phone;
  const fallbackName = studentName || utterance.replace(phoneMatch?.[1] ?? '', '').replace(/학생|연결|전화|번호|휴대폰/g, '').trim();
  return { studentName: fallbackName, phone: fallbackPhone };
}

/** 상담 사유 없이 버튼/키워드만 입력한 경우인지 판별 */
export function isCounselPlaceholder(message: string): boolean {
  const compact = message.trim().replace(/\s+/g, '');
  return !compact || ['상담', '상담요청', '💬상담요청'].includes(compact);
}
