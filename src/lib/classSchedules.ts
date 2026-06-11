import type { Class, ClassSchedule, DayOfWeek } from '../types';

export const getClassSchedules = (cls: Class): ClassSchedule[] => {
  if (Array.isArray(cls.schedules) && cls.schedules.length > 0) return cls.schedules;
  return cls.days.map(day => ({
    day,
    startTime: cls.startTime,
    endTime: cls.endTime,
  }));
};

export const getSchedulesForDay = (cls: Class, day: DayOfWeek): ClassSchedule[] =>
  getClassSchedules(cls).filter(schedule => schedule.day === day);

export const getClassScheduleLabel = (cls: Class): string =>
  getClassSchedules(cls)
    .map(schedule => `${schedule.day} ${schedule.startTime}~${schedule.endTime}`)
    .join(', ');

/** 특정 요일의 수강생 목록 반환 — 요일별 설정이 있으면 그것을, 없으면 반 전체 목록 사용 */
export const getStudentIdsForDay = (cls: Class, day: DayOfWeek): string[] => {
  const schedule = getClassSchedules(cls).find(s => s.day === day);
  return schedule?.studentIds ?? cls.studentIds;
};

export const deriveLegacyClassScheduleFields = (schedules: ClassSchedule[]) => {
  const first = schedules[0];
  return {
    days: Array.from(new Set(schedules.map(schedule => schedule.day))),
    startTime: first?.startTime ?? '14:00',
    endTime: first?.endTime ?? '15:30',
  };
};
