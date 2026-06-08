export type StudentStatus = 'active' | 'inactive' | 'paused';

export interface Student {
  id: string;
  name: string;
  school: string;
  grade: string;
  contact: string;
  parentContact: string;
  registrationDate: string;
  status: StudentStatus;
  memo: string;
}

export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export interface Class {
  id: string;
  name: string;
  days: DayOfWeek[];
  startTime: string; // e.g. "14:00"
  endTime: string; // e.g. "15:30"
  schedules: ClassSchedule[];
  tuitionFee: number;
  tuitionOverrides: Record<string, number>;
  studentIds: string[]; // List of Student IDs in this class
  color?: string; // hex color e.g. "#10b981"
  capacity?: number;   // 0 = 제한 없음
  waitlist?: string[]; // Student IDs
}

export interface ClassSchedule {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'makeup' | 'supplement';
export type EditableAttendanceStatus = Exclude<AttendanceStatus, 'late'>;
export type HomeworkStatus = 'done' | 'incomplete' | 'undone' | '';

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  memo: string;
  homeworkStatus?: HomeworkStatus;
  checkInTime?: string; // 등원 시각 "HH:MM"
  checkOutTime?: string; // 하원 시각 "HH:MM"
  makeupForDate?: string; // 보강 시 원래 결석한 날짜 YYYY-MM-DD
  supplementMinutes?: number;
}

export type PaymentMethod = 'card' | 'cash' | 'transfer' | '';
export type PaymentStatus = 'paid' | 'unpaid';

export interface Payment {
  id: string;
  studentId: string;
  billingMonth: string; // YYYY-MM
  amount: number;
  paymentDate?: string; // YYYY-MM-DD
  paymentMethod?: PaymentMethod;
  status: PaymentStatus;
}

// A check-in/out event captured at the kiosk, queued for a parent notification.
export interface KioskAlert {
  id: string;
  studentId: string;
  kind: 'in' | 'out';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  createdAt: number;
}

// A homework follow-up queued for parent notification.
export interface HomeworkAlert {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  homeworkStatus: Exclude<HomeworkStatus, ''>;
  createdAt: number;
}

export type MessageLogStatus = 'queued' | 'sent' | 'failed';
export type MessageLogAlertType =
  | 'check_in' | 'check_out'
  | 'homework_done' | 'homework_incomplete' | 'homework_undone'
  | 'payment_request' | 'payment_paid' | 'exam_result' | 'custom';

export interface MessageLog {
  id: string;
  studentId: string | null;
  alertType: MessageLogAlertType;
  recipientPhone: string;
  recipientName: string | null;
  subject: string;
  message: string;
  status: MessageLogStatus;
  errorMessage: string | null;
  createdAt: string; // ISO timestamp
  sentAt: string | null;
}

export type CounselLogType = 'counsel' | 'progress' | 'test';

export interface CounselLog {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
  type: CounselLogType;
  score?: string; // For test scores, e.g. "95/100" or "A+"
}

export type KakaoParentLinkStatus = 'verified' | 'blocked';

export interface KakaoParentLink {
  id: string;
  studentId: string;
  kakaoUserKey: string;
  plusfriendUserKey: string;
  parentPhone: string;
  verifiedAt: string;
  consentAt?: string;
  blockedAt?: string;
}

export type KakaoParentRequestType = 'attendance' | 'homework' | 'counsel' | 'connect';
export type KakaoParentRequestStatus = 'pending' | 'drafted' | 'resolved' | 'dismissed';

export interface KakaoParentRequest {
  id: string;
  studentId?: string;
  kakaoUserKey: string;
  requestType: KakaoParentRequestType;
  message: string;
  status: KakaoParentRequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface KakaoEventLog {
  id: string;
  kakaoUserKey: string;
  plusfriendUserKey?: string;
  eventType: string;
  intent?: string;
  status: string;
  createdAt: string;
}

export interface KakaoChannelConfig {
  id: string;
  channelName: string;
  skillSecret: string;
  eventSecret?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
