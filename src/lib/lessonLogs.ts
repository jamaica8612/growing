import * as XLSX from 'xlsx';
import type { Attendance, CalendarException, Class, DayOfWeek, HolidaySettings, Student } from '../types';
import { FALLBACK_HOLIDAYS } from '../../supabase/functions/kakao-skill/holiday-calendar';
import { getClassSchedules } from './classSchedules';
import { supabase } from './supabase';

// ============================================================================
// 수업 일지
//   한 달 화면은 반 시간표로 수업 줄을 만들어 보여 준다(휴강일 제외).
//   수업 내용을 적거나, 줄을 직접 추가·숨기면 growing_lesson_logs에 저장한다.
//   결석(학생 이름 빨간 줄)은 출결(growing_attendance)의 결석 상태를 그대로 쓴다.
//   휴강일은 카카오 채널의 학원 휴원일 달력(growing_settings)과 같은 것을 쓴다.
// ============================================================================

export interface LessonLog {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  classId: string | null;
  className: string;
  studentIds: string[];
  content: string;
  hidden: boolean;
}

export interface LessonRow {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  classId: string | null;
  className: string;
  studentIds: string[];
  content: string;
  logId: string | null;
  hidden: boolean;
  fromSchedule: boolean;
}

export interface ClosedDay {
  date: string;
  title: string;
}

export interface ContentHistoryItem {
  content: string;
  classId: string | null;
  date: string;
}

const WEEKDAYS: DayOfWeek[] = ['일', '월', '화', '수', '목', '금', '토'];

export const weekdayOf = (date: string): DayOfWeek => WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];

