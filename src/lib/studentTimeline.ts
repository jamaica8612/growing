import type { Attendance, Class, CounselLog, Payment, Student } from '../types';
import { normalizeAttendanceStatus } from './attendanceStatus';

export type StudentTimelineType = 'attendance' | 'homework' | 'payment' | 'counsel' | 'report';
type StudentTimelineSeverity = 'danger' | 'warning' | 'info' | 'success';

export interface StudentTimelineEvent {
  id: string;
  type: StudentTimelineType;
  date: string;
  title: string;
  detail: string;
  meta?: string;
  severity?: StudentTimelineSeverity;
}

export interface StudentTimelineInput {
  student: Student;
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
}

const attendanceLabel = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
} as const;

const homeworkLabel = {
  done: '완료',
  incomplete: '미흡',
  undone: '미완료',
} as const;

const paymentStatusLabel = {
  paid: '납부 완료',
  unpaid: '미납',
} as const;

export const getStudentTimeline = ({
  student,
  classes,
  attendance,
  payments,
  counselLogs,
}: StudentTimelineInput): StudentTimelineEvent[] => {
  const classNames = new Map(classes.map(cls => [cls.id, cls.name]));

  const attendanceEvents = attendance
    .filter(record => record.studentId === student.id)
    .map(record => {
      const status = normalizeAttendanceStatus(record.status);
      const times = [record.checkInTime ? `등원 ${record.checkInTime}` : '', record.checkOutTime ? `하원 ${record.checkOutTime}` : '']
        .filter(Boolean)
        .join(' / ');
      const severity: StudentTimelineSeverity = status === 'absent' ? 'danger' : status === 'makeup' ? 'info' : 'success';
      return {
        id: `attendance-${record.id}`,
        type: 'attendance' as const,
        date: record.date,
        title: attendanceLabel[status],
        detail: [
          classNames.get(record.classId) ?? '반 정보 없음',
          record.makeupForDate ? `${record.makeupForDate} 결석분 보강` : '',
          record.memo,
        ]
          .filter(Boolean)
          .join(' · '),
        meta: times,
        severity,
      };
    });

  const homeworkEvents = attendance
    .filter(record => record.studentId === student.id && record.homeworkStatus)
    .map(record => {
      const severity: StudentTimelineSeverity = record.homeworkStatus === 'done' ? 'success' : 'warning';
      return {
        id: `homework-${record.id}`,
        type: 'homework' as const,
        date: record.date,
        title: `숙제 ${homeworkLabel[record.homeworkStatus as keyof typeof homeworkLabel]}`,
        detail: classNames.get(record.classId) ?? '반 정보 없음',
        severity,
      };
    });

  const paymentEvents = payments
    .filter(payment => payment.studentId === student.id)
    .map(payment => {
      const severity: StudentTimelineSeverity = payment.status === 'paid' ? 'success' : 'danger';
      return {
        id: `payment-${payment.id}`,
        type: 'payment' as const,
        date: payment.paymentDate ?? `${payment.billingMonth}-01`,
        title: `${payment.billingMonth} ${paymentStatusLabel[payment.status]}`,
        detail: `${payment.amount.toLocaleString()}원`,
        meta: payment.paymentMethod ? `결제수단 ${payment.paymentMethod}` : undefined,
        severity,
      };
    });

  const counselEvents = counselLogs
    .filter(log => log.studentId === student.id)
    .map(log => {
      const isReport = log.type === 'progress' && log.title.includes('월간 학습 리포트');
      const severity: StudentTimelineSeverity = log.type === 'test' ? 'info' : 'success';
      return {
        id: `log-${log.id}`,
        type: isReport ? ('report' as const) : ('counsel' as const),
        date: log.date,
        title: log.title,
        detail: log.content,
        meta: log.type === 'test' && log.score ? `점수 ${log.score}` : log.type,
        severity,
      };
    });

  return [...attendanceEvents, ...homeworkEvents, ...paymentEvents, ...counselEvents].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare || b.id.localeCompare(a.id);
  });
};
