import type { Attendance, Class, Student } from '../types';

export interface MakeupNeededItem {
  id: string;
  student: Student;
  class?: Class;
  absentRecord: Attendance;
  completedRecord?: Attendance;
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
  completed: MakeupCompletedItem[];
}

export const hasMakeupForAbsence = (attendance: Attendance[], studentId: string, absentDate: string) =>
  attendance.some(record => record.studentId === studentId && record.status === 'makeup' && record.makeupForDate === absentDate);

export const getMakeupSummary = (students: Student[], classes: Class[], attendance: Attendance[]): MakeupSummary => {
  const studentsById = new Map(students.map(student => [student.id, student]));
  const classesById = new Map(classes.map(cls => [cls.id, cls]));
  const completedByStudentAndDate = new Map<string, Attendance>();

  attendance
    .filter(record => record.status === 'makeup' && record.makeupForDate)
    .forEach(record => {
      completedByStudentAndDate.set(`${record.studentId}|${record.makeupForDate}`, record);
    });

  const needed: MakeupNeededItem[] = attendance
    .filter(record => record.status === 'absent')
    .flatMap(record => {
      const student = studentsById.get(record.studentId);
      if (!student) return [];
      const completedRecord = completedByStudentAndDate.get(`${record.studentId}|${record.date}`);
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

  const completed = attendance
    .filter(record => record.status === 'makeup' && record.makeupForDate)
    .map(record => ({
      id: record.id,
      student: studentsById.get(record.studentId),
      class: classesById.get(record.classId),
      makeupRecord: record,
      absentRecord: attendance.find(
        absent => absent.studentId === record.studentId && absent.date === record.makeupForDate && absent.status === 'absent'
      ),
    }))
    .sort((a, b) => b.makeupRecord.date.localeCompare(a.makeupRecord.date));

  return { needed, completed };
};
