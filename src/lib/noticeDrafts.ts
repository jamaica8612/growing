import type { Attendance, Class, CounselLog, MakeupReservation, Payment, Student } from '../types';

export type NoticeIncludeKey = 'attendance' | 'homework' | 'makeup';

export type NoticeIncludeState = Record<NoticeIncludeKey, boolean>;

export interface NoticeDraftInput {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  makeupReservations: MakeupReservation[];
  payments: Payment[];
  counselLogs: CounselLog[];
  month: string;
  today: string;
  include: NoticeIncludeState;
}

export interface NoticeDraftMeta {
  attendance: string;
  homework: string;
  makeup: string;
}

const formatDate = (date: string) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  if (!month || !day) return date;
  return year ? `${Number(month)}월 ${Number(day)}일` : date;
};

const attendanceStatusLabel = (status?: Attendance['status']) => {
  if (status === 'present') return '출석';
  if (status === 'absent') return '결석';
  if (status === 'makeup') return '보강';
  if (status === 'supplement') return '보충';
  if (status === 'late') return '지각';
  return '기록 없음';
};

const homeworkLabel = (status?: Attendance['homeworkStatus']) => {
  if (status === 'done') return '완료';
  if (status === 'incomplete') return '부분 완료';
  if (status === 'undone') return '미제출';
  return '기록 없음';
};

const buildMakeupLine = (record: Attendance) => {
  if (record.status === 'makeup') {
    return record.makeupForDate ? `보강 (${formatDate(record.makeupForDate)} 결석분)` : '보강';
  }
  if (record.status === 'supplement') {
    return `보충${record.supplementMinutes ? ` ${record.supplementMinutes}분` : ''}`;
  }
  return record.supplementMinutes ? `보충 ${record.supplementMinutes}분` : '';
};

const buildReservationLine = (reservation: MakeupReservation) => {
  const prefix = reservation.sourceAbsenceDate
    ? `${formatDate(reservation.sourceAbsenceDate)} 결석분 `
    : reservation.reason === 'supplement'
      ? '추가 보충 '
      : '';
  return `${prefix}${formatDate(reservation.scheduledDate)} ${reservation.scheduledTime} 보강 예약`;
};

// 알림장에는 진행 전(scheduled) 예약만 안내한다. 완료된 보강은 보강 당일의
// 출결(makeup) 기록으로 표시되므로, 여기 포함하면 이후 매일 중복 안내된다.
const upcomingReservations = (reservations: MakeupReservation[] | undefined, studentId: string, today: string) =>
  (reservations ?? []).filter(row =>
    row.studentId === studentId &&
    row.status === 'scheduled' &&
    row.scheduledDate >= today
  );

const buildLegacyScheduledMakeupLine = (record: Attendance) =>
  `보강 예약: ${formatDate(record.date)}`;

const summarizeDailyNoticeFields = (
  rows: Attendance[],
  reservations: MakeupReservation[],
  legacyScheduledMakeups: Attendance[],
  includeMakeup: boolean,
) => {
  const attendance = rows.map(row => {
    if (row.status === 'supplement') {
      return '출석';
    }
    if (row.status === 'makeup') {
      return row.makeupForDate ? `보강 (${formatDate(row.makeupForDate)} 결석분)` : '보강';
    }
    return attendanceStatusLabel(row.status);
  }).join(', ') || '기록 없음';
  const checkIn = [...new Set(rows.map(row => row.checkInTime).filter(Boolean))].join(', ') || '-';
  const checkOut = [...new Set(rows.map(row => row.checkOutTime).filter(Boolean))].join(', ') || '-';
  const homework = rows.map(row => homeworkLabel(row.homeworkStatus)).filter(label => label !== '기록 없음').join(', ') || '기록 없음';

  let makeup = '해당 없음';
  if (includeMakeup) {
    const parts: string[] = rows.map(buildMakeupLine).filter(Boolean);
    if (reservations.length > 0) {
      parts.push(...reservations.map(buildReservationLine));
    }
    if (legacyScheduledMakeups.length > 0) {
      parts.push(...legacyScheduledMakeups.map(buildLegacyScheduledMakeupLine));
    }
    makeup = parts.length > 0 ? parts.join(', ') : '해당 없음';
  }

  return { attendance, checkIn, checkOut, homework, makeup };
};

export const getNoticeDraftMeta = (input: Omit<NoticeDraftInput, 'include'>): NoticeDraftMeta => {
  const todayRows = input.attendance.filter(row => row.studentId === input.student.id && row.date === input.today);
  const noticeReservations = upcomingReservations(input.makeupReservations, input.student.id, input.today);
  const legacyScheduledMakeups = input.attendance.filter(row =>
    row.studentId === input.student.id &&
    row.status === 'makeup' &&
    row.date > input.today
  );
  const fields = summarizeDailyNoticeFields(todayRows, noticeReservations, legacyScheduledMakeups, true);

  return {
    attendance: fields.attendance,
    homework: fields.homework,
    makeup: fields.makeup,
  };
};

export const buildParentNoticeDraft = (input: NoticeDraftInput): string => {
  const { student, attendance, today, include } = input;
  const todayRows = attendance.filter(row => row.studentId === student.id && row.date === today);
  const noticeReservations = upcomingReservations(input.makeupReservations, student.id, today);
  const legacyScheduledMakeups = attendance.filter(row =>
    row.studentId === student.id &&
    row.status === 'makeup' &&
    row.date > today
  );
  const fields = summarizeDailyNoticeFields(todayRows, noticeReservations, legacyScheduledMakeups, include.makeup);
  const lines = [
    '[그로잉영어]',
    `${student.name} 학생의 ${formatDate(today)} 일일 종합알림장입니다.`,
    '',
    `출결: ${fields.attendance}`,
    `등원/하원: ${fields.checkIn} / ${fields.checkOut}`,
    `과제: ${fields.homework}`,
    `보강/보충: ${fields.makeup}`,
    '',
    '확인 부탁드립니다.',
    '감사합니다.',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};
