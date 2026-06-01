import React, { useMemo, useState } from 'react';
import type { Student, Class, ClassSchedule, DayOfWeek } from '../types';
import { BookOpen, Plus, Clock, X, Users, Calendar } from 'lucide-react';
import { deriveLegacyClassScheduleFields, getClassScheduleLabel, getClassSchedules, getSchedulesForDay } from '../lib/classSchedules';
import { getStudentClassTuition, getTuitionOverrideCount } from '../lib/classTuition';

const CLASS_COLORS = [
  '#10b981', // 에메랄드
  '#3b82f6', // 파랑
  '#f59e0b', // 호박
  '#ef4444', // 빨강
  '#8b5cf6', // 보라
  '#ec4899', // 핑크
  '#06b6d4', // 청록
  '#f97316', // 주황
  '#84cc16', // 연두
  '#6366f1', // 인디고
];

const getClassColor = (cls: Class) => cls.color ?? CLASS_COLORS[0];

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
  const [formColor, setFormColor] = useState(CLASS_COLORS[0]);

  // Per-class summary: active student count + expected monthly tuition.
  const classSummary = useMemo(() => {
    const activeIdSet = new Set(students.filter(s => s.status === 'active').map(s => s.id));
    return classes.map(cls => {
      const activeMembers = cls.studentIds.filter(id => activeIdSet.has(id));
      const tuitionSum = activeMembers.reduce((sum, id) => sum + getStudentClassTuition(cls, id), 0);
      return { cls, count: activeMembers.length, tuitionSum };
    });
  }, [classes, students]);

  const summaryTotals = useMemo(
    () => classSummary.reduce((acc, c) => ({ count: acc.count + c.count, tuition: acc.tuition + c.tuitionSum }), { count: 0, tuition: 0 }),
    [classSummary]
  );

  // 배정 대상: 재원생 + 이미 이 반에 속한 학생(휴원생 포함)을 노출해
  // 휴원 멤버의 배정 해제나 개별 원비 관리가 가능하도록 한다.
  const activeStudents = students.filter(
    s => s.status === 'active' || formStudentIds.includes(s.id)
  );

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

  const getDayEvents = (day: DayOfWeek) =>
    classes
      .flatMap(cls => getSchedulesForDay(cls, day).map(schedule => ({ cls, schedule })))
      .sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime) || a.cls.name.localeCompare(b.cls.name));

  const daySummaries = daysOfWeek.map(day => {
    const events = getDayEvents(day);
    return {
      day,
      events,
      studentCount: events.reduce((sum, event) => sum + event.cls.studentIds.length, 0),
    };
  });
  const weeklySlotCount = daySummaries.reduce((sum, summary) => sum + summary.events.length, 0);

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
    const usedColors = classes.map(c => c.color ?? CLASS_COLORS[0]);
    const nextColor = CLASS_COLORS.find(c => !usedColors.includes(c)) ?? CLASS_COLORS[classes.length % CLASS_COLORS.length];
    setFormColor(nextColor);
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
    setFormColor(cls.color ?? CLASS_COLORS[0]);
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
      color: formColor,
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
    <div className="gd-root">

      {/* ── 주간 시간표 ── */}
      <div className="gd-card">
        <div className="gd-card-head">
          <h2 className="gd-card-title"><Calendar size={18} /> 주간 강의 시간표 (월 ~ 금)</h2>
          <div className="tt-head-meta">
            <span>{classes.length}개 반</span>
            <span>주 {weeklySlotCount}타임</span>
          </div>
          <button className="pay-btn primary" onClick={handleOpenAdd}><Plus size={15} /> 클래스 추가</button>
        </div>
        <div className="tt-overview">
          {daySummaries.map(({ day, events, studentCount }) => (
            <button key={day} type="button" className="tt-overview-day">
              <b>{day}</b>
              <span>{events.length}타임</span>
              <em>{studentCount}명</em>
            </button>
          ))}
        </div>
        <div className="tt-wrap">
          <div className="tt-grid">
            <div className="tt-corner">시간</div>
            {daysOfWeek.map(day => <div key={day} className="tt-dayhead">{day}요일</div>)}

            <div className="tt-timecol">
              {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
                <div key={i} className="tt-time" style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }}>
                  {String(START_HOUR + i).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {daysOfWeek.map(day => (
              <div key={day} className="tt-daycol">
                {getDayEvents(day).length === 0 && <div className="tt-day-empty">수업 없음</div>}
                {getDayEvents(day).map(({ cls, schedule }) => {
                  const startMins = getMinutesFromStart(schedule.startTime);
                  const duration = getDurationMinutes(schedule.startTime, schedule.endTime);
                  const topPct = (startMins / TOTAL_MINUTES) * 100;
                  const heightPct = (duration / TOTAL_MINUTES) * 100;
                  const color = getClassColor(cls);
                  return (
                    <div key={`${cls.id}-${day}-${schedule.startTime}`} className="tt-slot"
                      style={{ top: `${topPct}%`, height: `${heightPct}%`, background: `${color}22`, borderLeftColor: color, color }}
                      onClick={() => handleOpenEdit(cls)}>
                      <span className="tt-slot-name">{cls.name}</span>
                      <span className="tt-slot-time">{schedule.startTime}–{schedule.endTime}</span>
                      <span className="tt-slot-count">재원 {cls.studentIds.length}명</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="tt-mobile-agenda">
          {daySummaries.map(({ day, events }) => (
            <section key={day} className="tt-mobile-day">
              <div className="tt-mobile-dayhead">
                <b>{day}요일</b>
                <span>{events.length}타임</span>
              </div>
              {events.length === 0 ? (
                <p className="tt-mobile-empty">수업 없음</p>
              ) : (
                <div className="tt-mobile-list">
                  {events.map(({ cls, schedule }) => {
                    const color = getClassColor(cls);
                    return (
                      <button
                        key={`${cls.id}-${day}-${schedule.startTime}`}
                        type="button"
                        className="tt-mobile-slot"
                        style={{ borderLeftColor: color }}
                        onClick={() => handleOpenEdit(cls)}
                      >
                        <span className="tt-mobile-time">{schedule.startTime}–{schedule.endTime}</span>
                        <b style={{ color }}>{cls.name}</b>
                        <em>{cls.studentIds.length}명</em>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* ── 반별 현황 + 클래스 카드 ── */}
      {classes.length > 0 && (
        <div className="cls-grid2">
          {/* 좌: 현황 요약 */}
          <section className="gd-card">
            <h2 className="gd-card-title" style={{ marginBottom: '0.85rem' }}><Users size={18} /> 반별 현황 요약</h2>
            <div className="cls-summary">
              {classSummary.map(({ cls, count, tuitionSum }) => (
                <div key={cls.id} className="cls-srow" style={{ borderLeftColor: getClassColor(cls) }}>
                  <span className="cls-sname" style={{ color: getClassColor(cls) }}>{cls.name}</span>
                  <span className="cls-scount">재원생 {count}명</span>
                  <span className="cls-stui">{tuitionSum.toLocaleString()}원</span>
                </div>
              ))}
              <div className="cls-srow total">
                <span className="cls-sname">전체 합계</span>
                <span className="cls-scount">재원생 {summaryTotals.count}명</span>
                <span className="cls-stui">{summaryTotals.tuition.toLocaleString()}원</span>
              </div>
            </div>
          </section>

          {/* 우: 클래스 카드 */}
          <section className="gd-card">
            <h2 className="gd-card-title" style={{ marginBottom: '0.85rem' }}><BookOpen size={18} /> 운영 중인 클래스 ({classes.length}개)</h2>
            {classes.length === 0 ? (
              <p className="cls-empty">등록된 클래스가 없습니다. 상단에서 추가하세요.</p>
            ) : (
              <div className="cls-cards">
                {classes.map(cls => {
                  const color = getClassColor(cls);
                  return (
                    <div key={cls.id} className="cls-card" style={{ borderTopColor: color, cursor: 'pointer' }} onClick={() => handleOpenEdit(cls)}>
                      <div className="cls-card-name" style={{ color }}>{cls.name}</div>
                      <div className="cls-card-line"><Clock size={13} /> {getClassScheduleLabel(cls)}</div>
                      <div className="cls-card-line">💰 {cls.tuitionFee.toLocaleString()}원
                        {getTuitionOverrideCount(cls) > 0 && <span className="cls-chip">개별 {getTuitionOverrideCount(cls)}명</span>}
                      </div>
                      <div className="cls-chips">
                        {cls.studentIds.length === 0 ? (
                          <span className="cls-empty">배정 없음</span>
                        ) : (
                          cls.studentIds.map(sid => {
                            const st = students.find(s => s.id === sid);
                            const isPaused = st?.status === 'paused';
                            return <span key={sid} className={`cls-chip ${isPaused ? 'paused' : ''}`}>{st?.name || '미등록'}{isPaused ? ' 휴원' : ''}</span>;
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal: Add/Edit Class */}
      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 'min(600px, calc(100vw - 1.5rem))' }}>
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
                  <label>반 색상</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem', alignItems: 'center' }}>
                    {CLASS_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormColor(color)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          border: formColor === color ? `3px solid #1f2937` : '3px solid transparent',
                          outline: formColor === color ? `2px solid ${color}` : 'none',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'transform 0.15s',
                          transform: formColor === color ? 'scale(1.2)' : 'scale(1)',
                        }}
                        title={color}
                      />
                    ))}
                    <input
                      type="color"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      style={{ width: '28px', height: '28px', border: 'none', borderRadius: '50%', cursor: 'pointer', padding: 0 }}
                      title="직접 색상 선택"
                    />
                  </div>
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
                                {student.status === 'paused' && (
                                  <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: '#92400e', fontWeight: 700 }}>휴원</span>
                                )}
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
