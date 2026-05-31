import type { Class } from '../types';

export const getStudentClassTuition = (cls: Class, studentId: string): number =>
  cls.tuitionOverrides?.[studentId] ?? cls.tuitionFee;

export const getTuitionOverrideCount = (cls: Class): number =>
  Object.keys(cls.tuitionOverrides ?? {}).filter(studentId => cls.studentIds.includes(studentId)).length;
