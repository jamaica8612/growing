import { describe, expect, it } from 'vitest';
import {
  type KakaoSkillPayload,
  getAction,
  isCounselCancellation,
  isScheduleInquiry,
  isCounselPlaceholder,
  makeMenuReplies,
  parseConnectInput,
  skillText,
  cleanPhone,
  extractPhone,
} from '../supabase/functions/kakao-skill/logic.ts';

const buttonPayload = (action: string, studentId?: string): KakaoSkillPayload => ({
  action: { clientExtra: studentId ? { action, student_id: studentId } : { action } },
  userRequest: { utterance: '버튼 라벨' },
});

const textPayload = (utterance: string): KakaoSkillPayload => ({
  userRequest: { utterance },
});

describe('getAction — 버튼(clientExtra) 라우팅', () => {
  it.each([
    ['connect_student', 'connect_student'],
    ['connect_student_confirm', 'connect_student_confirm'],
    ['schedule_info', 'schedule_info'],
    ['attendance_today', 'attendance_today'],
    ['homework_today', 'homework_today'],
    ['counsel_request', 'counsel_request'],
    ['counsel_consent_confirm', 'counsel_consent_confirm'],
    ['counsel_cancel', 'counsel_cancel'],
    ['counsel_cancel_confirm', 'counsel_cancel_confirm'],
    ['ask_ai', 'ask_ai'],
    ['student_menu', 'student_menu'],
    ['unlink_student', 'unlink_student'],
  ])('%s 버튼 → %s', (extra, expected) => {
    expect(getAction(buttonPayload(extra))).toBe(expected);
  });

  it('unlink_student는 "연결" 포함이지만 connect로 오인하지 않는다', () => {
    expect(getAction(buttonPayload('unlink_student'))).toBe('unlink_student');
  });
});

describe('getAction — 자유 입력 라우팅', () => {
  it.each([
    '휴강일 알려주세요',
    '대체공휴일에도 수업하나요?',
    '이번 공휴일은 학원 쉬나요',
    '내일 수업 있어요?',
    '오늘 학원 가나요?',
    '8월 17일 학원 가나요?',
    '2026-08-17 학원 가나요?',
    '학원 가나요?',
    '내일 쉬나요?',
    '수업하나요',
    '수업 하냐?',
    '오늘 수업해요?',
    '내일 학원 쉬나요?',
    '낼 수업해?',
    '담주 수업 있어요?',
    '8/17 학원 가나요?',
    '2026.8.17 수업하나요?',
    '추석 쉬나요?',
    '설에 쉬나요?',
    '광복절 수업해요?',
  ])('일정 질문 "%s" → schedule_info', utterance => {
    expect(getAction(textPayload(utterance))).toBe('schedule_info');
  });

  it('"상담" 단독 입력 → counsel_request', () => {
    expect(getAction(textPayload('상담'))).toBe('counsel_request');
  });

  it('"입학상담" 등 상담 포함 텍스트 → counsel_request', () => {
    expect(getAction(textPayload('입학상담'))).toBe('counsel_request');
    expect(getAction(textPayload('레벨 테스트 상담 받고 싶어요'))).toBe('counsel_request');
  });

  it.each(['상담 취소', '상담 취소해주세요', '상담 요청을 철회할게요', '문의 접수 취소'])('상담 취소 표현 "%s" → counsel_cancel', utterance => {
    expect(getAction(textPayload(utterance))).toBe('counsel_cancel');
  });

  it('"연결 해제" / "연결해제" 직접 입력 → unlink_student', () => {
    expect(getAction(textPayload('연결 해제'))).toBe('unlink_student');
    expect(getAction(textPayload('연결해제 해주세요'))).toBe('unlink_student');
  });

  it('학생 연결 의도와 이름 + 전체 휴대폰 입력 → connect_student', () => {
    expect(getAction(textPayload('학생 연결하고 싶어요'))).toBe('connect_student');
    expect(getAction(textPayload('김서윤 010-1234-5678'))).toBe('connect_student');
    expect(getAction(textPayload('김서윤 학생 연결 01012345678'))).toBe('connect_student');
  });

  it('예전 8자리 연결코드는 더 이상 학생 연결로 라우팅하지 않는다', () => {
    expect(getAction(textPayload('연결 A1B2C3D4'))).toBe('menu');
    expect(getAction(textPayload('A1B2C3D4'))).toBe('menu');
  });

  it('상담 내용에 포함된 휴대폰 번호는 학생 연결로 오분류하지 않는다', () => {
    expect(getAction(textPayload('입학 문의드려요. 010-1234-5678'))).toBe('menu');
    expect(getAction(textPayload('010-1234-5678'))).toBe('menu');
  });

  it('지원 범위 밖의 일반 질문 → 안전한 menu', () => {
    expect(getAction(textPayload('이번 달 출석 어때요?'))).toBe('menu');
    expect(getAction(textPayload('숙제 잘 하고 있나요'))).toBe('menu');
    expect(getAction(textPayload('아이 진도가 궁금해요'))).toBe('menu');
  });

  it('인사말/메뉴 단어 → menu', () => {
    expect(getAction(textPayload('안녕하세요'))).toBe('menu');
    expect(getAction(textPayload('메뉴'))).toBe('menu');
    expect(getAction(textPayload('하이'))).toBe('menu');
  });

  it('짧은 입력(3자 이하) → menu', () => {
    expect(getAction(textPayload('ㅇㅇ'))).toBe('menu');
  });
});

