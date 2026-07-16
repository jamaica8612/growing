import { describe, expect, it } from 'vitest';
import {
  isNormalizedHolidaySettings,
  normalizeCalendarExceptions,
  normalizeHolidaySettings,
} from '../src/lib/holidaySettings';

describe('카카오 휴강 설정 정규화', () => {
  it('유효한 예외만 날짜순으로 정리하고 같은 날짜는 마지막 설정을 사용한다', () => {
    expect(normalizeCalendarExceptions([
      { date: '2026-08-15', kind: 'closed', title: '광복절' },
      { date: 'not-a-date', kind: 'closed', title: '잘못된 날짜' },
      { date: '2026-05-05', kind: 'closed', title: '  어린이날  ' },
      { date: '2026-08-15', kind: 'open', title: '  정상   수업  ' },
      { date: '2026-12-25', kind: 'unknown', title: '잘못된 구분' },
      { date: '2026-12-31', kind: 'closed', title: '   ' },
    ])).toEqual([
      { date: '2026-05-05', kind: 'closed', title: '어린이날' },
      { date: '2026-08-15', kind: 'open', title: '정상 수업' },
    ]);
  });

  it('기존 행에 새 필드가 없으면 공휴일 자동 휴강을 기본으로 켠다', () => {
    expect(normalizeHolidaySettings(undefined, null)).toEqual({
      holidayAutoClose: true,
      calendarExceptions: [],
    });
  });

  it('명시적으로 끈 설정은 유지한다', () => {
    expect(normalizeHolidaySettings(false, [])).toEqual({
      holidayAutoClose: false,
      calendarExceptions: [],
    });
  });

  it('제어 문자를 저장하지 않는다', () => {
    expect(normalizeCalendarExceptions([
      { date: '2026-07-20', kind: 'closed', title: '여름\n\u0000 방학' },
    ])).toEqual([
      { date: '2026-07-20', kind: 'closed', title: '여름 방학' },
    ]);
  });

  it('백업용 설정은 무효 날짜, 중복 날짜, 정규화되지 않은 제목을 거부한다', () => {
    expect(isNormalizedHolidaySettings({
      holidayAutoClose: true,
      calendarExceptions: [{ date: '2026-07-20', kind: 'closed', title: '여름방학' }],
    })).toBe(true);
    expect(isNormalizedHolidaySettings({
      holidayAutoClose: true,
      calendarExceptions: [{ date: '2026-02-30', kind: 'closed', title: '잘못된 날짜' }],
    })).toBe(false);
    expect(isNormalizedHolidaySettings({
      holidayAutoClose: true,
      calendarExceptions: [
        { date: '2026-07-20', kind: 'closed', title: '여름방학' },
        { date: '2026-07-20', kind: 'open', title: '정상 수업' },
      ],
    })).toBe(false);
    expect(isNormalizedHolidaySettings({
      holidayAutoClose: true,
      calendarExceptions: [{ date: '2026-07-20', kind: 'closed', title: ' 여름방학 ' }],
    })).toBe(false);
  });
});
