import type { Attendance, Class, Student } from '../types';
import { localToday } from './dateUtils';

export interface MakeupNeededItem {
  id: string;
  student: Student;
  class?: Class;
  absentRecord: Attendance;
  completedRecord?: Attendance;
}

export interface MakeupScheduledItem {
  id: string;
  student?: Student;
  class?: Class;
  makeupRecord: Attendance;
  absentRecord?: Attendance;
}

export interface MakeupCompletedItem {
  id: string;
  student?: Student;
  class?: Class;
  makeupRecord: Attendance;
  absentRecord?: Attendance;
}

export interface MakeupSummary {
  needed: MakeupNeededItem[];
  scheduled: MakeupScheduledItem[];
  completed: MakeupCompletedItem[];
}

export const hasMakeupForAbsence = (attendance: Attendance[], studentId: string, classId: string, absentDate: string) =>
  attendance.some(record => record.studentId === studentId && record.classId === classId && record.status === 'makeup' && record.makeupForDate === absentDate);

export const getMakeupSummary = (students: Student[], classes: Class[], attendance: Attendance[]): MakeupSummary => {
  const today = localToday();
  const studentsById = new Map(students.map(student => [student.id, student]));
  const classesById = new Map(classes.map(cls => [cls.id, cls]));
  const makeupByStudentAndDate = new Map<string, Attendance>();

  attendance
    .filter(record => record.status === 'makeup' && record.makeupForDate)
    .forEach(record => {
      makeupByStudentAndDate.set(`${record.studentId}|${record.makeupForDate}`, record);
    });

  const needed: MakeupNeededItem[] = attendance
    .filter(record => record.status === 'absent')
    .flatMap(record => {
      const student = studentsById.get(record.studentId);
      if (!student) return [];
      const completedRecord = makeupByStudentAndDate.get(`${record.studentId}|${record.date}`);
      return [{
        id: record.id,
        student,
        class: classesById.get(record.classId),
        absentRecord: record,
        completedRecord,
      }];
    })
    .filter(item => !item.completedRecord)
    .sort((a, b) => b.absentRecord.date.localeCompare(a.absentRecord.date));

  const makeupRecords = attendance.filter(record => record.status === 'makeup' && record.makeupForDate);

  const toItem = (record: Attendance) => ({
    id: record.id,
    student: studentsById.get(record.studentId),
    class: classesById.get(record.classId),
    makeupRecord: record,
    absentRecord: attendance.find(
      absent => absent.studentId === record.studentId && absent.date === record.makeupForDate && absent.status === 'absent'
    ),
  });

  const scheduled: MakeupScheduledItem[] = makeupRecords
    .filter(record => record.date > today)
    .map(toItem)
    .sort((a, b) => a.makeupRecord.date.localeCompare(b.makeupRecord.date));

  const completed: MakeupCompletedItem[] = makeupRecords
    .filter(record => record.date <= today)
    .map(toItem)
    .sort((a, b) => b.makeupRecord.date.localeCompare(a.makeupRecord.date));

  return { needed, scheduled, completed };
};
