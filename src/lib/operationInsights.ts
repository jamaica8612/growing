import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getClassSchedules } from './classSchedules';
import { getStudentTags } from './studentTags';

const dayNames = ['일', '월', '화', '수', '목', '금', '토'] as const;
const MS_PER_DAY = 86_400_000;

const toDate = (value: string) => new Date(`${value}T00:00:00`);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

export interface MakeupRecommendation {
  id: string;
  date: string;
  classId: string;
  className: string;
  time: string;
  reason: string;
}

export function getMakeupRecommendations(
  student: Student,
  absentRecord: Attendance,
  classes: Class[],
  attendance: Attendance[],
  fromDate = todayKey(),
): MakeupRecommendation[] {
  const candidateClasses = classes.filter(
    cls => cls.id === absentRecord.classId || cls.studentIds.includes(student.id)
  );
  const existingMakeupDates = new Set(
    attendance
      .filter(record => record.studentId === student.id && record.status === 'makeup')
      .map(record => `${record.date}|${record.classId}`)
  );
  const start = toDate(fromDate);
  const results: MakeupRecommendation[] = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(start.getTime() + offset * MS_PER_DAY);
    const dateKey = date.toISOString().slice(0, 10);
    const day = dayNames[date.getDay()];
    for (const cls of candidateClasses) {
      for (const schedule of getClassSchedules(cls)) {
        if (schedule.day !== day) continue;
        if (existingMakeupDates.has(`${dateKey}|${cls.id}`)) continue;
        results.push({
          id: `${dateKey}-${cls.id}-${schedule.startTime}`,
          date: dateKey,
          classId: cls.id,
          className: cls.name,
          time: `${schedule.startTime}~${schedule.endTime}`,
          reason: cls.id === absentRecord.classId ? '원래 결석한 반과 같은 시간표' : '학생이 배정된 반 시간표',
        });
      }
    }
  }

  return results.slice(0, 3);
}

export interface CounselBriefing {
  headline: string;
  stats: {
    attendanceRate: number;
    absentCount: number;
    homeworkIssueCount: number;
    unpaidAmount: number;
  };
  recentLogs: CounselLog[];
  focus: string[];
  questions: string[];
}

export function getCounselBriefing(
  student: Student,
  classes: Class[],
  attendance: Attendance[],
  payments: Payment[],
  counselLogs: CounselLog[],
  today = new Date(),
): CounselBriefing {
  const cutoff = new Date(today.getTime() - 30 * MS_PER_DAY).toISOString().slice(0, 10);
  const recentAttendance = attendance.filter(record => record.studentId === student.id && record.date >= cutoff);
  const presentCount = recentAttendance.filter(record => record.status === 'present' || record.status === 'makeup').length;
  const absentCount = recentAttendance.filter(record => record.status === 'absent').length;
  const attendanceRate = recentAttendance.length > 0 ? Math.round((presentCount / recentAttendance.length) * 100) : 0;
  const homeworkIssueCount = recentAttendance.filter(
    record => record.homeworkStatus === 'incomplete' || record.homeworkStatus === 'undone'
  ).length;
  const currentMonth = monthKey(today);
  const unpaidAmount = payments
    .filter(payment => payment.studentId === student.id && payment.billingMonth === currentMonth && payment.status === 'unpaid')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const recentLogs = counselLogs
    .filter(log => log.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const tags = getStudentTags({ student, classes, attendance, payments, counselLogs, today });

  const focus = [
    attendanceRate > 0 && attendanceRate < 80 ? `최근 30일 출석률이 ${attendanceRate}%입니다.` : '',
    absentCount >= 2 ? `최근 30일 결석이 ${absentCount}회 있습니다.` : '',
    homeworkIssueCount >= 2 ? `숙제 미흡/미제출이 ${homeworkIssueCount}회 있습니다.` : '',
    unpaidAmount > 0 ? `${currentMonth} 미납 ${unpaidAmount.toLocaleString()}원이 있습니다.` : '',
    ...tags.filter(tag => tag.key === 'needs-counsel' || tag.key === 'report-missing').map(tag => tag.reason),
  ].filter(Boolean);

  const questions = [
    homeworkIssueCount >= 2 ? '가정에서 숙제하는 고정 시간이 있는지 확인하기' : '',
    absentCount >= 2 ? '최근 결석 사유와 보강 가능 요일 확인하기' : '',
    attendanceRate > 0 && attendanceRate < 80 ? '수업 리듬을 회복하기 위한 등원 루틴 확인하기' : '',
    recentLogs[0]?.type === 'test' ? '최근 테스트 결과를 바탕으로 어려웠던 단원 물어보기' : '',
  ].filter(Boolean);

  return {
    headline: focus[0] ?? '최근 기록은 안정적입니다. 오늘은 학습 루틴과 다음 목표를 가볍게 확인하세요.',
    stats: { attendanceRate, absentCount, homeworkIssueCount, unpaidAmount },
    recentLogs,
    focus: focus.slice(0, 4),
    questions: questions.length > 0 ? questions.slice(0, 3) : ['이번 달 학습 목표와 가정 학습 루틴 확인하기'],
  };
}
