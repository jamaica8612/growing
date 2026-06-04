import React, { useState, useMemo } from 'react';
import type { Student, Class, Attendance, EditableAttendanceStatus, HomeworkStatus } from '../types';
import { Calendar, Check, Clock, MessageSquare, Send } from 'lucide-react';
import { type MessageTemplates, renderTemplate } from '../lib/messageTemplates';
import { AttendanceCalendar } from './AttendanceCalendar';
import { normalizeAttendanceStatus } from '../lib/attendanceStatus';

interface AttendanceProps {
  attendance: Attendance[];
  students: Student[];
  classes: Class[];
  messageTemplates: MessageTemplates;
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'> & { memo?: string }) => void;
  onQueueHomeworkAlert?: (studentId: string, date: string, homeworkStatus: Exclude<HomeworkStatus, ''>) => void;
}

const HOMEWORK_TEMPLATE_KEY: Record<HomeworkStatus, keyof MessageTemplates | ''> = {
  done: 'homeworkDone',
  incomplete: 'homeworkIncomplete',
  undone: 'homeworkUndone',
  '': '',
};

const ATTENDANCE_STATUS_OPTIONS: { value: EditableAttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: '출석', tone: 'ok' },
  { value: 'absent', label: '결석', tone: 'danger' },
  { value: 'makeup', label: '보강', tone: 'info' },
  { value: 'supplement', label: '보충', tone: 'warn' },
];

