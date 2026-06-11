import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildParentNoticeDraft, getNoticeDraftMeta } from '../src/lib/noticeDrafts';
import { localMonth, localToday } from '../src/lib/dateUtils';
import { getMakeupSummary, hasMakeupForAbsence } from '../src/lib/makeupUtils';
import { isAttendedStatus, normalizeAttendanceStatus } from '../src/lib/attendanceStatus';
import {
  deriveLegacyClassScheduleFields,
  getClassScheduleLabel,
  getClassSchedules,
  getSchedulesForDay,
} from '../src/lib/classSchedules';
import type { Attendance, Class, MakeupReservation, Student } from '../src/types';

const student: Student = {
  id: 'stu-1',
  name: '김연아',
  school: '그로잉초',
  grade: '5',
  contact: '',
  parentContact: '010-1234-5678',
  registrationDate: '2026-01-01',
  status: 'active',
  memo: '',
};

const att = (overrides: Partial<Attendance>): Attendance => ({
  id: 'att-1',
  studentId: 'stu-1',
  classId: 'cls-1',
  date: '2026-06-10',
  status: 'present',
  memo: '',
  ...overrides,
});

const reservation = (overrides: Partial<MakeupReservation>): MakeupReservation => ({
  id: 'res-1',
  studentId: 'stu-1',
  classId: 'cls-1',
  scheduledDate: '2026-06-15',
  scheduledTime: '17:00',
  sourceAbsenceDate: '2026-06-10',
  reason: 'absence',
  memo: '',
  status: 'scheduled',
  createdAt: '2026-06-10T00:00:00Z',
  ...overrides,
});

const noticeInput = (rows: Attendance[], includeMakeup = true, makeupReservations: MakeupReservation[] = []) => ({
  student,
  classes: [],
  attendance: rows,
  makeupReservations,
  payments: [],
  counselLogs: [],
  month: '2026-06',
  today: '2026-06-10',
  include: { attendance: true, homework: true, makeup: includeMakeup },
});

describe('알림장 (noticeDrafts)', () => {
  it('보충은 출결에 "출석"으로만 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([att({ status: 'supplement', supplementMinutes: 30 })]));
    expect(draft).toContain('출결: 출석');
    expect(draft).not.toContain('출결: 보충');
    expect(draft).not.toContain('출석 (보충');
  });

  it('보강은 결석 날짜와 함께 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([att({ status: 'makeup', makeupForDate: '2026-06-03' })]));
    expect(draft).toContain('출결: 보강 (6월 3일 결석분)');
  });

  it('등원/하원 시간이 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([att({ checkInTime: '14:00', checkOutTime: '15:30' })]));
    expect(draft).toContain('등원/하원: 14:00 / 15:30');
  });

  it('기록이 없으면 "기록 없음"으로 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([]));
    expect(draft).toContain('출결: 기록 없음');
    expect(draft).toContain('과제: 기록 없음');
  });

  it('보강/보충 항목 제외 시 "해당 없음"', () => {
    const draft = buildParentNoticeDraft(noticeInput([att({ status: 'supplement', supplementMinutes: 30 })], false));
    expect(draft).toContain('보강/보충: 해당 없음');
  });

  it('과제 상태 라벨', () => {
    const draft = buildParentNoticeDraft(noticeInput([att({ homeworkStatus: 'done' })]));
    expect(draft).toContain('과제: 완료');
  });

  it('getNoticeDraftMeta는 오늘 기록만 요약한다', () => {
    const meta = getNoticeDraftMeta({
      ...noticeInput([
        att({ date: '2026-06-10', status: 'supplement' }),
        att({ id: 'att-2', date: '2026-06-09', status: 'absent' }),
      ]),
    });
    expect(meta.attendance).toBe('출석');
  });

  it('결석한 날 보강 예약이 있으면 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([
      att({ status: 'absent' }),
      att({ id: 'att-2', date: '2026-06-15', status: 'makeup', makeupForDate: '2026-06-10' }),
    ]));
    expect(draft).toContain('보강 예약: 6월 15일');
  });

  it('출석한 날도 미래 보강 예약이 있으면 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput([
      att({ status: 'present' }),
      att({ id: 'att-2', date: '2026-06-15', status: 'makeup', makeupForDate: '2026-06-03' }),
    ]));
    expect(draft).toContain('보강 예약: 6월 15일');
  });

  it('보강 예약은 include.makeup이 false면 표시되지 않는다', () => {
    const draft = buildParentNoticeDraft(noticeInput([
      att({ status: 'absent' }),
      att({ id: 'att-2', date: '2026-06-15', status: 'makeup', makeupForDate: '2026-06-10' }),
    ], false));
    expect(draft).toContain('보강/보충: 해당 없음');
    expect(draft).not.toContain('보강 예약');
  });

  it('진행 전 보강 예약(MakeupReservation)이 결석일과 함께 표시된다', () => {
    const draft = buildParentNoticeDraft(noticeInput(
      [att({ status: 'absent' })],
      true,
      [reservation({})],
    ));
    expect(draft).toContain('6월 10일 결석분 6월 15일 17:00 보강 예약');
  });

  it('완료/취소된 예약과 지난 예약은 알림장에 표시되지 않는다', () => {
    const draft = buildParentNoticeDraft(noticeInput(
      [att({ status: 'present' })],
      true,
      [
        reservation({ id: 'res-done', status: 'completed', scheduledDate: '2026-05-20', sourceAbsenceDate: '2026-05-15' }),
        reservation({ id: 'res-cancel', status: 'cancelled' }),
        reservation({ id: 'res-past', scheduledDate: '2026-06-01', sourceAbsenceDate: '2026-05-28' }),
      ],
    ));
    expect(draft).not.toContain('보강 예약');
    expect(draft).toContain('보강/보충: 해당 없음');
  });
});

