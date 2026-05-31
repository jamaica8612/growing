import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { getStudentClassTuition } from './classTuition';

export type DataQualitySeverity = 'danger' | 'warning' | 'info';
export type DataQualityTarget = 'students' | 'classes' | 'attendance' | 'payments';

export interface DataQualityIssue {
  id: string;
  title: string;
  description: string;
  target: DataQualityTarget;
  studentId?: string;
  classId?: string;
  paymentId?: string;
  attendanceId?: string;
}

export interface DataQualitySection {
  key: string;
  title: string;
  severity: DataQualitySeverity;
  actionLabel: string;
  target: DataQualityTarget;
  issues: DataQualityIssue[];
}

export interface DataQualityInput {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  month?: string;
  today?: Date;
}

const currentMonth = (today: Date) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const normalizePhone = (value: string) => value.replace(/[^0-9]/g, '');
const daysBetween = (date: string, today: Date) =>
  Math.floor((today.getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000);
const reportTitleIncludes = (log: CounselLog, month: string) =>
  log.type === 'progress' && log.title.includes(month) && log.title.includes('월간 학습 리포트');

const section = (
  key: string,
  title: string,
  severity: DataQualitySeverity,
  target: DataQualityTarget,
  actionLabel: string,
  issues: DataQualityIssue[]
): DataQualitySection => ({ key, title, severity, target, actionLabel, issues });

export const getDataQualitySections = ({
  students,
  classes,
  attendance,
  payments,
  counselLogs,
  month = currentMonth(new Date()),
  today = new Date(),
}: DataQualityInput): DataQualitySection[] => {
  const activeStudents = students.filter(student => student.status === 'active');
  const studentIds = new Set(students.map(student => student.id));
  const activeStudentIds = new Set(activeStudents.map(student => student.id));
  const classIds = new Set(classes.map(cls => cls.id));
  const assignedStudentIds = new Set(classes.flatMap(cls => cls.studentIds));
  const paymentsByStudentMonth = new Map<string, Payment[]>();

  payments.forEach(payment => {
    const key = `${payment.studentId}|${payment.billingMonth}`;
    paymentsByStudentMonth.set(key, [...(paymentsByStudentMonth.get(key) ?? []), payment]);
  });

  const duplicateBills = Array.from(paymentsByStudentMonth.entries()).flatMap(([key, rows]) => {
    if (rows.length < 2) return [];
    const [studentId, billingMonth] = key.split('|');
    const student = students.find(item => item.id === studentId);
    return rows.map(payment => ({
      id: `duplicate-bill-${payment.id}`,
      title: student?.name ?? '알 수 없는 학생',
      description: `${billingMonth} 청구가 ${rows.length}건 있습니다.`,
      target: 'payments' as const,
      studentId,
      paymentId: payment.id,
    }));
  });

  const sameNameGroups = new Map<string, Student[]>();
  students.forEach(student => {
    const name = student.name.trim();
    if (!name) return;
    sameNameGroups.set(name, [...(sameNameGroups.get(name) ?? []), student]);
  });

  return [
    section(
      'missing-parent-contact',
      '학부모 연락처 없음',
      'warning',
      'students',
      '학생 관리로 이동',
      activeStudents
        .filter(student => !student.parentContact.trim())
        .map(student => ({
          id: `missing-parent-contact-${student.id}`,
          title: student.name,
          description: '학부모 연락처가 비어 있습니다.',
          target: 'students',
          studentId: student.id,
        }))
    ),
    section(
      'no-class',
      '반 배정 없음',
      'warning',
      'students',
      '학생 관리로 이동',
      activeStudents
        .filter(student => !assignedStudentIds.has(student.id))
        .map(student => ({
          id: `no-class-${student.id}`,
          title: student.name,
          description: '현재 포함된 반이 없습니다.',
          target: 'students',
          studentId: student.id,
        }))
    ),
    section(
      'zero-tuition',
      '수강료 0원 반',
      'warning',
      'classes',
      '반 관리로 이동',
      classes
        .filter(cls => cls.tuitionFee <= 0 || cls.studentIds.some(studentId => getStudentClassTuition(cls, studentId) <= 0))
        .map(cls => ({
          id: `zero-tuition-${cls.id}`,
          title: cls.name,
          description: '기본 수강료 또는 학생별 수강료가 0원입니다.',
          target: 'classes',
          classId: cls.id,
        }))
    ),
    section(
      'missing-current-bill',
      '이번 달 청구 없음',
      'info',
      'payments',
      '수납 관리로 이동',
      activeStudents
        .filter(student => classes.some(cls => cls.studentIds.includes(student.id)))
        .filter(student => !payments.some(payment => payment.studentId === student.id && payment.billingMonth === month))
        .map(student => ({
          id: `missing-current-bill-${student.id}`,
          title: student.name,
          description: `${month} 청구서가 없습니다.`,
          target: 'payments',
          studentId: student.id,
        }))
    ),
    section('duplicate-bill', '중복 청구', 'danger', 'payments', '수납 관리로 이동', duplicateBills),
    section(
      'orphan-attendance-student',
      '학생이 없는 출결 기록',
      'danger',
      'attendance',
      '출결 관리로 이동',
      attendance
        .filter(record => !studentIds.has(record.studentId))
        .map(record => ({
          id: `orphan-attendance-student-${record.id}`,
          title: record.date,
          description: `학생 ID ${record.studentId}를 찾을 수 없습니다.`,
          target: 'attendance',
          attendanceId: record.id,
        }))
    ),
    section(
      'orphan-attendance-class',
      '반이 없는 출결 기록',
      'danger',
      'attendance',
      '출결 관리로 이동',
      attendance
        .filter(record => record.classId && !classIds.has(record.classId))
        .map(record => ({
          id: `orphan-attendance-class-${record.id}`,
          title: record.date,
          description: `반 ID ${record.classId}를 찾을 수 없습니다.`,
          target: 'attendance',
          attendanceId: record.id,
        }))
    ),
    section(
      'inactive-assigned',
      '퇴원생 반 배정',
      'warning',
      'classes',
      '반 관리로 이동',
      classes.flatMap(cls =>
        cls.studentIds
          .filter(studentId => !activeStudentIds.has(studentId))
          .map(studentId => ({
            id: `inactive-assigned-${cls.id}-${studentId}`,
            title: cls.name,
            description: `${students.find(student => student.id === studentId)?.name ?? studentId} 학생이 퇴원 상태입니다.`,
            target: 'classes' as const,
            classId: cls.id,
            studentId,
          }))
      )
    ),
    section(
      'duplicate-name',
      '같은 이름 학생',
      'info',
      'students',
      '학생 관리로 이동',
      Array.from(sameNameGroups.entries()).flatMap(([name, group]) =>
        group.length < 2
          ? []
          : group.map(student => ({
              id: `duplicate-name-${student.id}`,
              title: name,
              description: `같은 이름 학생이 ${group.length}명 있습니다.`,
              target: 'students' as const,
              studentId: student.id,
            }))
      )
    ),
    section(
      'phone-format',
      '연락처 형식 확인',
      'info',
      'students',
      '학생 관리로 이동',
      activeStudents
        .filter(student => {
          const phone = normalizePhone(student.parentContact);
          return phone.length > 0 && phone.length < 10;
        })
        .map(student => ({
          id: `phone-format-${student.id}`,
          title: student.name,
          description: `연락처 ${student.parentContact} 형식을 확인해 주세요.`,
          target: 'students',
          studentId: student.id,
        }))
    ),
    section(
      'report-missing',
      '월간 리포트 미작성',
      'info',
      'students',
      '학생 관리로 이동',
      activeStudents
        .filter(student => !counselLogs.some(log => log.studentId === student.id && reportTitleIncludes(log, month)))
        .map(student => ({
          id: `report-missing-${student.id}`,
          title: student.name,
          description: `${month} 월간 학습 리포트가 저장되지 않았습니다.`,
          target: 'students',
          studentId: student.id,
        }))
    ),
    section(
      'old-counsel',
      '최근 상담 기록 오래됨',
      'info',
      'students',
      '학생 관리로 이동',
      activeStudents
        .filter(student => {
          const latest = counselLogs
            .filter(log => log.studentId === student.id && log.type === 'counsel')
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          return !latest || daysBetween(latest.date, today) > 60;
        })
        .map(student => ({
          id: `old-counsel-${student.id}`,
          title: student.name,
          description: '최근 60일 상담 기록이 없습니다.',
          target: 'students',
          studentId: student.id,
        }))
    ),
  ];
};