const SUPPLEMENT_TIME_OPTIONS = Array.from({ length: 18 * 6 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 10;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

export const AttendanceManager: React.FC<AttendanceProps> = ({
  attendance,
  students,
  classes,
  messageTemplates,
  onSaveAttendance,
  onQueueHomeworkAlert,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [attendanceMemos, setAttendanceMemos] = useState<Record<string, string>>({});
  const [makeupForDates, setMakeupForDates] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));

  const activeStudentIds = useMemo(() => new Set(students.filter(s => s.status === 'active').map(s => s.id)), [students]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const getHomeworkMessage = (studentName: string, status: HomeworkStatus): string => {
    const key = HOMEWORK_TEMPLATE_KEY[status];
    if (!key) return '';
    return renderTemplate(messageTemplates[key], { 학생명: studentName });
  };

  const handleCopyHomeworkMessage = (studentName: string, status: HomeworkStatus, key: string) => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg) return;
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedKey(key);
      showToast(`${studentName} 학부모 안내 메시지를 복사했어요`);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  };

  const getSMSLink = (parentContact: string, studentName: string, status: HomeworkStatus): string => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg || !parentContact) return '#';
    const cleanPhone = parentContact.replace(/[^0-9]/g, '');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encodedBody = encodeURIComponent(msg);
    return isIOS ? `sms:${cleanPhone}&body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;
  };

  const getAttendanceRecord = (studentId: string, classId: string, date: string) =>
    attendance.find(a => a.studentId === studentId && a.classId === classId && a.date === date);

  const todayDateStr = new Date().toISOString().split('T')[0];

  const getCurrentTimeStr = (): string =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const getCurrentTenMinuteTimeStr = (): string => {
    const now = new Date();
    const roundedMinutes = Math.round(now.getMinutes() / 10) * 10;
    now.setMinutes(roundedMinutes, 0, 0);
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

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
    const currentMemo = attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '';
    const shouldStampCheckIn = selectedDate === todayDateStr && status === 'present' && !record?.checkInTime;
    const makeupForDate = status === 'makeup' ? (makeupForDates[`${studentId}-${classId}`] ?? record?.makeupForDate ?? '') : undefined;
    const checkInTime =
      status === 'absent'
        ? ''
        : status === 'supplement'
          ? (record?.checkInTime || getCurrentTenMinuteTimeStr())
          : shouldStampCheckIn
            ? getCurrentTimeStr()
            : undefined;
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status,
      memo: currentMemo,
      makeupForDate: makeupForDate || undefined,
      ...(checkInTime !== undefined ? { checkInTime } : {}),
    });
  };

  const handleSupplementTimeChange = (studentId: string, classId: string, time: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: 'supplement',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '',
      checkInTime: time,
    });
  };

  const handleHomeworkChange = (studentId: string, classId: string, homeworkStatus: HomeworkStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({ studentId, classId, date: selectedDate, status: record?.status || 'present', memo: record?.memo || '', homeworkStatus });
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

  const handleQueueHomeworkAlert = (studentId: string, status: HomeworkStatus) => {
    if (!status) return;
    onQueueHomeworkAlert?.(studentId, selectedDate, status);
  };

  // 표시 대상 반 목록 (selectedClassId 필터)
  const targetClasses = classes.filter(cls =>
    selectedClassId === 'all' || cls.id === selectedClassId
  );

  // 일자 요약
  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, makeup: 0, supplement: 0, unchecked: 0 };
    targetClasses.forEach(cls => {
      cls.studentIds.filter(id => activeStudentIds.has(id)).forEach(id => {
        const r = getAttendanceRecord(id, cls.id, selectedDate);
        if (!r || (!r.checkInTime && r.status !== 'absent' && r.status !== 'makeup' && r.status !== 'supplement')) s.unchecked++;
        else if (r.status === 'absent') s.absent++;
        else if (r.status === 'makeup') s.makeup++;
        else if (r.status === 'supplement') s.supplement++;
        else if (r.status === 'late') s.late++;
        else s.present++;
      });
    });
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, selectedDate, targetClasses, activeStudentIds]);

  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
  const d = new Date(`${selectedDate}T00:00:00`);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
  const selectedDay = WEEKDAY_KO[d.getDay()];

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── 필터 바 ── */}
      <div className="at-filterbar">
        <div className="at-filter-left">
          <label className="at-datepick">
            <span>출결 기준일</span>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="gd-dateinput" style={{ border: '1px solid var(--color-border)' }} />
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
          const activeMembers = cls.studentIds.filter(id => activeStudentIds.has(id));
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
                    <span>학부모 알림</span>
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
                            <button className={`gd-io ${record?.checkInTime ? 'on-in' : ''}`} onClick={() => handleArrival(studentId, cls.id)}>
                              <span className="gd-io-lbl">🌱 등원</span>
                              <span className="gd-io-t">{record?.checkInTime || '—'}</span>
                            </button>
                            <button className={`gd-io ${record?.checkOutTime ? 'on-out' : ''}`} onClick={() => handleDeparture(studentId, cls.id)}>
                              <span className="gd-io-lbl">🏡 하원</span>
                              <span className="gd-io-t">{record?.checkOutTime || '—'}</span>
                            </button>
                          </div>

                          {/* 출결 세그먼트 */}
                          <div className="at-cell">
                            <span className="at-clabel">출결</span>
                            <div className="gd-seg at-seg">
                              {ATTENDANCE_STATUS_OPTIONS.map(option => (
                                <button key={option.value} className={`gd-seg-b ${currentStatus === option.value ? 'sel ' + option.tone : ''}`} onClick={() => handleStatusChange(studentId, cls.id, option.value)}>
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            {currentStatus === 'supplement' && (
                              <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.73rem' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>보충 시간</span>
                                <select
                                  className="form-control"
                                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: '96px' }}
                                  value={record?.checkInTime || ''}
                                  onChange={e => handleSupplementTimeChange(studentId, cls.id, e.target.value)}
                                >
                                  <option value="">시간 선택</option>
                                  {SUPPLEMENT_TIME_OPTIONS.map(time => (
                                    <option key={time} value={time}>{time}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {currentStatus === 'makeup' && (() => {
                              const linkedDate = makeupForDates[`${studentId}-${cls.id}`] ?? record?.makeupForDate ?? '';
                              const hasAbsence = !!linkedDate && attendance.some(a => a.studentId === studentId && a.date === linkedDate && a.status === 'absent');
                              return (
                                <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.73rem' }}>
                                  <span style={{ color: 'var(--color-text-muted)' }}>결석일:</span>
                                  <input type="date" className="form-control" style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: '130px' }} value={linkedDate} onChange={e => handleMakeupForDateChange(studentId, cls.id, e.target.value)} />
                                  {linkedDate && <span style={{ color: hasAbsence ? 'var(--color-accent-mint)' : 'var(--color-warning)' }}>{hasAbsence ? '✓ 연결됨' : '⚠ 결석 없음'}</span>}
                                </div>
                              );
                            })()}
                            {currentStatus === 'absent' && (() => {
                              const linked = attendance.find(a => a.studentId === studentId && a.classId === cls.id && a.status === 'makeup' && a.makeupForDate === record?.date);
                              return linked ? <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--color-accent-mint)' }}>보강 완료 ({linked.date})</div> : null;
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

                          {/* 알림 */}
                          <div className="at-cell at-actions">
                            <span className="at-clabel">알림</span>
                            {hw ? (
                              <>
                                <button className={`at-act ${copiedKey === memoKey ? 'done' : ''}`} onClick={() => handleCopyHomeworkMessage(student.name, hw as HomeworkStatus, memoKey)} title="카톡 메시지 복사">
                                  {copiedKey === memoKey ? <><Check size={12} /> 복사됨</> : <><MessageSquare size={12} /> 카톡</>}
                                </button>
                                {onQueueHomeworkAlert && (
                                  <button className="at-act" onClick={() => handleQueueHomeworkAlert(studentId, hw as HomeworkStatus)} title="알림장 대기열 추가">
                                    <MessageSquare size={12} /> 알림장
                                  </button>
                                )}
                                {student.parentContact ? (
                                  <a href={getSMSLink(student.parentContact, student.name, hw as HomeworkStatus)} className="at-act primary" style={{ textDecoration: 'none' }}>
                                    <Send size={12} /> 문자
                                  </a>
                                ) : (
                                  <button className="at-act primary" disabled><Send size={12} /> 문자</button>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>숙제 체크 후 활성화</span>
                            )}
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

      {/* ── 월간 출결 캘린더 ── */}
      <div className="gd-card">
        <div className="gd-card-head" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="gd-card-title"><Calendar size={20} /> 월간 출결 캘린더</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input type="month" className="form-control" style={{ width: '160px', padding: '0.35rem 0.65rem' }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>날짜를 누르면 위쪽 출결 기록이 해당 날짜로 이동합니다.</p>
        <AttendanceCalendar attendance={activeAttendance} month={reportMonth} selectedDate={selectedDate} onSelectDate={date => setSelectedDate(date)} />
      </div>

      {/* ── 월간 출결 통계 ── */}
      <div className="gd-card">
        <div className="gd-card-head" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="gd-card-title"><Clock size={20} /> 월간 출결 통계</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input type="month" className="form-control" style={{ width: '160px', padding: '0.35rem 0.65rem' }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
          </div>
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

      {toast && <div className="gd-toast"><Check size={15} /> {toast}</div>}
    </div>
  );
};
