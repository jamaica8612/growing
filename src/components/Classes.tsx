import React, { useState } from 'react';
import type { Student, Class, ClassSchedule, DayOfWeek } from '../types';
import { BookOpen, Plus, Clock, X, Users, Calendar } from 'lucide-react';
import { deriveLegacyClassScheduleFields, getClassScheduleLabel, getClassSchedules, getSchedulesForDay } from '../lib/classSchedules';
import { getTuitionOverrideCount } from '../lib/classTuition';

interface ClassesProps {
  classes: Class[];
  students: Student[];
  onAddClass: (classData: Omit<Class, 'id'>) => void;
  onUpdateClass: (classData: Class) => void;
  onDeleteClass: (id: string) => void;
}

export const Classes: React.FC<ClassesProps> = ({
  classes,
  students,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formDays, setFormDays] = useState<DayOfWeek[]>([]);
  const [formStartTime, setFormStartTime] = useState('14:00');
  const [formEndTime, setFormEndTime] = useState('15:30');
  const [formSchedules, setFormSchedules] = useState<ClassSchedule[]>([]);
  const [formTuitionFee, setFormTuitionFee] = useState(200000);
  const [formTuitionOverrides, setFormTuitionOverrides] = useState<Record<string, number>>({});
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);

  // List of active students to choose from
  const activeStudents = students.filter(s => s.status === 'active');

  const daysOfWeek: DayOfWeek[] = ['월', '화', '수', '목', '금'];

  // Timetable range parameters
  const START_HOUR = 13; // 1:00 PM
  const END_HOUR = 20; // 8:00 PM
  const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60; // 420 mins

  // Time conversion helper: "HH:MM" -> minutes from START_HOUR
  const getMinutesFromStart = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMins = hours * 60 + minutes;
    const startMins = START_HOUR * 60;
    return Math.max(0, totalMins - startMins);
  };

  // Duration helper in minutes
  const getDurationMinutes = (startStr: string, endStr: string): number => {
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  };

  // Toggle day selection
  const handleDayToggle = (day: DayOfWeek) => {
    if (formDays.includes(day)) {
      setFormDays(formDays.filter(d => d !== day));
    } else {
      setFormDays([...formDays, day]);
    }
  };

  const handleAddSchedule = () => {
    setFormSchedules(prev => [
      ...prev,
      { day: daysOfWeek[0], startTime: '14:00', endTime: '15:30' },
    ]);
  };

  const handleScheduleChange = (index: number, patch: Partial<ClassSchedule>) => {
    setFormSchedules(prev => prev.map((schedule, i) => (i === index ? { ...schedule, ...patch } : schedule)));
  };

  const handleRemoveSchedule = (index: number) => {
    setFormSchedules(prev => prev.filter((_, i) => i !== index));
  };

  // Toggle student selection
  const handleStudentToggle = (studentId: string) => {
    if (formStudentIds.includes(studentId)) {
      setFormStudentIds(formStudentIds.filter(id => id !== studentId));
      setFormTuitionOverrides(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } else {
      setFormStudentIds([...formStudentIds, studentId]);
    }
  };

  const handleTuitionOverrideChange = (studentId: string, value: string) => {
    const amount = Number(value);
    setFormTuitionOverrides(prev => {
      const next = { ...prev };
      if (!value || !Number.isFinite(amount) || amount === Number(formTuitionFee)) {
        delete next[studentId];
      } else {
        next[studentId] = Math.max(0, amount);
      }
      return next;
    });
  };

  // Open form for adding
  const handleOpenAdd = () => {
    setEditingClass(null);
    setFormName('');
    setFormDays(['월', '수']);
    setFormStartTime('14:00');
    setFormEndTime('15:30');
    setFormSchedules([
      { day: '월', startTime: '14:00', endTime: '15:30' },
      { day: '수', startTime: '14:00', endTime: '15:30' },
    ]);
    setFormTuitionFee(200000);
    setFormTuitionOverrides({});
    setFormStudentIds([]);
    setIsFormOpen(true);
  };

  // Open form for editing
  const handleOpenEdit = (cls: Class) => {
    setEditingClass(cls);
    setFormName(cls.name);
    setFormDays(cls.days);
    setFormStartTime(cls.startTime);
    setFormEndTime(cls.endTime);
    setFormSchedules(getClassSchedules(cls));
    setFormTuitionFee(cls.tuitionFee);
    setFormTuitionOverrides(cls.tuitionOverrides ?? {});
    setFormStudentIds(cls.studentIds);
    setIsFormOpen(true);
  };

  // Submit Class Add/Edit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formSchedules.length === 0) {
      alert('클래스 이름과 시간표를 최소 1개 입력해 주세요.');
      return;
    }

    if (formSchedules.some(schedule => schedule.startTime >= schedule.endTime)) {
      alert('각 시간표의 종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    const legacyFields = deriveLegacyClassScheduleFields(formSchedules);
    const tuitionOverrides = Object.fromEntries(
      Object.entries(formTuitionOverrides)
        .filter(([studentId, fee]) => formStudentIds.includes(studentId) && Number.isFinite(fee) && fee >= 0 && fee !== Number(formTuitionFee))
    );
    const classData = {
      name: formName.trim(),
      days: legacyFields.days,
      startTime: legacyFields.startTime,
      endTime: legacyFields.endTime,
      schedules: formSchedules,
      tuitionFee: Number(formTuitionFee),
      tuitionOverrides,
      studentIds: formStudentIds,
    };

    if (editingClass) {
      onUpdateClass({ ...classData, id: editingClass.id });
    } else {
      onAddClass(classData);
    }
    setIsFormOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`"${name}" 클래스를 삭제하시겠습니까?\n이 클래스에 연결된 출결 정보 및 학생들의 반 정보가 초기화됩니다.`)) {
      onDeleteClass(id);
      setIsFormOpen(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Visual Timetable Scheduler */}
      <div className="card">
        <div className="section-title-row">
          <h3 className="card-title" style={{ marginBottom: 0 }}>
            <Calendar size={20} className="text-primary" /> 주간 강의 시간표 (월 ~ 금)
          </h3>
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} /> 클래스 추가
          </button>
        </div>

        <div className="timetable-wrapper">
          <div className="timetable-grid">
            {/* Times column */}
            <div className="timetable-header-cell" style={{ background: '#f4f7f4' }}>시간</div>
            {daysOfWeek.map(day => (
              <div key={day} className="timetable-header-cell">
                {day}요일
              </div>
            ))}

            {/* Time markers on the left */}
            <div className="timetable-time-col">
              <div style={{ height: '60px', padding: '4px' }}>13:00</div>
              <div style={{ height: '60px', padding: '4px' }}>14:00</div>
              <div style={{ height: '60px', padding: '4px' }}>15:00</div>
              <div style={{ height: '60px', padding: '4px' }}>16:00</div>
              <div style={{ height: '60px', padding: '4px' }}>17:00</div>
              <div style={{ height: '60px', padding: '4px' }}>18:00</div>
              <div style={{ height: '60px', padding: '4px' }}>19:00</div>
              <div style={{ height: '60px', padding: '4px' }}>20:00</div>
            </div>

            {/* Day columns */}
            {daysOfWeek.map(day => (
              <div key={day} className="timetable-day-col">
                {classes
                  .flatMap(cls => getSchedulesForDay(cls, day).map(schedule => ({ cls, schedule })))
                  .map(({ cls, schedule }) => {
                    const startMins = getMinutesFromStart(schedule.startTime);
                    const duration = getDurationMinutes(schedule.startTime, schedule.endTime);

                    // Calculate percentage style
                    const topPercent = (startMins / TOTAL_MINUTES) * 100;
                    const heightPercent = (duration / TOTAL_MINUTES) * 100;

                    return (
                      <div
                        key={`${cls.id}-${day}-${schedule.startTime}-${schedule.endTime}`}
                        className="class-slot"
                        style={{
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                        }}
                        onClick={() => handleOpenEdit(cls)}
                        title={`${cls.name} (${schedule.startTime} - ${schedule.endTime})`}
                      >
                        <div>
                          <div className="class-slot-name">{cls.name}</div>
                          <div className="class-slot-time">
                            {schedule.startTime} - {schedule.endTime}
                          </div>
                        </div>
                        <div className="class-slot-count">
                          👤 {cls.studentIds.length}명
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Class Directory Cards */}
      <div className="card">
        <h3 className="card-title">
          <BookOpen size={20} className="text-primary" /> 운영 중인 클래스 목록 ({classes.length}개)
        </h3>

        {classes.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
            등록된 클래스가 없습니다. 상단의 [클래스 추가] 버튼을 눌러 새 수업을 개설하세요.
          </p>
        ) : (
          <div className="grid-container cols-3">
            {classes.map(cls => (
              <div
                key={cls.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  backgroundColor: '#fafbfc',
                  cursor: 'pointer',
                }}
                onClick={() => handleOpenEdit(cls)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '1.05rem' }}>
                    {cls.name}
                  </h4>
                  <button
                    className="btn-icon-only"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(cls);
                    }}
                  >
                    <Clock size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  <div>
                    🕒 <strong>시간표:</strong> {getClassScheduleLabel(cls)}
                  </div>
                  <div>
                    💰 <strong>기본 원비:</strong> {cls.tuitionFee.toLocaleString()}원
                    {getTuitionOverrideCount(cls) > 0 && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                        개별 원비 {getTuitionOverrideCount(cls)}명
                      </span>
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={16} className="text-primary" />
                    <strong>학생 ({cls.studentIds.length}명):</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.2rem' }}>
                      {cls.studentIds.length === 0 ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>배정 없음</span>
                      ) : (
                        cls.studentIds.map(sid => {
                          const student = students.find(s => s.id === sid);
                          return (
                            <span
                              key={sid}
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#f0f7f3',
                                color: 'var(--color-primary)',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              {student?.name || '미등록'}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Class */}
      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingClass ? `${editingClass.name} 정보 수정` : '새로운 클래스 개설'}
              </h3>
              <button className="btn-icon-only" onClick={() => setIsFormOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>클래스 명칭 *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="예: 초등 파닉스반, 중학 영문법 A"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>요일별 수업 시간표 *</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.35rem' }}>
                    {formSchedules.map((schedule, index) => (
                      <div
                        key={`${schedule.day}-${schedule.startTime}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr auto',
                          gap: '0.45rem',
                          alignItems: 'center',
                        }}
                      >
                        <select
                          className="form-control"
                          value={schedule.day}
                          onChange={e => handleScheduleChange(index, { day: e.target.value as DayOfWeek })}
                          aria-label="수업 요일"
                        >
                          {daysOfWeek.map(day => (
                            <option key={day} value={day}>{day}요일</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          className="form-control"
                          value={schedule.startTime}
                          onChange={e => handleScheduleChange(index, { startTime: e.target.value })}
                          aria-label="시작 시간"
                          required
                        />
                        <input
                          type="time"
                          className="form-control"
                          value={schedule.endTime}
                          onChange={e => handleScheduleChange(index, { endTime: e.target.value })}
                          aria-label="종료 시간"
                          required
                        />
                        <button
                          type="button"
                          className="btn-icon-only"
                          title="시간표 삭제"
                          onClick={() => handleRemoveSchedule(index)}
                          disabled={formSchedules.length === 1}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-secondary" onClick={handleAddSchedule} style={{ alignSelf: 'flex-start' }}>
                      <Plus size={15} /> 시간 추가
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ display: 'none' }}>
                  <label>수업 요일 선택 (중복 가능) *</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {daysOfWeek.map(day => {
                      const isSelected = formDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className="btn"
                          style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            backgroundColor: isSelected ? 'var(--color-primary)' : '#f3f4f6',
                            color: isSelected ? 'white' : 'var(--color-text-primary)',
                            border: isSelected ? 'none' : '1px solid var(--color-border)',
                          }}
                          onClick={() => handleDayToggle(day)}
                        >
                          {day}요일
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-row" style={{ display: 'none' }}>
                  <div className="form-group">
                    <label>수업 시작 시간</label>
                    <input
                      type="time"
                      className="form-control"
                      value={formStartTime}
                      onChange={e => setFormStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>수업 종료 시간</label>
                    <input
                      type="time"
                      className="form-control"
                      value={formEndTime}
                      onChange={e => setFormEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>월별 교육비 (원비)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formTuitionFee}
                    onChange={e => setFormTuitionFee(Number(e.target.value))}
                    step={10000}
                    min={0}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>수강 학생 배정</label>
                  <div
                    style={{
                      maxHeight: '180px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: '0.5rem',
                      backgroundColor: '#fafbfc',
                    }}
                  >
                    {activeStudents.length === 0 ? (
                      <p style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                        등록된 재원생이 없습니다. [학생 관리]에서 학생을 먼저 추가해 주세요.
                      </p>
                    ) : (
                      activeStudents.map(student => {
                        const isChecked = formStudentIds.includes(student.id);
                        return (
                          <div
                            key={student.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isChecked ? 'minmax(0, 1fr) 130px' : '1fr',
                              gap: '0.45rem',
                              alignItems: 'center',
                              fontSize: '0.85rem',
                              padding: '0.25rem',
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleStudentToggle(student.id)}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                              />
                              <span style={{ minWidth: 0 }}>
                                {student.name} ({student.grade.split(' ')[1] || student.grade})
                              </span>
                            </label>
                            {isChecked && (
                              <input
                                type="number"
                                className="form-control"
                                value={formTuitionOverrides[student.id] ?? formTuitionFee}
                                min={0}
                                step={10000}
                                aria-label={`${student.name} 개별 원비`}
                                title="기본 원비와 다를 때만 개별 원비로 저장됩니다"
                                onChange={e => handleTuitionOverrideChange(student.id, e.target.value)}
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ justifyContent: editingClass ? 'space-between' : 'flex-end' }}>
                {editingClass && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(editingClass.id, editingClass.name)}
                  >
                    클래스 삭제
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>
                    취소
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingClass ? '수정 완료' : '개설'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
