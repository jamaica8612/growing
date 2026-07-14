import React, { useCallback, useState, useMemo } from 'react';
import type { Student, Class, Attendance, EditableAttendanceStatus, HomeworkStatus, MakeupReservation } from '../types';
import { Calendar, CalendarPlus, Clock, X } from 'lucide-react';
import { AttendanceCalendar } from './AttendanceCalendar';
import { normalizeAttendanceStatus } from '../lib/attendanceStatus';
import { getStudentIdsForDay } from '../lib/classSchedules';

interface AttendanceProps {
  attendance: Attendance[];
  students: Student[];
  classes: Class[];
  makeupReservations: MakeupReservation[];
  onSaveMakeupReservation: (reservation: Omit<MakeupReservation, 'id' | 'createdAt' | 'status' | 'completedAt'> & { id?: string; status?: MakeupReservation['status'] }) => void;
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => void;
  onDeleteAttendance: (attendanceId: string) => void;
}

const PRIMARY_STATUS_OPTIONS: { value: EditableAttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: '출석', tone: 'ok' },
  { value: 'absent', label: '결석', tone: 'danger' },
];

const SUPPLEMENT_MINUTE_OPTIONS = Array.from({ length: 18 }, (_, index) => (index + 1) * 10);

export const AttendanceManager: React.FC<AttendanceProps> = ({
  attendance,
  students,
  classes,
  makeupReservations,
  onSaveMakeupReservation,
  onSaveAttendance,
  onDeleteAttendance,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [attendanceMemos, setAttendanceMemos] = useState<Record<string, string>>({});
  const [makeupForDates, setMakeupForDates] = useState<Record<string, string>>({});
  const [pendingAbsent, setPendingAbsent] = useState<{ studentId: string; classId: string; date: string } | null>(null);
  const [reservationTarget, setReservationTarget] = useState<{ studentId: string; classId: string } | null>(null);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [reservationTime, setReservationTime] = useState('17:00');
  const [reservationAbsenceDate, setReservationAbsenceDate] = useState('');
  const [reservationReason, setReservationReason] = useState<MakeupReservation['reason']>('absence');
  const [reservationMemo, setReservationMemo] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));

  const handleSelectedDateChange = (date: string) => {
    setSelectedDate(date);
    setAttendanceMemos({});
    setMakeupForDates({});
    setPendingAbsent(null);
  };

  const activeStudentIds = useMemo(() => new Set(students.filter(s => s.status === 'active').map(s => s.id)), [students]);

  const getAttendanceRecord = useCallback((studentId: string, classId: string, date: string) =>
    attendance.find(a => a.studentId === studentId && a.classId === classId && a.date === date), [attendance]);

  const todayDateStr = new Date().toISOString().split('T')[0];

  const getCurrentTimeStr = (): string =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const handleArrival = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({ studentId, classId, date: selectedDate, status: 'present', memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '', checkInTime: getCurrentTimeStr() });
  };

  const handleDeparture = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({ studentId, classId, date: selectedDate, status: record?.status ?? 'present', memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '', checkOutTime: getCurrentTimeStr() });
  };

  const handleStatusChange = (studentId: string, classId: string, status: EditableAttendanceStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const currentStatus = record ? normalizeAttendanceStatus(record.status) : undefined;

    // Primary button clicked (출석/결석/보강)
    if (status === 'present' || status === 'absent' || status === 'makeup') {
      const isPrimaryActive =
        currentStatus === status ||
        (status === 'present' && currentStatus === 'supplement');
      if (record && isPrimaryActive) {
        onDeleteAttendance(record.id);
        return;
      }
      const currentMemo = attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '';
      const shouldStampCheckIn = selectedDate === todayDateStr && status === 'present' && !record?.checkInTime;
      const makeupForDate = status === 'makeup' ? (makeupForDates[`${studentId}-${classId}`] ?? record?.makeupForDate ?? '') : undefined;
      // 결석 선택 시 등하원 시간이 있으면 경고창으로 확인 요청
      if (status === 'absent' && (record?.checkInTime || record?.checkOutTime)) {
        setPendingAbsent({ studentId, classId, date: selectedDate });
        return;
      }
      // 결석만 등하원 초기화, 나머지는 현재 값 유지 (명시적으로 전달해 stale closure 방지)
      onSaveAttendance({
        studentId,
        classId,
        date: selectedDate,
        status,
        memo: currentMemo,
        homeworkStatus: record?.homeworkStatus ?? '',
        makeupForDate: makeupForDate || undefined,
        supplementMinutes: undefined,
        checkInTime: status === 'absent' ? '' : shouldStampCheckIn ? getCurrentTimeStr() : record?.checkInTime,
        checkOutTime: status === 'absent' ? '' : record?.checkOutTime,
      });
      return;
    }

    // Secondary toggle: 보충 (출석 상태에서만)
    if (status === 'supplement') {
      if (!record || (currentStatus !== 'present' && currentStatus !== 'supplement')) return;
      const currentMemo = attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '';
      if (currentStatus === 'supplement') {
        // 보충 토글 off → 출석으로 복귀
        const shouldStampCheckIn = selectedDate === todayDateStr && !record?.checkInTime;
        onSaveAttendance({
          studentId,
          classId,
          date: selectedDate,
          status: 'present',
          memo: currentMemo,
          homeworkStatus: record?.homeworkStatus ?? '',
          supplementMinutes: undefined,
          ...(shouldStampCheckIn ? { checkInTime: getCurrentTimeStr() } : {}),
        });
      } else {
        // 보충 토글 on → supplement로 변경 (출석 기록 위에 덮어씀, 등하원 시간 유지)
        onSaveAttendance({
          studentId,
          classId,
          date: selectedDate,
          status: 'supplement',
          memo: currentMemo,
          homeworkStatus: record?.homeworkStatus ?? '',
          supplementMinutes: record?.supplementMinutes ?? 30,
        });
      }
    }
  };

  const handleSupplementMinutesChange = (studentId: string, classId: string, minutes: number) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: 'supplement',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '',
      supplementMinutes: minutes,
    });
  };

  const handleTimeEdit = (studentId: string, classId: string, field: 'checkInTime' | 'checkOutTime', value: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    if (!record) return;
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: record.status,
      memo: record.memo,
      homeworkStatus: record.homeworkStatus ?? '',
      [field]: value,
    });
  };

  const handleHomeworkChange = (studentId: string, classId: string, homeworkStatus: HomeworkStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const nextHomeworkStatus = record?.homeworkStatus === homeworkStatus ? '' : homeworkStatus;
    onSaveAttendance({ studentId, classId, date: selectedDate, status: record?.status || 'present', memo: record?.memo || '', homeworkStatus: nextHomeworkStatus });
  };

  const handleMakeupForDateChange = (studentId: string, classId: string, date: string) => {
    setMakeupForDates(prev => ({ ...prev, [`${studentId}-${classId}`]: date }));
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    if (record?.status === 'makeup') {
      onSaveAttendance({ studentId, classId, date: selectedDate, status: 'makeup', memo: record.memo, makeupForDate: date || undefined });
    }
  };

  const handleMemoChange = (studentId: string, classId: string, memo: string) =>
    setAttendanceMemos(prev => ({ ...prev, [`${studentId}-${classId}`]: memo }));

  const openReservationModal = (studentId: string, classId: string) => {
    const cls = classes.find(item => item.id === classId);
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    setReservationTarget({ studentId, classId });
    setReservationDate(selectedDate);
    setReservationTime(cls?.startTime || '17:00');
    setReservationAbsenceDate(record?.status === 'absent' ? selectedDate : '');
    setReservationReason(record?.status === 'absent' ? 'absence' : 'supplement');
    setReservationMemo('');
  };

  const handleSaveReservation = () => {
    if (!reservationTarget || !reservationDate || !reservationTime) return;
    onSaveMakeupReservation({
      studentId: reservationTarget.studentId,
      classId: reservationTarget.classId,
      scheduledDate: reservationDate,
      scheduledTime: reservationTime,
      sourceAbsenceDate: reservationReason === 'absence' ? reservationAbsenceDate || undefined : undefined,
      reason: reservationReason,
      memo: reservationMemo,
    });
    setReservationTarget(null);
  };

  // 표시 대상 반 목록 (selectedClassId 필터)
  const targetClasses = useMemo(() => classes.filter(cls =>
    selectedClassId === 'all' || cls.id === selectedClassId
  ), [classes, selectedClassId]);

  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
  const d = new Date(`${selectedDate}T00:00:00`);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
  const selectedDay = WEEKDAY_KO[d.getDay()];

  // 일자 요약
  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, makeup: 0, supplement: 0, unchecked: 0 };
    targetClasses.forEach(cls => {
      getStudentIdsForDay(cls, selectedDay).filter(id => activeStudentIds.has(id)).forEach(id => {
        const r = getAttendanceRecord(id, cls.id, selectedDate);
        if (!r || (!r.checkInTime && r.status !== 'absent' && r.status !== 'makeup' && r.status !== 'supplement' && r.status !== 'late')) s.unchecked++;
        else if (r.status === 'absent') s.absent++;
        else if (r.status === 'makeup') s.makeup++;
        else if (r.status === 'supplement') s.supplement++;
        else if (r.status === 'late') s.late++;
        else s.present++;
      });
    });
    return s;
  }, [selectedDate, selectedDay, targetClasses, activeStudentIds, getAttendanceRecord]);

  // 월간 통계 데이터
  const getMonthlyReportData = () => {
    const reportData: Record<string, { id: string; name: string; school: string; grade: string; isPaused: boolean; present: number; absent: number; makeup: number; supplement: number; total: number }> = {};
    students.filter(s => s.status !== 'inactive').forEach(s => {
      reportData[s.id] = { id: s.id, name: s.name, school: s.school, grade: s.grade, isPaused: s.status === 'paused', present: 0, absent: 0, makeup: 0, supplement: 0, total: 0 };
    });
    attendance.filter(a => a.date.startsWith(reportMonth)).forEach(a => {
      if (reportData[a.studentId]) {
        reportData[a.studentId][normalizeAttendanceStatus(a.status)]++;
        reportData[a.studentId].total++;
      }
    });
    return Object.values(reportData);
  };
  const monthlyReport = getMonthlyReportData();
  const activeAttendance = attendance.filter(a => activeStudentIds.has(a.studentId));

  const confirmAbsentAction = () => {
    if (!pendingAbsent) return;
    const { studentId, classId, date } = pendingAbsent;
    const rec = getAttendanceRecord(studentId, classId, date);
    onSaveAttendance({
      studentId,
      classId,
      date,
      status: 'absent',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? rec?.memo ?? '',
      homeworkStatus: rec?.homeworkStatus ?? '',
      checkInTime: '',
      checkOutTime: '',
    });
    setPendingAbsent(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── 필터 바 ── */}
      <div className="at-filterbar">
        <div className="at-filter-left">
          <label className="at-datepick">
            <span>출결 기준일</span>
            <input type="date" value={selectedDate} onChange={e => handleSelectedDateChange(e.target.value)} className="gd-dateinput" style={{ border: '1px solid var(--color-border)' }} />
          </label>
          <div className="at-chips">
            <button className={`at-chip ${selectedClassId === 'all' ? 'on' : ''}`} onClick={() => setSelectedClassId('all')}>전체 반</button>
            {classes.map(cls => (
              <button key={cls.id} className={`at-chip ${selectedClassId === cls.id ? 'on' : ''}`} onClick={() => setSelectedClassId(cls.id)}>
                <span className="at-chip-dot" style={{ background: cls.color }} />{cls.name}
              </button>
            ))}
          </div>
        </div>
        <span className="at-hint">💡 버튼을 누르면 즉시 자동 저장돼요</span>
      </div>

      {/* ── 일자 요약 스트립 ── */}
      <div className="at-summary">
        <div className="at-sum-date"><Calendar size={16} /> {dateLabel}</div>
        <div className="at-sum-chips">
          <span className="at-sum ok">출석 <b>{summary.present}</b></span>
          <span className="at-sum warn">지각 <b>{summary.late}</b></span>
          <span className="at-sum danger">결석 <b>{summary.absent}</b></span>
          <span className="at-sum info">보강 <b>{summary.makeup}</b></span>
          <span className="at-sum warn">보충 <b>{summary.supplement}</b></span>
          <span className="at-sum muted">미체크 <b>{summary.unchecked}</b></span>
        </div>
      </div>

      {/* ── 반별 출결 로스터 ── */}
      {targetClasses.length === 0 ? (
        <div className="gd-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
          🌱 등록된 반이 없습니다. [반/시간표 관리]에서 반을 추가해 주세요.
        </div>
      ) : (
        targetClasses.map(cls => {
          const activeMembers = getStudentIdsForDay(cls, selectedDay).filter(id => activeStudentIds.has(id));
          const sched = cls.schedules?.find(s => s.day === selectedDay);
          const startTime = sched?.startTime ?? cls.startTime;
          const endTime = sched?.endTime ?? cls.endTime;
          const classTime = startTime && endTime ? `${startTime}–${endTime}` : '';
          return (
            <section className="gd-card" key={cls.id}>
              <div className="at-class-head">
                <span className="gd-class-bar" style={{ background: cls.color }} />
                <span className="gd-class-name">{cls.name}</span>
                {classTime && <span className="gd-class-time">{classTime}</span>}
                <span className="gd-class-count">재원 {activeMembers.length}명</span>
              </div>

              {activeMembers.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: '0.5rem' }}>
                  출결 대상인 재원생이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div className="at-table-head">
                    <span>학생</span>
                    <span>등 · 하원</span>
                    <span>출결</span>
                    <span>숙제</span>
                    <span>비고 메모</span>
                  </div>
                  <div className="at-rows">
                    {activeMembers.map(studentId => {
                      const student = students.find(s => s.id === studentId);
                      if (!student) return null;
                      const record = getAttendanceRecord(studentId, cls.id, selectedDate);
                      const currentStatus = record ? normalizeAttendanceStatus(record.status) : undefined;
                      const hw = record?.homeworkStatus ?? '';
                      const memoKey = `${studentId}-${cls.id}`;
                      const isDone = !!(record?.checkInTime || record?.status === 'absent' || record?.status === 'makeup' || record?.status === 'supplement');

                      return (
                        <div key={studentId} className={`at-row ${isDone ? 'done' : ''}`}>
                          {/* 학생 정보 */}
                          <div className="at-cell at-who">
                            <span className="at-name">
                              {student.name}
                              {currentStatus && (
                                <span className={`at-pill ${currentStatus === 'present' ? 'ok' : currentStatus === 'absent' ? 'danger' : currentStatus === 'makeup' ? 'info' : 'warn'}`}>
                                  {currentStatus === 'present' ? '출석' : currentStatus === 'absent' ? '결석' : currentStatus === 'makeup' ? '보강' : currentStatus === 'supplement' ? '보충' : '지각'}
                                </span>
                              )}
                            </span>
                            <span className="at-meta">{student.school} {student.grade.split(' ')[1] || student.grade}</span>
                          </div>

                          {/* 등하원 */}
                          <div className="at-cell at-io">
                            <div className="at-io-group">
                              <button className={`gd-io ${record?.checkInTime ? 'on-in' : ''}`} onClick={() => handleArrival(studentId, cls.id)}>
                                <span className="gd-io-lbl">🌱 등원</span>
                                <span className="gd-io-t">{record?.checkInTime || '—'}</span>
                              </button>
                              {record && currentStatus !== 'absent' && currentStatus !== 'makeup' && (
                                <input
                                  type="time"
                                  className="at-time-edit"
                                  value={record.checkInTime || ''}
                                  onChange={e => handleTimeEdit(studentId, cls.id, 'checkInTime', e.target.value)}
                                />
                              )}
                            </div>
                            <div className="at-io-group">
                              <button className={`gd-io ${record?.checkOutTime ? 'on-out' : ''}`} onClick={() => handleDeparture(studentId, cls.id)}>
                                <span className="gd-io-lbl">🏡 하원</span>
                                <span className="gd-io-t">{record?.checkOutTime || '—'}</span>
                              </button>
                              {record && currentStatus !== 'absent' && currentStatus !== 'makeup' && (
                                <input
                                  type="time"
                                  className="at-time-edit"
                                  value={record.checkOutTime || ''}
                                  onChange={e => handleTimeEdit(studentId, cls.id, 'checkOutTime', e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                          {/* 출결 세그먼트 */}
                          <div className="at-cell">
                            <span className="at-clabel">출결</span>
                            {/* 1단계: 출석 / 결석 / 보강 */}
                            <div className="gd-seg at-seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                              {PRIMARY_STATUS_OPTIONS.map(option => {
                                const isActive =
                                  currentStatus === option.value ||
                                  (option.value === 'present' && currentStatus === 'supplement');
                                return (
                                  <button
                                    key={option.value}
                                    className={`gd-seg-b ${isActive ? 'sel ' + option.tone : ''}`}
                                    onClick={() => handleStatusChange(studentId, cls.id, option.value)}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                            {/* 2단계: 보충 토글 (출석 선택 시) */}
                            {(currentStatus === 'present' || currentStatus === 'supplement') && (
                              <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <button
                                  className={`gd-seg-b at-secondary-toggle ${currentStatus === 'supplement' ? 'sel warn' : ''}`}
                                  onClick={() => handleStatusChange(studentId, cls.id, 'supplement')}
                                >
                                  + 보충
                                </button>
                                {currentStatus === 'supplement' && (
                                  <select
                                    className="form-control"
                                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: '96px' }}
                                    value={record?.supplementMinutes ?? 30}
                                    onChange={e => handleSupplementMinutesChange(studentId, cls.id, Number(e.target.value))}
                                  >
                                    {SUPPLEMENT_MINUTE_OPTIONS.map(minutes => (
                                      <option key={minutes} value={minutes}>{minutes}분</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                            {/* 보강 선택 시: 결석일 연결 */}
                            {currentStatus === 'makeup' && (() => {
                              const linkedDate = makeupForDates[`${studentId}-${cls.id}`] ?? record?.makeupForDate ?? '';
                              const hasAbsence = !!linkedDate && attendance.some(a => a.studentId === studentId && a.date === linkedDate && a.status === 'absent');
                              return (
                                <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.73rem' }}>
                                  <span style={{ color: 'var(--color-text-muted)' }}>결석일:</span>
                                  <input type="date" className="form-control" style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: '130px' }} max={selectedDate} value={linkedDate} onChange={e => handleMakeupForDateChange(studentId, cls.id, e.target.value)} />
                                  {linkedDate && <span style={{ color: hasAbsence ? 'var(--color-accent-mint)' : 'var(--color-warning)' }}>{hasAbsence ? '✓ 연결됨' : '⚠ 결석 없음'}</span>}
                                </div>
                              );
                            })()}
                            {(() => {
                              const nextReservation = makeupReservations
                                .filter(item => item.studentId === studentId && item.status === 'scheduled')
                                .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`))[0];
                              return (
                                <div className="at-reserve-row">
                                  <button type="button" className="pay-btn ghost sm" onClick={() => openReservationModal(studentId, cls.id)}>
                                    <CalendarPlus size={14} /> 보강 예약
                                  </button>
                                  {nextReservation && (
                                    <span className="at-reserve-note">
                                      예약 {nextReservation.scheduledDate} {nextReservation.scheduledTime}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* 숙제 세그먼트 */}
                          <div className="at-cell">
                            <span className="at-clabel">숙제</span>
                            <div className="gd-seg at-seg">
                              <button className={`gd-seg-b ${hw === 'done' ? 'sel ok' : ''}`} onClick={() => handleHomeworkChange(studentId, cls.id, 'done')}>완료</button>
                              <button className={`gd-seg-b ${hw === 'incomplete' ? 'sel warn' : ''}`} onClick={() => handleHomeworkChange(studentId, cls.id, 'incomplete')}>미흡</button>
                              <button className={`gd-seg-b ${hw === 'undone' ? 'sel danger' : ''}`} onClick={() => handleHomeworkChange(studentId, cls.id, 'undone')}>안함</button>
                            </div>
                          </div>

                          {/* 메모 */}
                          <div className="at-cell">
                            <span className="at-clabel">메모</span>
                            <input
                              className="at-memo-in"
                              placeholder="특이사항 메모…"
                              value={attendanceMemos[memoKey] ?? record?.memo ?? ''}
                              onChange={e => handleMemoChange(studentId, cls.id, e.target.value)}
                              onBlur={e => {
                                if (record) onSaveAttendance({ studentId, classId: cls.id, date: selectedDate, status: record.status, memo: e.target.value });
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}

      {/* ── 결석 경고 모달 ── */}
      {pendingAbsent && (() => {
        const s = students.find(st => st.id === pendingAbsent.studentId);
        const cls = classes.find(c => c.id === pendingAbsent.classId);
        return (
          <div className="at-absent-modal-bg" onClick={() => setPendingAbsent(null)}>
            <div className="at-absent-modal" onClick={e => e.stopPropagation()}>
              <div className="at-absent-modal-icon">⚠️</div>
              <h3 className="at-absent-modal-title">결석 처리 확인</h3>
              <p className="at-absent-modal-body">
                <strong>{s?.name}</strong>{cls ? ` (${cls.name})` : ''} 학생의<br />등하원 시간이 초기화됩니다.<br />결석으로 변경할까요?
              </p>
              <div className="at-absent-modal-btns">
                <button className="at-absent-btn cancel" onClick={() => setPendingAbsent(null)}>취소</button>
                <button className="at-absent-btn confirm" onClick={confirmAbsentAction}>결석 처리</button>
              </div>
            </div>
          </div>
        );
      })()}

      {reservationTarget && (() => {
        const s = students.find(st => st.id === reservationTarget.studentId);
        const cls = classes.find(c => c.id === reservationTarget.classId);
        return (
          <div className="modal-overlay" onClick={() => setReservationTarget(null)}>
            <div className="modal-content" style={{ maxWidth: 'min(520px, calc(100vw - 1.5rem))' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">보강 예약</h3>
                <button type="button" className="btn-icon-only" onClick={() => setReservationTarget(null)} aria-label="닫기">
                  <X size={18} />
                </button>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                  <b>{s?.name}</b>{cls ? ` (${cls.name})` : ''} 학생의 보강 일정을 예약합니다. 출결 상태는 그대로 유지됩니다.
                </p>
                <div className="mk-grid">
                  <label>
                    <span>보강일</span>
                    <input type="date" className="gd-field" value={reservationDate} onChange={e => setReservationDate(e.target.value)} />
                  </label>
                  <label>
                    <span>시간</span>
                    <input type="time" className="gd-field" value={reservationTime} onChange={e => setReservationTime(e.target.value)} />
                  </label>
                  <label>
                    <span>사유</span>
                    <select className="gd-field" value={reservationReason} onChange={e => setReservationReason(e.target.value as MakeupReservation['reason'])}>
                      <option value="absence">결석분 보강</option>
                      <option value="supplement">추가 보충</option>
                      <option value="other">기타</option>
                    </select>
                  </label>
                  <label>
                    <span>결석일</span>
                    <input
                      type="date"
                      className="gd-field"
                      value={reservationAbsenceDate}
                      onChange={e => setReservationAbsenceDate(e.target.value)}
                      disabled={reservationReason !== 'absence'}
                    />
                  </label>
                </div>
                <label>
                  <span style={{ display: 'block', fontSize: '0.83rem', marginBottom: '0.3rem' }}>메모</span>
                  <input className="gd-field" value={reservationMemo} onChange={e => setReservationMemo(e.target.value)} placeholder="예: 독해 진도 보충" />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="pay-btn ghost" onClick={() => setReservationTarget(null)}>취소</button>
                <button type="button" className="pay-btn primary" onClick={handleSaveReservation}>예약 저장</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="at-monthly-grid">
      {/* ── 월간 출결 캘린더 ── */}
      <div className="gd-card at-calendar-card">
        <div className="gd-card-head" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="gd-card-title"><Calendar size={20} /> 월간 출결 캘린더</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input type="month" className="form-control" style={{ width: '160px', padding: '0.35rem 0.65rem' }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>날짜를 누르면 위쪽 출결 기록이 해당 날짜로 이동합니다.</p>
        <AttendanceCalendar attendance={activeAttendance} month={reportMonth} selectedDate={selectedDate} onSelectDate={handleSelectedDateChange} compact />
      </div>

      {/* ── 월간 출결 통계 ── */}
      <div className="gd-card at-monthly-stat-card">
        <div className="gd-card-head" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="gd-card-title"><Clock size={20} /> 월간 출결 통계</h3>
        </div>
        <div className="table-wrapper at-monthly-tbl">
          <table className="custom-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>학생 이름</th>
                <th className="at-col-school">학교 / 학년</th>
                <th style={{ textAlign: 'center', color: 'var(--color-success)' }}>출석</th>
                <th style={{ textAlign: 'center', color: 'var(--color-danger)' }}>결석</th>
                <th style={{ textAlign: 'center', color: 'var(--color-info)' }}>보강</th>
                <th style={{ textAlign: 'center' }}>출결률</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReport.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>등록된 재원생이 없습니다.</td></tr>
              ) : (
                monthlyReport.map(row => {
                  const attended = row.present + row.makeup + row.supplement;
                  const rate = row.total > 0 ? Math.round((attended / row.total) * 100) : 100;
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700 }}>{row.name}{row.isPaused && <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: '#92400e', fontWeight: 700 }}>휴원</span>}</td>
                      <td className="at-col-school" style={{ color: 'var(--color-text-secondary)' }}>{row.school} {row.grade.split(' ')[1] || row.grade}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-success)' }}>{row.present}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-danger)' }}>{row.absent}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-info)' }}>{row.makeup}회</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700 }}>{rate}%</span>
                        <span className="at-rate-detail" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.35rem' }}>({row.total}일 중 {attended}일)</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};