describe('날짜 유틸 (dateUtils)', () => {
  afterEach(() => vi.useRealTimers());

  it('localToday는 로컬 기준 YYYY-MM-DD를 반환한다 (자정 직전에도 당일 유지)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 30, 0));
    expect(localToday()).toBe('2026-01-31');
  });

  it('localMonth는 YYYY-MM을 반환한다 (한 자리 월 0 패딩)', () => {
    expect(localMonth(new Date(2026, 0, 5))).toBe('2026-01');
    expect(localMonth(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('보강 계산 (makeupUtils)', () => {
  const absent = att({ id: 'a-1', status: 'absent', date: '2026-06-01' });
  const makeupDone = att({ id: 'a-2', status: 'makeup', date: '2026-06-05', makeupForDate: '2026-06-01' });

  it('결석에 보강 기록이 없으면 needed에 포함', () => {
    const summary = getMakeupSummary([student], [], [absent]);
    expect(summary.needed).toHaveLength(1);
    expect(summary.needed[0].absentRecord.date).toBe('2026-06-01');
    expect(summary.completed).toHaveLength(0);
  });

  it('보강 완료된 결석은 needed에서 빠지고 completed에 결석 기록이 연결된다', () => {
    const summary = getMakeupSummary([student], [], [absent, makeupDone]);
    expect(summary.needed).toHaveLength(0);
    expect(summary.completed).toHaveLength(1);
    expect(summary.completed[0].absentRecord?.id).toBe('a-1');
  });

  it('needed는 최신 결석 순으로 정렬된다', () => {
    const older = att({ id: 'a-3', status: 'absent', date: '2026-05-20' });
    const summary = getMakeupSummary([student], [], [older, absent]);
    expect(summary.needed.map(item => item.absentRecord.date)).toEqual(['2026-06-01', '2026-05-20']);
  });

  it('hasMakeupForAbsence는 학생·반·날짜가 모두 일치할 때만 true', () => {
    expect(hasMakeupForAbsence([makeupDone], 'stu-1', 'cls-1', '2026-06-01')).toBe(true);
    expect(hasMakeupForAbsence([makeupDone], 'stu-1', 'cls-2', '2026-06-01')).toBe(false);
    expect(hasMakeupForAbsence([makeupDone], 'stu-1', 'cls-1', '2026-06-02')).toBe(false);
  });
});

describe('출결 상태 (attendanceStatus)', () => {
  it('지각은 출석으로 정규화된다', () => {
    expect(normalizeAttendanceStatus('late')).toBe('present');
    expect(normalizeAttendanceStatus('supplement')).toBe('supplement');
  });

  it('결석만 미출석으로 판정된다', () => {
    expect(isAttendedStatus('absent')).toBe(false);
    expect(isAttendedStatus('late')).toBe(true);
    expect(isAttendedStatus('makeup')).toBe(true);
  });
});

describe('수업 스케줄 (classSchedules)', () => {
  const baseClass: Class = {
    id: 'cls-1',
    name: 'MH반',
    days: ['월', '수'],
    startTime: '14:00',
    endTime: '15:30',
    schedules: [],
    tuitionFee: 0,
    tuitionOverrides: {},
    studentIds: [],
  };

  it('요일별 schedules가 있으면 기본 시간 대신 그것을 사용한다', () => {
    const cls: Class = {
      ...baseClass,
      schedules: [
        { day: '월', startTime: '16:00', endTime: '17:30' },
        { day: '수', startTime: '18:00', endTime: '19:30' },
      ],
    };
    expect(getSchedulesForDay(cls, '수')).toEqual([{ day: '수', startTime: '18:00', endTime: '19:30' }]);
    expect(getClassScheduleLabel(cls)).toBe('월 16:00~17:30, 수 18:00~19:30');
  });

  it('schedules가 없으면 레거시 days + 기본 시간으로 보정한다', () => {
    expect(getClassSchedules(baseClass)).toEqual([
      { day: '월', startTime: '14:00', endTime: '15:30' },
      { day: '수', startTime: '14:00', endTime: '15:30' },
    ]);
  });

  it('deriveLegacyClassScheduleFields는 요일을 중복 없이 추출한다', () => {
    const legacy = deriveLegacyClassScheduleFields([
      { day: '월', startTime: '16:00', endTime: '17:00' },
      { day: '월', startTime: '18:00', endTime: '19:00' },
      { day: '금', startTime: '16:00', endTime: '17:00' },
    ]);
    expect(legacy.days).toEqual(['월', '금']);
    expect(legacy.startTime).toBe('16:00');
  });
});
