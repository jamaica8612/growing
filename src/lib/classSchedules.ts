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

export const deriveLegacyClassScheduleFields = (schedules: ClassSchedule[]) => {
  const first = schedules[0];
  return {
    days: Array.from(new Set(schedules.map(schedule => schedule.day))),
    startTime: first?.startTime ?? '14:00',
    endTime: first?.endTime ?? '15:30',
  };
};