describe('parseConnectInput', () => {
  it('이름 + 뒷 4자리는 연결정보로 사용하지 않는다', () => {
    expect(parseConnectInput(textPayload('김서윤 1234'))).toEqual({ studentName: '', phone: '' });
  });

  it('이름 + 전체 휴대폰 번호(11자리)가 4자리로 잘리지 않는다', () => {
    expect(parseConnectInput(textPayload('김서윤 01012345678'))).toEqual({
      studentName: '김서윤',
      phone: '01012345678',
    });
  });

  it('이름 + 하이픈 포함 전체 휴대폰 번호', () => {
    expect(parseConnectInput(textPayload('김서윤 010-1234-5678'))).toEqual({
      studentName: '김서윤',
      phone: '01012345678',
    });
  });

  it('"학생/연결" 등 군더더기 단어 제거', () => {
    expect(parseConnectInput(textPayload('김서윤 학생 연결 010-1234-5678'))).toEqual({
      studentName: '김서윤',
      phone: '01012345678',
    });
  });

  it('params로 들어온 경우', () => {
    const payload: KakaoSkillPayload = {
      action: { params: { studentName: '이준호', phone: '010-1234-5678' } },
    };
    expect(parseConnectInput(payload)).toEqual({ studentName: '이준호', phone: '01012345678' });
  });
});

describe('isCounselPlaceholder', () => {
  it.each(['', '상담', '상담 요청', '상담요청', '💬 상담 요청'])('"%s" → placeholder', value => {
    expect(isCounselPlaceholder(value)).toBe(true);
  });

  it.each(['입학상담 문의드려요', '아이 진도가 궁금해요', '레벨 상담'])('"%s" → 실제 사유', value => {
    expect(isCounselPlaceholder(value)).toBe(false);
  });
});

describe('isCounselCancellation', () => {
  it.each(['상담 취소', '상담 요청 철회', '문의는 안 할게요'])('"%s" → true', value => {
    expect(isCounselCancellation(value)).toBe(true);
  });

  it.each(['상담', '입학 문의드려요', '수업 취소인가요?'])('"%s" → false', value => {
    expect(isCounselCancellation(value)).toBe(false);
  });
});

describe('makeMenuReplies', () => {
  it('휴강일 안내 버튼을 항상 포함한다', () => {
    const reply = makeMenuReplies('sid-1').find(r => r.action === 'schedule_info');
    expect(reply).toEqual({ label: '📅 휴강일 안내', action: 'schedule_info', studentId: 'sid-1' });
  });

  it('학생 연결 시 연결 해제 버튼 포함', () => {
    const labels = makeMenuReplies('sid-1').map(r => r.label);
    expect(labels).toContain('🔗 연결 해제');
    expect(labels).not.toContain('🔄 자녀 전환');
  });

  it('다자녀(showSwitch)일 때 자녀 전환 버튼 포함', () => {
    const labels = makeMenuReplies('sid-1', true).map(r => r.label);
    expect(labels).toContain('🔄 자녀 전환');
    expect(labels).toContain('🔗 연결 해제');
  });

  it('학생 미지정 시 연결 해제 버튼 없음', () => {
    const labels = makeMenuReplies().map(r => r.label);
    expect(labels).not.toContain('🔗 연결 해제');
  });

  it('개인정보를 외부 AI로 보내는 아이비 버튼을 노출하지 않는다', () => {
    expect(makeMenuReplies('sid-1').some(r => r.action === 'ask_ai')).toBe(false);
  });
});

