import { describe, expect, it } from 'vitest';
import {
  ALIMTALK_LIMITS,
  normalizeRecipientPhone,
  parseAlimtalkRequest,
  resolveOwnedRecipient,
  type OwnedPaymentRow,
  type OwnedStudentRow,
} from '../supabase/functions/send-alimtalk/policy';

const ownerId = '10000000-0000-4000-8000-000000000001';
const otherOwnerId = '20000000-0000-4000-8000-000000000002';
const studentId = '30000000-0000-4000-8000-000000000003';
const paymentId = '40000000-0000-4000-8000-000000000004';

const student: OwnedStudentRow = {
  id: studentId,
  owner_id: ownerId,
  name: '김연아',
  parent_contact: '010-1234-5678',
};

const payment: OwnedPaymentRow = {
  id: paymentId,
  owner_id: ownerId,
  student_id: studentId,
};

const validRequest = () => ({
  studentId,
  alertType: 'custom',
  subject: '일일 종합알림장',
  message: '오늘의 출결과 과제 내용입니다.',
  fallbackMessage: '오늘의 출결과 과제 내용입니다.',
});

describe('send-alimtalk request policy', () => {
  it('requires a student id for every send', () => {
    const parsed = parseAlimtalkRequest({ ...validRequest(), studentId: undefined });
    expect(parsed).toEqual({ ok: false, error: '올바른 학생 식별자가 필요합니다.' });
  });

  it('drops caller-controlled recipient fields from the validated body', () => {
    const parsed = parseAlimtalkRequest({
      ...validRequest(),
      recipientPhone: '010-9999-9999',
      recipientName: '공격자 지정 이름',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toHaveProperty('recipientPhone');
    expect(parsed.value).not.toHaveProperty('recipientName');
  });

  it('requires an owned payment id for payment alert types', () => {
    const parsed = parseAlimtalkRequest({ ...validRequest(), alertType: 'payment_request' });
    expect(parsed).toEqual({ ok: false, error: '수납 알림에는 수납 식별자가 필요합니다.' });
  });

  it('rejects unknown alert types and oversized messages', () => {
    expect(parseAlimtalkRequest({ ...validRequest(), alertType: 'spam' }).ok).toBe(false);
    expect(parseAlimtalkRequest({
      ...validRequest(),
      message: '가'.repeat(ALIMTALK_LIMITS.messageCharacters + 1),
    }).ok).toBe(false);
  });

  it('resolves the phone and name only from the owned student row', () => {
    const parsed = parseAlimtalkRequest(validRequest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveOwnedRecipient(ownerId, parsed.value, student, null)).toEqual({
      ok: true,
      recipientPhone: '01012345678',
      recipientName: '김연아',
    });
  });

  it('rejects a student owned by another authenticated user', () => {
    const parsed = parseAlimtalkRequest(validRequest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveOwnedRecipient(ownerId, parsed.value, { ...student, owner_id: otherOwnerId }, null)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('rejects a payment that belongs to a different owner or student', () => {
    const parsed = parseAlimtalkRequest({
      ...validRequest(),
      alertType: 'payment_paid',
      paymentId,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(resolveOwnedRecipient(ownerId, parsed.value, student, { ...payment, owner_id: otherOwnerId })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(resolveOwnedRecipient(ownerId, parsed.value, student, {
      ...payment,
      student_id: '50000000-0000-4000-8000-000000000005',
    })).toMatchObject({ ok: false, status: 403 });
  });

  it('normalizes Korean country-code mobile numbers and rejects invalid saved contacts', () => {
    expect(normalizeRecipientPhone('+82 10-1234-5678')).toBe('01012345678');

    const parsed = parseAlimtalkRequest(validRequest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveOwnedRecipient(ownerId, parsed.value, { ...student, parent_contact: '02-123-4567' }, null)).toMatchObject({
      ok: false,
      status: 422,
    });
  });
});
