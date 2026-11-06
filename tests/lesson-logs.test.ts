import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

import type { Attendance, Class, HolidaySettings, Student } from '../src/types';
import {
  buildMonthRows,
  closedTitle,
  isAbsent,
  formatDayTitle,
  monthDates,
  shiftDay,
  shiftMonth,
  suggestContents,
  toggleClosedDay,
  weekdayOf,
  type LessonLog,
} from '../src/lib/lessonLogs';

const student = (id: string, name: string, status: Student['status'] = 'active'): Student => ({
  id, name, status, school: '', grade: '', contact: '', parentContact: '', registrationDate: '', memo: '',
});

const students = [student('s1', '강동혁'), student('s2', '강채은'), student('s3', '퇴원생', 'inactive')];

const aPlus: Class = {
  id: 'c1',
  name: 'A+',
  days: ['금'],
  startTime: '15:00',
  endTime: '16:00',
  schedules: [{ day: '금', startTime: '15:00', endTime: '16:00' }],
  tuitionFee: 0,
  tuitionOverrides: {},
  studentIds: ['s1', 's2', 's3'],
};

const noHolidays: HolidaySettings = { holidayAutoClose: true, calendarExceptions: [] };

describe('lesson log month rows', () => {
  it('creates one row per scheduled class day with active students', () => {
    const { rows } = buildMonthRows({ month: '2026-11', classes: [aPlus], students, logs: [], holidaySettings: noHolidays });
    expect(rows.map(row => row.date)).toEqual(['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
    expect(rows[0]).toMatchObject({ startTime: '15:00', endTime: '16:00', className: 'A+', studentIds: ['s1', 's2'], content: '', logId: null, fromSchedule: true });
    expect(weekdayOf('2026-11-06')).toBe('금');
  });

  it('skips closed days and lists them separately', () => {
    const settings: HolidaySettings = { holidayAutoClose: true, calendarExceptions: [{ date: '2026-11-13', kind: 'closed', title: '휴강' }] };
    const { rows, closedDays } = buildMonthRows({ month: '2026-11', classes: [aPlus], students, logs: [], holidaySettings: settings });
    expect(rows.map(row => row.date)).not.toContain('2026-11-13');
    expect(closedDays).toEqual([{ date: '2026-11-13', title: '휴강' }]);
  });

  it('merges saved logs into schedule rows and keeps extra saved rows', () => {
    const logs: LessonLog[] = [
      { id: 'l1', date: '2026-11-06', startTime: '15:00', endTime: '16:00', classId: 'c1', className: 'A+', studentIds: ['s1'], content: 'Read it 120-2 Unit 3', hidden: false },
      { id: 'l2', date: '2026-11-07', startTime: '10:00', endTime: '11:00', classId: 'c1', className: 'A+', studentIds: ['s2'], content: '보강', hidden: false },
    ];
    const { rows } = buildMonthRows({ month: '2026-11', classes: [aPlus], students, logs, holidaySettings: noHolidays });
    expect(rows[0]).toMatchObject({ logId: 'l1', content: 'Read it 120-2 Unit 3', studentIds: ['s1'], fromSchedule: true });
    expect(rows[1]).toMatchObject({ logId: 'l2', date: '2026-11-07', fromSchedule: false });
    expect(rows).toHaveLength(5);
  });
});

describe('closed days', () => {
  it('follows exceptions first, then public holidays when auto close is on', () => {
    expect(closedTitle('2026-12-25', noHolidays)).toBe('기독탄신일');
    expect(closedTitle('2026-12-25', { ...noHolidays, holidayAutoClose: false })).toBeNull();
    expect(closedTitle('2026-12-25', { holidayAutoClose: true, calendarExceptions: [{ date: '2026-12-25', kind: 'open', title: '수업' }] })).toBeNull();
    expect(closedTitle('2026-11-06', noHolidays)).toBeNull();
  });

  it('toggles a regular day closed and a public holiday open', () => {
    expect(toggleClosedDay(noHolidays, '2026-11-06')).toEqual([{ date: '2026-11-06', kind: 'closed', title: '휴강' }]);
    const closed = { ...noHolidays, calendarExceptions: [{ date: '2026-11-06', kind: 'closed' as const, title: '휴강' }] };
    expect(toggleClosedDay(closed, '2026-11-06')).toEqual([]);
    expect(toggleClosedDay(noHolidays, '2026-12-25')).toEqual([{ date: '2026-12-25', kind: 'open', title: '수업' }]);
  });

  it('handles month helpers', () => {
    expect(monthDates('2026-02')).toHaveLength(28);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(formatDayTitle('2026-11-06')).toBe('11월 6일 (금)');
  });
});

describe('absence and content suggestions', () => {
  it('reads absence from attendance for the row class and date', () => {
    const attendance = [{ id: 'a1', studentId: 's1', classId: 'c1', date: '2026-11-06', status: 'absent', memo: '' }] as Attendance[];
    expect(isAbsent(attendance, 's1', 'c1', '2026-11-06')).toBe(true);
    expect(isAbsent(attendance, 's2', 'c1', '2026-11-06')).toBe(false);
    expect(isAbsent(attendance, 's1', null, '2026-11-06')).toBe(false);
  });

  it('suggests past contents containing the typed text, same class and recent first', () => {
    const history = [
      { content: 'Read it 120-2 Unit 2', classId: 'c1', date: '2026-10-30' },
      { content: 'Read it 120-2 Unit 1', classId: 'c2', date: '2026-11-01' },
      { content: 'Grammar Inside 3', classId: 'c1', date: '2026-11-02' },
      { content: 'Read it 120-2 Unit 2', classId: 'c1', date: '2026-10-23' },
    ];
    expect(suggestContents(history, 'read', 'c1')).toEqual(['Read it 120-2 Unit 2', 'Read it 120-2 Unit 1']);
    expect(suggestContents(history, 'unit', 'c2')[0]).toBe('Read it 120-2 Unit 1');
    expect(suggestContents(history, '', 'c1')).toEqual([]);
    expect(suggestContents(history, 'Grammar Inside 3', 'c1')).toEqual([]);
  });
});

describe('lesson log migration', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261106075833_growing_lesson_logs.sql', import.meta.url), 'utf8').toLowerCase();

  it('keeps logs owner-scoped', () => {
    expect(sql).toContain('alter table growing_lesson_logs enable row level security');
    expect(sql).toContain('for select using (auth.uid() = owner_id)');
    expect(sql).toContain('for insert with check (auth.uid() = owner_id)');
    expect(sql).not.toContain('drop policy');
  });
});
