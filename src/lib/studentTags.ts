import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentClassTuition } from './classTuition';

export type StudentTagSeverity = 'danger' | 'warning' | 'info';

export type StudentTagKey =
  | 'unpaid'
  | 'missing-parent-contact'
  | 'no-class'
  | 'frequent-absence'
  | 'homework-followup'
  | 'needs-counsel'
  | 'report-missing'
  | 'tuition-check';

export interface StudentTag {
  key: StudentTagKey;
  label: string;
  severity: StudentTagSeverity;
  reason: string;
}

export interface StudentTagInput {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  today?: Date;
}

const toDate = (value: string) => new Date(`${value}T00:00:00`);
const daysBetween = (from: string, to: Date) =>
  Math.floor((to.getTime() - toDate(from).getTime()) / 86_400_000);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const isMonthlyReportLog = (log: CounselLog, month: string) =>
  log.type === 'progress' && log.title.includes(month) && log.title.includes('월간 학습 리포트');

export const getStudentTags = ({
  student,
  classes,
  attendance,
  payments,
  counselLogs,
  today = new Date(),
}: StudentTagInput): StudentTag[] => {
  if (student.status !== 'active') return [];

  const tags: StudentTag[] = [];
  const studentClasses = classes.filter(cls => cls.studentIds.includes(student.id));
  const studentAttendance = attendance.filter(record => record.studentId === student.id);
  const studentLogs = counselLogs.filter(log => log.studentId === student.id);
  const currentMonth = monthKey(today);

  if (payments.some(payment => payment.studentId === student.id && payment.billingMonth === currentMonth && payment.status === 'unpaid')) {
    tags.push({
      key: 'unpaid',
      label: '미납',
      severity: 'danger',
      reason: `${currentMonth} 청구 중 미납 건이 있습니다.`,
    });
  }

  if (!student.parentContact.trim()) {
    tags.push({
      key: 'missing-parent-contact',
      label: '연락처 없음',
      severity: 'warning',
      reason: '학부모 연락처가 비어 있습니다.',
    });
  }

  if (studentClasses.length === 0) {
    tags.push({
      key: 'no-class',
      label: '반 미배정',
      severity: 'warning',
      reason: '현재 배정된 반이 없습니다.',
    });
  }

  const recentAbsences = studentAttendance.filter(record => record.status === 'absent' && daysBetween(record.date, today) <= 14);
  if (recentAbsences.length >= 2) {
    tags.push({
      key: 'frequent-absence',
      label: '결석 잦음',
      severity: 'danger',
      reason: `최근 14일 결석이 ${recentAbsences.length}회입니다.`,
    });
  }

  const recentHomeworkFollowups = studentAttendance.filter(
    record =>
      daysBetween(record.date, today) <= 30 &&
      (record.homeworkStatus === 'incomplete' || record.homeworkStatus === 'undone')
  );
  if (recentHomeworkFollowups.length >= 2) {
    tags.push({
      key: 'homework-followup',
      label: '숙제 미흡',
      severity: 'warning',
      reason: `최근 30일 숙제 미완료/미흡이 ${recentHomeworkFollowups.length}회입니다.`,
    });
  }

  const hasRecentCounsel = studentLogs.some(log => log.type === 'counsel' && daysBetween(log.date, today) <= 60);
  if (!hasRecentCounsel) {
    tags.push({
      key: 'needs-counsel',
      label: '상담 필요',
      severity: 'info',
      reason: '최근 60일 상담 기록이 없습니다.',
    });
  }

  if (!studentLogs.some(log => isMonthlyReportLog(log, currentMonth))) {
    tags.push({
      key: 'report-missing',
      label: '리포트 미작성',
      severity: 'info',
      reason: `${currentMonth} 월간 학습 리포트가 아직 저장되지 않았습니다.`,
    });
  }

  const hasZeroTuition = studentClasses.some(cls => getStudentClassTuition(cls, student.id) <= 0);
  if (hasZeroTuition) {
    tags.push({
      key: 'tuition-check',
      label: '수강료 확인',
      severity: 'warning',
      reason: '배정된 반 중 수강료가 0원인 항목이 있습니다.',
    });
  }

  return tags;
};

export const getStudentTagMap = (
  students: Student[],
  classes: Class[],
  attendance: Attendance[],
  payments: Payment[],
  counselLogs: CounselLog[],
  today = new Date()
) =>
  new Map(
    students.map(student => [
      student.id,
      getStudentTags({ student, classes, attendance, payments, counselLogs, today }),
    ])
  );
