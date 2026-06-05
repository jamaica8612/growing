import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { normalizeAttendanceStatus } from './attendanceStatus';
import { getStudentTags, type StudentTag } from './studentTags';

export interface StudentReportSummary {
  month: string;
  attendance: {
    total: number;
    present: number;
    absent: number;
    makeup: number;
    supplement: number;
    rate: number;
    supplementRate: number;
    peerSupplementRate: number;
    supplementRateDelta: number;
  };
  homework: {
    done: number;
    incomplete: number;
    undone: number;
  };
  logs: CounselLog[];
  payment?: Payment;
  tags: StudentTag[];
  classNames: string;
  draft: string;
}

export interface StudentReportInput {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  month: string;
}

const summarizeHomework = (attendance: Attendance[]) => ({
  done: attendance.filter(record => record.homeworkStatus === 'done').length,
  incomplete: attendance.filter(record => record.homeworkStatus === 'incomplete').length,
  undone: attendance.filter(record => record.homeworkStatus === 'undone').length,
});

const buildDraft = (
  student: Student,
  attendance: StudentReportSummary['attendance'],
  homework: StudentReportSummary['homework'],
  logs: CounselLog[],
  tags: StudentTag[]
) => {
  const lines: string[] = [];
  const supplementComparison =
    attendance.supplementRateDelta > 0
      ? `${Math.abs(attendance.supplementRateDelta)}%p 높습니다`
      : attendance.supplementRateDelta < 0
        ? `${Math.abs(attendance.supplementRateDelta)}%p 낮습니다`
        : '같습니다';
  lines.push(`${student.name} 학생은 이번 달 출석률 ${attendance.rate}%로 학습 흐름을 이어가고 있습니다.`);
  if (attendance.absent > 0) lines.push(`결석 ${attendance.absent}회가 있어 보강 일정과 학습 공백을 함께 확인하면 좋겠습니다.`);
  lines.push(`보충률은 ${attendance.supplementRate}%로 다른 학생 평균 ${attendance.peerSupplementRate}%보다 ${supplementComparison}.`);
  if (homework.undone + homework.incomplete > 0) {
    lines.push(`숙제 미완료/미흡 기록이 ${homework.undone + homework.incomplete}회 있어 가정에서 과제 루틴을 한 번 더 잡아주세요.`);
  } else if (homework.done > 0) {
    lines.push('숙제 수행은 안정적으로 이어지고 있습니다.');
  }
  const progressLogs = logs.filter(log => log.type === 'progress' || log.type === 'test').slice(0, 2);
  if (progressLogs.length > 0) {
    lines.push(`이번 달 주요 학습 기록은 ${progressLogs.map(log => log.title).join(', ')}입니다.`);
  }
  const importantTags = tags.filter(tag => tag.severity !== 'info').slice(0, 2);
  if (importantTags.length > 0) {
    lines.push(`운영상 확인할 부분은 ${importantTags.map(tag => tag.label).join(', ')}입니다.`);
  }
  lines.push('다음 달에는 수업 참여도와 과제 습관을 함께 점검하며 안정적인 성장을 돕겠습니다.');
  return lines.join('\n');
};

export const getStudentReportSummary = ({
  student,
  classes,
  attendance,
  payments,
  counselLogs,
  month,
}: StudentReportInput): StudentReportSummary => {
  const monthAttendance = attendance.filter(record => record.studentId === student.id && record.date.startsWith(month));
  const normalized = monthAttendance.map(record => normalizeAttendanceStatus(record.status));
  const present = normalized.filter(status => status === 'present').length;
  const absent = normalized.filter(status => status === 'absent').length;
  const makeup = normalized.filter(status => status === 'makeup').length;
  const supplement = normalized.filter(status => status === 'supplement').length;
  const total = monthAttendance.length;
  const rate = total > 0 ? Math.round(((present + makeup + supplement) / total) * 100) : 100;
  const supplementRate = total > 0 ? Math.round((supplement / total) * 100) : 0;
  const peerAttendanceByStudent = new Map<string, Attendance[]>();
  attendance
    .filter(record => record.studentId !== student.id && record.date.startsWith(month))
    .forEach(record => {
      const rows = peerAttendanceByStudent.get(record.studentId) ?? [];
      rows.push(record);
      peerAttendanceByStudent.set(record.studentId, rows);
    });
  const peerSupplementRates = Array.from(peerAttendanceByStudent.values())
    .filter(rows => rows.length > 0)
    .map(rows => {
      const peerSupplement = rows.filter(record => normalizeAttendanceStatus(record.status) === 'supplement').length;
      return Math.round((peerSupplement / rows.length) * 100);
    });
  const peerSupplementRate = peerSupplementRates.length > 0
    ? Math.round(peerSupplementRates.reduce((sum, value) => sum + value, 0) / peerSupplementRates.length)
    : 0;
  const supplementRateDelta = supplementRate - peerSupplementRate;
  const homework = summarizeHomework(monthAttendance);
  const logs = counselLogs
    .filter(log => log.studentId === student.id && log.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const payment = payments.find(payment => payment.studentId === student.id && payment.billingMonth === month);
  const studentClasses = classes.filter(cls => cls.studentIds.includes(student.id));
  const tags = getStudentTags({ student, classes, attendance, payments, counselLogs });
  const attendanceSummary = {
    total,
    present,
    absent,
    makeup,
    supplement,
    rate,
    supplementRate,
    peerSupplementRate,
    supplementRateDelta,
  };

  return {
    month,
    attendance: attendanceSummary,
    homework,
    logs,
    payment,
    tags,
    classNames: studentClasses.map(cls => cls.name).join(', ') || '배정 반 없음',
    draft: buildDraft(student, attendanceSummary, homework, logs, tags),
  };
};
