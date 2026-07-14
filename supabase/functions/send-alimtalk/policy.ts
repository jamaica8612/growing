export const ALIMTALK_ALERT_TYPES = [
  'check_in',
  'check_out',
  'homework_done',
  'homework_incomplete',
  'homework_undone',
  'payment_request',
  'payment_paid',
  'exam_result',
  'custom',
] as const;

export type AlimtalkAlertType = (typeof ALIMTALK_ALERT_TYPES)[number];

export const ALIMTALK_LIMITS = {
  subjectCharacters: 100,
  messageCharacters: 1_000,
  sendsPerStudentPerHour: 12,
  sendsPerOwnerPerFiveMinutes: 120,
  sendsPerOwnerPerDay: 1_000,
} as const;

export interface ValidatedAlimtalkRequest {
  studentId: string;
  paymentId?: string;
  alertType: AlimtalkAlertType;
  subject: string;
  message: string;
  fallbackMessage?: string;
}

export interface OwnedStudentRow {
  id: string;
  owner_id: string;
  name: string | null;
  parent_contact: string | null;
}

export interface OwnedPaymentRow {
  id: string;
  owner_id: string;
  student_id: string;
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type RecipientResolution =
  | { ok: true; recipientPhone: string; recipientName: string }
  | { ok: false; status: 403 | 422; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ALERT_TYPES = new Set<AlimtalkAlertType>(['payment_request', 'payment_paid']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function hasUnsafeControlCharacters(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}

function requiredText(
  value: unknown,
  label: string,
  maximumCharacters: number,
): ValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `${label}이(가) 필요합니다.` };
  }
  if (characterCount(value) > maximumCharacters) {
    return { ok: false, error: `${label}은(는) ${maximumCharacters}자 이하여야 합니다.` };
  }
  if (hasUnsafeControlCharacters(value)) {
    return { ok: false, error: `${label}에 허용되지 않는 제어 문자가 포함되어 있습니다.` };
  }
  return { ok: true, value };
}

function optionalMessage(value: unknown): ValidationResult<string | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  return requiredText(value, '대체 문자 내용', ALIMTALK_LIMITS.messageCharacters);
}

export function isPaymentAlert(alertType: AlimtalkAlertType): boolean {
  return PAYMENT_ALERT_TYPES.has(alertType);
}

/**
 * Produces the only request shape accepted by the Edge Function. Extra client
 * fields (including recipientPhone/recipientName) are deliberately discarded.
 */
export function parseAlimtalkRequest(value: unknown): ValidationResult<ValidatedAlimtalkRequest> {
  if (!isRecord(value)) {
    return { ok: false, error: '요청 형식이 올바르지 않습니다.' };
  }

  const studentId = typeof value.studentId === 'string' ? value.studentId.trim() : '';
  if (!UUID_PATTERN.test(studentId)) {
    return { ok: false, error: '올바른 학생 식별자가 필요합니다.' };
  }

  if (
    typeof value.alertType !== 'string'
    || !ALIMTALK_ALERT_TYPES.includes(value.alertType as AlimtalkAlertType)
  ) {
    return { ok: false, error: '지원하지 않는 알림 유형입니다.' };
  }
  const alertType = value.alertType as AlimtalkAlertType;

  const rawPaymentId = typeof value.paymentId === 'string' ? value.paymentId.trim() : '';
  if (rawPaymentId && !UUID_PATTERN.test(rawPaymentId)) {
    return { ok: false, error: '올바른 수납 식별자가 필요합니다.' };
  }
  if (isPaymentAlert(alertType) && !rawPaymentId) {
    return { ok: false, error: '수납 알림에는 수납 식별자가 필요합니다.' };
  }

  const subject = requiredText(value.subject, '제목', ALIMTALK_LIMITS.subjectCharacters);
  if (!subject.ok) return subject;
  const message = requiredText(value.message, '메시지', ALIMTALK_LIMITS.messageCharacters);
  if (!message.ok) return message;
  const fallbackMessage = optionalMessage(value.fallbackMessage);
  if (!fallbackMessage.ok) return fallbackMessage;

  return {
    ok: true,
    value: {
      studentId,
      ...(rawPaymentId ? { paymentId: rawPaymentId } : {}),
      alertType,
      subject: subject.value,
      message: message.value,
      ...(fallbackMessage.value ? { fallbackMessage: fallbackMessage.value } : {}),
    },
  };
}

export function normalizeRecipientPhone(value: unknown): string {
  let digits = typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';
  if (digits.startsWith('0082')) digits = digits.slice(2);
  if (digits.startsWith('82') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isValidKoreanMobilePhone(value: string): boolean {
  return /^01[016789][0-9]{7,8}$/.test(value);
}

/**
 * Re-checks ownership even though DB queries also filter by owner_id. The
 * recipient is always resolved from the owned student row, never request data.
 */
export function resolveOwnedRecipient(
  ownerId: string,
  request: ValidatedAlimtalkRequest,
  student: OwnedStudentRow | null,
  payment: OwnedPaymentRow | null,
): RecipientResolution {
  if (
    !student
    || student.id !== request.studentId
    || student.owner_id !== ownerId
  ) {
    return { ok: false, status: 403, error: '해당 학생에게 발송할 권한이 없습니다.' };
  }

  if (request.paymentId) {
    if (
      !payment
      || payment.id !== request.paymentId
      || payment.owner_id !== ownerId
      || payment.student_id !== student.id
    ) {
      return { ok: false, status: 403, error: '해당 수납 내역으로 발송할 권한이 없습니다.' };
    }
  }

  const recipientPhone = normalizeRecipientPhone(student.parent_contact);
  if (!isValidKoreanMobilePhone(recipientPhone)) {
    return { ok: false, status: 422, error: '학생의 학부모 휴대전화 번호를 확인해 주세요.' };
  }

  return {
    ok: true,
    recipientPhone,
    recipientName: (student.name ?? '').trim().slice(0, 50),
  };
}
