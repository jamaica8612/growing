import type { AttendanceStatus, EditableAttendanceStatus } from '../types';

export const VISIBLE_ATTENDANCE_STATUSES: EditableAttendanceStatus[] = ['present', 'absent', 'makeup', 'supplement'];

export const normalizeAttendanceStatus = (status: AttendanceStatus): EditableAttendanceStatus =>
  status === 'late' ? 'present' : status;

export const isAttendedStatus = (status: AttendanceStatus): boolean =>
  normalizeAttendanceStatus(status) !== 'absent';