describe('isScheduleInquiry', () => {
  it.each([
    '휴강',
    '대체 공휴일',
    '내일 수업',
    '오늘 학원 가나요',
    '내일 쉬나요',
    '낼 수업해?',
    '담주 학원 쉬나요?',
    '8월 17일 학원 가나요',
    '8/17 학원 가나요',
    '2026-08-17 학원 가나요',
    '2026.8.17 수업하나요',
    '추석 쉬나요',
    '설에 쉬나요',
    '광복절 수업하나요',
    '학원 가나요',
    '수업 있나요',
    '수업 하냐?',
  ])('"%s" → true', value => {
    expect(isScheduleInquiry(value)).toBe(true);
  });

  it.each(['이번 달 출석 어때요?', '숙제 잘 하고 있나요', '입학 상담'])('"%s" → false', value => {
    expect(isScheduleInquiry(value)).toBe(false);
  });
});

describe('skillText', () => {
  it('studentId가 extra.student_id로 전달된다', () => {
    const res = skillText('안내', [{ label: '📅 오늘 출결', action: 'attendance_today', studentId: 'sid-1' }]);
    expect(res.template.quickReplies[0].extra).toEqual({ action: 'attendance_today', student_id: 'sid-1' });
  });

  it('messageText 기본값은 label', () => {
    const res = skillText('안내', [{ label: '💬 상담 요청', action: 'counsel_request' }]);
    expect(res.template.quickReplies[0].messageText).toBe('💬 상담 요청');
  });

  it('학생 연결 동의 버튼은 해당 확인 요청 nonce를 함께 전달한다', () => {
    const nonce = 'a'.repeat(32);
    const res = skillText('연결 동의', [{
      label: '동의하고 연결',
      action: 'connect_student_confirm',
      connectNonce: nonce,
    }]);
    expect(res.template.quickReplies[0].extra).toEqual({
      action: 'connect_student_confirm',
      connect_nonce: nonce,
    });
  });

  it('카카오 simpleText/quick reply 길이와 개수 제한을 중앙에서 보장한다', () => {
    const replies = Array.from({ length: 12 }, (_, index) => ({
      label: `매우 긴 바로가기 라벨 ${index}`,
      action: 'student_menu',
      studentId: `sid-${index}`,
      messageText: '나'.repeat(1_000),
    }));
    const res = skillText('가'.repeat(1_000), replies);

    expect(res.template.outputs[0].simpleText.text.length).toBeLessThanOrEqual(950);
    expect(res.template.quickReplies).toHaveLength(10);
    expect(res.template.quickReplies.every(reply => reply.label.length <= 14)).toBe(true);
    expect(res.template.quickReplies.every(reply => reply.messageText.length <= 950)).toBe(true);
  });

  it('같은 action과 studentId의 quick reply는 한 번만 노출한다', () => {
    const res = skillText('안내', [
      { label: '첫 번째', action: 'student_menu', studentId: 'sid-1' },
      { label: '중복', action: 'student_menu', studentId: 'sid-1' },
      { label: '다른 학생', action: 'student_menu', studentId: 'sid-2' },
    ]);

    expect(res.template.quickReplies.map(reply => reply.label)).toEqual(['첫 번째', '다른 학생']);
  });
});

describe('cleanPhone', () => {
  it('숫자만 남긴다', () => {
    expect(cleanPhone('010-1234-5678')).toBe('01012345678');
  });
});

describe('extractPhone', () => {
  it('자유 텍스트에서 전화번호 추출', () => {
    expect(extractPhone('입학 문의드려요. 010-1234-5678')).toBe('01012345678');
    expect(extractPhone('레벨 테스트 받고 싶어요 01098765432')).toBe('01098765432');
    expect(extractPhone('공백 없이 01012345678입니다')).toBe('01012345678');
  });

  it('전화번호 없으면 빈 문자열', () => {
    expect(extractPhone('입학 문의드려요')).toBe('');
    expect(extractPhone('')).toBe('');
  });
});
