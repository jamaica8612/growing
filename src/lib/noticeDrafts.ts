import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentReportSummary } from './reportSummary';

export type NoticeIncludeKey = 'attendance' | 'homework' | 'makeup' | 'supplementRate' | 'recentTest';

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
  supplementRate: string;
  recentTest: string;
}

const formatDate = (date: string) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  if (!month || !day) return date;
  return year ? `${Number(month)}월 ${Number(day)}일` : date;
};

const formatMonth = (month: string) => {
  const [year, m] = month.split('-');
  if (!year || !m) return month;
  return `${year}년 ${Number(m)}월`;
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

const getRecentTest = (studentId: string, counselLogs: CounselLog[]) => (
  counselLogs
    .filter(log => log.studentId === studentId && log.type === 'test')
    .sort((a, b) => b.date.localeCompare(a.date))[0]
);

export const getNoticeDraftMeta = (input: Omit<NoticeDraftInput, 'include'>): NoticeDraftMeta => {
  const report = getStudentReportSummary(input);
  const todayRows = input.attendance.filter(row => row.studentId === input.student.id && row.date === input.today);
  const todayStatuses = todayRows.map(row => attendanceStatusLabel(row.status)).join(', ');
  const todayHomework = todayRows.map(row => homeworkLabel(row.homeworkStatus)).filter(label => label !== '기록 없음').join(', ');
  const todayMakeup = todayRows.map(buildMakeupLine).filter(Boolean).join(', ');
  const recentTest = getRecentTest(input.student.id, input.counselLogs);

  return {
    attendance: todayStatuses || `월 출석률 ${report.attendance.rate}%`,
    homework: todayHomework || `${report.homework.done}회 완료`,
    makeup: todayMakeup || `월 ${report.attendance.makeup + report.attendance.supplement}회`,
    supplementRate: `${report.attendance.supplementRate}% / 또래 ${report.attendance.peerSupplementRate}%`,
    recentTest: recentTest ? `${formatDate(recentTest.date)} ${recentTest.title}` : '최근 평가 기록 없음',
  };
};

export const buildParentNoticeDraft = (input: NoticeDraftInput): string => {
  const { student, classes, attendance, payments, counselLogs, month, today, include } = input;
  const report = getStudentReportSummary({ student, classes, attendance, payments, counselLogs, month });
  const todayRows = attendance.filter(row => row.studentId === student.id && row.date === today);
  const recentTest = getRecentTest(student.id, counselLogs);
  const lines: string[] = [
    '안녕하세요, 그로잉영어입니다.',
    '',
    `${student.name} 학생의 ${formatMonth(month)} 종합알림장입니다.`,
    '',
  ];

  if (include.attendance) {
    const todayStatuses = todayRows.map(row => attendanceStatusLabel(row.status)).join(', ') || '오늘 출결 기록 없음';
    const checkIn = todayRows.map(row => row.checkInTime).filter(Boolean).join(', ') || '-';
    const checkOut = todayRows.map(row => row.checkOutTime).filter(Boolean).join(', ') || '-';
    lines.push('[출결 요약]');
    lines.push(`- 월 출석률: ${report.attendance.rate}% (${report.attendance.present + report.attendance.makeup + report.attendance.supplement}/${report.attendance.total || 0}회)`);
    lines.push(`- 오늘 출결: ${todayStatuses}`);
    lines.push(`- 등원/하원: ${checkIn} / ${checkOut}`);
    lines.push('');
  }

  if (include.homework) {
    const todayHomework = todayRows.map(row => homeworkLabel(row.homeworkStatus)).filter(label => label !== '기록 없음').join(', ') || '오늘 과제 기록 없음';
    lines.push('[과제 수행]');
    lines.push(`- 이번 달 완료 ${report.homework.done}회, 부분 완료 ${report.homework.incomplete}회, 미제출 ${report.homework.undone}회`);
    lines.push(`- 오늘 과제: ${todayHomework}`);
    lines.push('');
  }

  if (include.makeup) {
    const todayMakeup = todayRows.map(buildMakeupLine).filter(Boolean).join(', ');
    lines.push('[보강/보충 현황]');
    lines.push(`- 이번 달 보강 ${report.attendance.makeup}회, 보충 ${report.attendance.supplement}회`);
    lines.push(`- 오늘 기록: ${todayMakeup || '보강/보충 기록 없음'}`);
    lines.push('');
  }

  if (include.supplementRate) {
    const diff = report.attendance.supplementRateDelta;
    const comparison = diff > 0
      ? `또래 평균보다 ${diff}%p 높습니다.`
      : diff < 0
        ? `또래 평균보다 ${Math.abs(diff)}%p 낮습니다.`
        : '또래 평균과 같습니다.';
    lines.push('[또래 대비 보충률]');
    lines.push(`- ${formatMonth(month)} 보충률: ${report.attendance.supplementRate}%`);
    lines.push(`- 또래 평균: ${report.attendance.peerSupplementRate}%`);
    lines.push(`- 비교: ${comparison}`);
    lines.push('');
  }

  if (include.recentTest) {
    lines.push('[최근 평가 결과]');
    if (recentTest) {
      const score = recentTest.score ? ` (${recentTest.score})` : '';
      lines.push(`- ${formatDate(recentTest.date)} ${recentTest.title}${score}`);
      if (recentTest.content) lines.push(`- ${recentTest.content}`);
    } else {
      lines.push('- 최근 평가 기록 없음');
    }
    lines.push('');
  }

  lines.push('가정에서도 확인 부탁드립니다. 감사합니다.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};