export function monthDates(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(year, mon, 0).getDate();
  return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

export const shiftMonth = (month: string, amount: number): string => {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const shiftDay = (date: string, amount: number): string => {
  const [year, mon, dayOfMonth] = date.split('-').map(Number);
  const next = new Date(year, mon - 1, dayOfMonth + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

export const publicHolidayNames = (date: string): string[] => FALLBACK_HOLIDAYS[date.slice(0, 4)]?.[date] ?? [];

// 학원 휴원일 규칙: 직접 정한 날(휴강/수업)이 먼저, 그다음 공휴일(자동 휴강 켜짐일 때).
export function closedTitle(date: string, settings: HolidaySettings): string | null {
  const exception = settings.calendarExceptions.find(item => item.date === date);
  if (exception) return exception.kind === 'closed' ? exception.title : null;
  const names = publicHolidayNames(date);
  return names.length > 0 && settings.holidayAutoClose ? names.join(', ') : null;
}

// 달력에서 날짜를 눌렀을 때: 수업일 → 휴강, 휴강 → 수업일.
// 공휴일을 수업일로 바꾸면 'open' 예외로, 직접 정한 휴강을 풀면 예외를 지운다.
export function toggleClosedDay(settings: HolidaySettings, date: string): CalendarException[] {
  const others = settings.calendarExceptions.filter(item => item.date !== date);
  const holiday = publicHolidayNames(date).length > 0 && settings.holidayAutoClose;
  if (closedTitle(date, settings) !== null) {
    return holiday ? [...others, { date, kind: 'open', title: '수업' }] : others;
  }
  return holiday ? others : [...others, { date, kind: 'closed', title: '휴강' }];
}

export const rowKey = (date: string, classId: string | null, startTime: string, logId: string | null = null) =>
  classId ? `${date}|${classId}|${startTime}` : `log|${logId}`;

const activeIds = (ids: string[], students: Student[]) => {
  const active = new Set(students.filter(student => student.status === 'active').map(student => student.id));
  return ids.filter(id => active.has(id));
};

export function buildMonthRows(input: {
  month: string;
  classes: Class[];
  students: Student[];
  logs: LessonLog[];
  holidaySettings: HolidaySettings;
}): { rows: LessonRow[]; closedDays: ClosedDay[] } {
  const { month, classes, students, logs, holidaySettings } = input;
  const saved = new Map(logs.filter(log => log.classId).map(log => [rowKey(log.date, log.classId, log.startTime), log]));
  const used = new Set<string>();
  const rows: LessonRow[] = [];
  const closedDays: ClosedDay[] = [];

  for (const date of monthDates(month)) {
    const day = weekdayOf(date);
    const scheduled = classes.flatMap(cls => getClassSchedules(cls)
      .filter(schedule => schedule.day === day)
      .map(schedule => ({ cls, schedule })));
    const closed = closedTitle(date, holidaySettings);
    if (closed !== null) {
      if (scheduled.length > 0) closedDays.push({ date, title: closed });
      continue;
    }
    for (const { cls, schedule } of scheduled) {
      const key = rowKey(date, cls.id, schedule.startTime);
      const log = saved.get(key);
      if (log) used.add(log.id);
      rows.push({
        key,
        date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        classId: cls.id,
        className: cls.name,
        studentIds: log && log.studentIds.length > 0 ? log.studentIds : activeIds(schedule.studentIds ?? cls.studentIds, students),
        content: log?.content ?? '',
        logId: log?.id ?? null,
        hidden: log?.hidden ?? false,
        fromSchedule: true,
      });
    }
  }

  // 시간표에 없는 저장 줄(직접 추가, 휴강일 보강, 시간표가 바뀐 예전 줄)
  for (const log of logs) {
    if (used.has(log.id) || !log.date.startsWith(month)) continue;
    const cls = classes.find(item => item.id === log.classId);
    rows.push({
      key: rowKey(log.date, log.classId, log.startTime, log.id),
      date: log.date,
      startTime: log.startTime,
      endTime: log.endTime,
      classId: log.classId,
      className: cls?.name ?? log.className,
      studentIds: log.studentIds,
      content: log.content,
      logId: log.id,
      hidden: log.hidden,
      fromSchedule: false,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className, 'ko'));
  return { rows, closedDays };
}

export const isAbsent = (attendance: Attendance[], studentId: string, classId: string | null, date: string) =>
  Boolean(classId) && attendance.some(item => item.studentId === studentId && item.classId === classId && item.date === date && item.status === 'absent');

// 수업 내용 자동완성: 적은 글자가 들어간 지난 기록을 같은 반 → 최근 순으로.
export function suggestContents(history: ContentHistoryItem[], query: string, classId: string | null, limit = 8): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const best = new Map<string, { sameClass: boolean; date: string }>();
  for (const item of history) {
    const text = item.content.trim();
    if (!text || text.toLowerCase() === needle || !text.toLowerCase().includes(needle)) continue;
    const sameClass = Boolean(classId) && item.classId === classId;
    const prev = best.get(text);
    best.set(text, {
      sameClass: sameClass || Boolean(prev?.sameClass),
      date: prev && prev.date > item.date ? prev.date : item.date,
    });
  }
  return [...best.entries()]
    .sort((a, b) => Number(b[1].sameClass) - Number(a[1].sameClass)
      || Number(b[0].toLowerCase().startsWith(needle)) - Number(a[0].toLowerCase().startsWith(needle))
      || b[1].date.localeCompare(a[1].date))
    .slice(0, limit)
    .map(([text]) => text);
}

export const formatRowDate = (date: string) => `${date}(${weekdayOf(date)})`;
export const formatDayTitle = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${weekdayOf(date)})`;
export const formatRowTime = (row: { startTime: string; endTime: string }) =>
  row.startTime && row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime || row.endTime;

export function exportMonthToExcel(month: string, rows: LessonRow[], students: Student[], attendance: Attendance[]) {
  const nameOf = (id: string) => students.find(student => student.id === id)?.name ?? '(삭제된 학생)';
  const sheetRows = [
    ['날짜(요일)', '시간대', '클래스명', '학생 이름', '결석', '수업내용'],
    ...rows.filter(row => !row.hidden).map(row => [
      formatRowDate(row.date),
      formatRowTime(row),
      row.className,
      row.studentIds.map(nameOf).join(' '),
      row.studentIds.filter(id => isAbsent(attendance, id, row.classId, row.date)).map(nameOf).join(' '),
      row.content,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 40 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, `${month} 수업일지`);
  XLSX.writeFile(book, `수업일지_${month}.xlsx`);
}

// ---- Supabase ----

type Row = Record<string, unknown>;

const toLog = (r: Row): LessonLog => ({
  id: String(r.id),
  date: String(r.date ?? ''),
  startTime: String(r.start_time ?? ''),
  endTime: String(r.end_time ?? ''),
  classId: r.class_id ? String(r.class_id) : null,
  className: String(r.class_name ?? ''),
  studentIds: Array.isArray(r.student_ids) ? r.student_ids.map(String) : [],
  content: String(r.content ?? ''),
  hidden: Boolean(r.hidden),
});

export const lessonLogsApi = {
  async listMonth(month: string): Promise<LessonLog[]> {
    const dates = monthDates(month);
    const { data, error } = await supabase
      .from('growing_lesson_logs')
      .select('*')
      .gte('date', dates[0])
      .lte('date', dates[dates.length - 1]);
    if (error) throw error;
    return (data ?? []).map(toLog);
  },

  async listHistory(): Promise<ContentHistoryItem[]> {
    const { data, error } = await supabase
      .from('growing_lesson_logs')
      .select('content, class_id, date')
      .neq('content', '')
      .order('date', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []).map(r => ({ content: String(r.content ?? ''), classId: r.class_id ? String(r.class_id) : null, date: String(r.date ?? '') }));
  },

  // 줄 저장: 저장된 적 있으면 고치고, 시간표 줄을 처음 저장하면 새로 만든다.
  async save(row: Omit<LessonRow, 'key' | 'fromSchedule'>): Promise<LessonLog> {
    const values = {
      date: row.date,
      start_time: row.startTime,
      end_time: row.endTime,
      class_id: row.classId,
      class_name: row.className,
      student_ids: row.studentIds,
      content: row.content,
      hidden: row.hidden,
      updated_at: new Date().toISOString(),
    };
    const query = row.logId
      ? supabase.from('growing_lesson_logs').update(values).eq('id', row.logId)
      : supabase.from('growing_lesson_logs').insert(values);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return toLog(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('growing_lesson_logs').delete().eq('id', id);
    if (error) throw error;
  },
};
