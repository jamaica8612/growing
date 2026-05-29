export type StudentStatus = 'active' | 'inactive';

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
  tuitionFee: number;
  studentIds: string[]; // List of Student IDs in this class
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'makeup';

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  memo: string;
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
