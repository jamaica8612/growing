import type { Attendance, Class, CounselLog, Payment, Student } from '../types';

export type NoticeIncludeKey = 'attendance' | 'homework' | 'makeup';

export type NoticeIncludeState = Record<NoticeIncludeKey, boolean>;

export interface NoticeDraftInput {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
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

export const getNoticeDraftMeta = (input: Omit<NoticeDraftInput, 'include'>): NoticeDraftMeta => {
  const todayRows = input.attendance.filter(row => row.studentId === input.student.id && row.date === input.today);
  const todayStatuses = todayRows.map(row => attendanceStatusLabel(row.status)).join(', ');
  const todayHomework = todayRows.map(row => homeworkLabel(row.homeworkStatus)).filter(label => label !== '기록 없음').join(', ');
  const makeupSummary = todayRows.map(buildMakeupLine).filter(Boolean).join(', ');

  return {
    attendance: todayStatuses || '해당일 출결 기록 없음',
    homework: todayHomework || '해당일 과제 기록 없음',
    makeup: makeupSummary || '선택일 보강/보충 기록 없음',
  };
};

export const buildParentNoticeDraft = (input: NoticeDraftInput): string => {
  const { student, attendance, today, include } = input;
  const todayRows = attendance.filter(row => row.studentId === student.id && row.date === today);
  const lines: string[] = [
    '안녕하세요, 그로잉영어입니다.',
    '',
    `${student.name} 학생의 ${formatDate(today)} 일일 종합알림장입니다.`,
    '',
  ];

  if (include.attendance) {
    const todayStatuses = todayRows.map(row => attendanceStatusLabel(row.status)).join(', ') || '해당일 출결 기록 없음';
    const checkIn = todayRows.map(row => row.checkInTime).filter(Boolean).join(', ') || '-';
    const checkOut = todayRows.map(row => row.checkOutTime).filter(Boolean).join(', ') || '-';
    lines.push('[출결]');
    lines.push(`- ${formatDate(today)} 출결: ${todayStatuses}`);
    lines.push(`- 등원/하원: ${checkIn} / ${checkOut}`);
    lines.push('');
  }

  if (include.homework) {
    const todayHomework = todayRows.map(row => homeworkLabel(row.homeworkStatus)).filter(label => label !== '기록 없음').join(', ') || '해당일 과제 기록 없음';
    lines.push('[과제]');
    lines.push(`- ${formatDate(today)} 과제: ${todayHomework}`);
    lines.push('');
  }

  if (include.makeup) {
    const makeupSummary = todayRows.map(buildMakeupLine).filter(Boolean).join(', ');
    lines.push('[보강/보충]');
    lines.push(`- ${formatDate(today)} 기록: ${makeupSummary || '선택한 날짜에 보강/보충 기록 없음'}`);
    lines.push('');
  }

  lines.push('가정에서도 확인 부탁드립니다. 감사합니다.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};
