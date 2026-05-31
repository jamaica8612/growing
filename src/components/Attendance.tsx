import React, { useState } from 'react';
import type { Student, Class, Attendance, EditableAttendanceStatus, HomeworkStatus } from '../types';
import { Calendar, Clock, Save, MessageSquare, Send, Check, LogIn, LogOut } from 'lucide-react';
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

// 숙제 상태 → 템플릿 키 매핑. 상태가 없으면 메시지도 없음.
const HOMEWORK_TEMPLATE_KEY: Record<HomeworkStatus, keyof MessageTemplates | ''> = {
  done: 'homeworkDone',
  incomplete: 'homeworkIncomplete',
  undone: 'homeworkUndone',
  '': '',
};

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
  const [attendanceMemos, setAttendanceMemos] = useState<{ [key: string]: string }>({});
  const [makeupForDates, setMakeupForDates] = useState<{ [key: string]: string }>({});
  const [copiedStatusKey, setCopiedStatusKey] = useState<string | null>(null);

  // Compile Homework Message from owner-editable templates.
  const getHomeworkMessage = (studentName: string, status: HomeworkStatus): string => {
    const key = HOMEWORK_TEMPLATE_KEY[status];
    if (!key) return '';
    return renderTemplate(messageTemplates[key], { 학생명: studentName });
  };

  // Copy Homework status notification for KakaoTalk
  const handleCopyHomeworkMessage = (studentName: string, status: HomeworkStatus, key: string) => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg) return;
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedStatusKey(key);
      setTimeout(() => setCopiedStatusKey(null), 2000);
    });
  };

  // Open SMS client directly for mobile
  const getSMSLink = (parentContact: string, studentName: string, status: HomeworkStatus): string => {
    const msg = getHomeworkMessage(studentName, status);
    if (!msg || !parentContact) return '#';
    const cleanPhone = parentContact.replace(/[^0-9]/g, '');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encodedBody = encodeURIComponent(msg);
    return isIOS ? `sms:${cleanPhone}&body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;
  };

  // Handle homework update
  const handleHomeworkChange = (studentId: string, classId: string, homeworkStatus: HomeworkStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const status = record?.status || 'present'; // Default to present if homework is checked
    const memo = record?.memo || '';
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status,
      memo,
      homeworkStatus,
    });
  };
  
  // Month filter for monthly report (defaults to current month YYYY-MM)
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));

  // Find attendance record for a student on a specific date for a class
  const getAttendanceRecord = (studentId: string, classId: string, date: string): Attendance | undefined => {
    return attendance.find(
      a => a.studentId === studentId && a.classId === classId && a.date === date
    );
  };

  const todayDateStr = new Date().toISOString().split('T')[0];

  const getCurrentTimeStr = (): string =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const handleArrival = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: 'present',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '',
      checkInTime: getCurrentTimeStr(),
    });
  };

  const handleDeparture = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: record?.status ?? 'present',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '',
      checkOutTime: getCurrentTimeStr(),
    });
  };

  const handleTimeChange = (
    studentId: string,
    classId: string,
    field: 'checkInTime' | 'checkOutTime',
    value: string
  ) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: record?.status ?? 'present',
      memo: attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '',
      checkInTime: field === 'checkInTime' ? value : record?.checkInTime,
      checkOutTime: field === 'checkOutTime' ? value : record?.checkOutTime,
    });
  };

  // Handle status update
  const handleStatusChange = (studentId: string, classId: string, status: EditableAttendanceStatus) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const currentMemo =
      attendanceMemos[`${studentId}-${classId}`] ??
      record?.memo ??
      '';
    const shouldStampCheckIn =
      selectedDate === todayDateStr && status === 'present' && !record?.checkInTime;
    const makeupForDate = status === 'makeup'
      ? (makeupForDates[`${studentId}-${classId}`] ?? record?.makeupForDate ?? '')
      : undefined;
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status,
      memo: currentMemo,
      makeupForDate: makeupForDate || undefined,
      ...(shouldStampCheckIn ? { checkInTime: getCurrentTimeStr() } : {}),
    });
  };

  const handleMakeupForDateChange = (studentId: string, classId: string, date: string) => {
    setMakeupForDates(prev => ({ ...prev, [`${studentId}-${classId}`]: date }));
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    if (record?.status === 'makeup') {
      onSaveAttendance({
        studentId,
        classId,
        date: selectedDate,
        status: 'makeup',
        memo: record.memo,
        makeupForDate: date || undefined,
      });
    }
  };

  const handleQueueHomeworkAlert = (studentId: string, status: HomeworkStatus) => {
    if (!status) return;
    onQueueHomeworkAlert?.(studentId, selectedDate, status);
  };

  // Handle memo input change
  const handleMemoChange = (studentId: string, classId: string, memo: string) => {
    setAttendanceMemos(prev => ({
      ...prev,
      [`${studentId}-${classId}`]: memo,
    }));
  };

  // Save memo manually
  const handleSaveMemo = (studentId: string, classId: string) => {
    const record = getAttendanceRecord(studentId, classId, selectedDate);
    const memoText = attendanceMemos[`${studentId}-${classId}`] ?? record?.memo ?? '';
    
    if (record) {
      onSaveAttendance({
        studentId,
        classId,
        date: selectedDate,
        status: record.status,
        memo: memoText,
      });
      alert('비고 메모가 저장되었습니다.');
    } else {
      alert('먼저 출석 상태(출석, 결석 등)를 선택해 주세요.');
    }
  };

  // Filter students belonging to the selected class
  const getTargetStudents = (): { student: Student; class: Class }[] => {
    const list: { student: Student; class: Class }[] = [];
    
    classes.forEach(cls => {
      if (selectedClassId === 'all' || cls.id === selectedClassId) {
        cls.studentIds.forEach(sid => {
          const student = students.find(s => s.id === sid);
          if (student && student.status === 'active') {
            list.push({ student, class: cls });
          }
        });
      }
    });

    return list;
  };

  const targetList = getTargetStudents();

  // Monthly Report Calculations
  const getMonthlyReportData = () => {
    const reportData: {
      [studentId: string]: {
        id: string;
        name: string;
        school: string;
        grade: string;
        isPaused: boolean;
        present: number;
        absent: number;
        makeup: number;
        total: number;
      };
    } = {};

    // 재원생 + 휴원생을 포함한다(퇴원생만 제외). 같은 달 중간에 휴원으로 바뀐
    // 학생의 그달 출결 기록이 리포트에서 사라지지 않도록 보존한다.
    students.filter(s => s.status !== 'inactive').forEach(s => {
      reportData[s.id] = {
        id: s.id,
        name: s.name,
        school: s.school,
        grade: s.grade,
        isPaused: s.status === 'paused',
        present: 0,
        absent: 0,
        makeup: 0,
        total: 0,
      };
    });

    // Filter attendance by selected month
    attendance
      .filter(a => a.date.startsWith(reportMonth))
      .forEach(a => {
        if (reportData[a.studentId]) {
          reportData[a.studentId][normalizeAttendanceStatus(a.status)]++;
          reportData[a.studentId].total++;
        }
      });

    return Object.values(reportData);
  };

  const monthlyReport = getMonthlyReportData();

  // 달력 집계도 재원생 기준으로 통일(휴원/퇴원생 잔존 기록 제외).
  const activeStudentIds = new Set(students.filter(s => s.status === 'active').map(s => s.id));
  const activeAttendance = attendance.filter(a => activeStudentIds.has(a.studentId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Attendance Check Board */}
      <div className="card">
        <h3 className="card-title">
          <Calendar size={20} className="text-primary" /> 일자별 출결 기록
        </h3>

        {/* Date and Class Selector Header */}
        <div className="filter-bar" style={{ backgroundColor: '#fafbfc', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>출결 기준 날짜</label>
              <input
                type="date"
                className="form-control"
                style={{ width: '180px' }}
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>반 필터</label>
              <select
                className="form-control"
                style={{ width: '220px' }}
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
              >
                <option value="all">전체 반</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
            💡 상태 버튼을 누르면 즉시 자동 저장됩니다.
          </div>
        </div>

        {/* Attendance Sheet */}
        <div className="table-wrapper attendance-desktop-table">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>이름</th>
                <th style={{ width: '150px' }}>반 / 학교 / 학년</th>
                <th style={{ width: '290px' }}>출결 체크</th>
                <th style={{ width: '180px' }}>숙제 체크</th>
                <th style={{ width: '120px', textAlign: 'center' }}>학부모 알림</th>
                <th>비고 (메모 입력)</th>
                <th style={{ width: '50px', textAlign: 'center' }}>저장</th>
              </tr>
            </thead>
            <tbody>
              {targetList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
                    🌱 이 조건으로 활성화된 원생이 없습니다. [반/시간표 관리]에서 수강 학생을 지정해 주세요.
                  </td>
                </tr>
              ) : (
                targetList.map(({ student, class: cls }) => {
                  const record = getAttendanceRecord(student.id, cls.id, selectedDate);
                  const currentStatus = record ? normalizeAttendanceStatus(record.status) : undefined;
                  const currentHomework = record?.homeworkStatus || '';
                  const memoKey = `${student.id}-${cls.id}`;

                  return (
                    <tr key={`${student.id}-${cls.id}`}>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{student.name}</td>
                      <td style={{ fontSize: '0.8rem', lineHeight: '1.35' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{cls.name}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                          {student.school || '교습소'} • {student.grade.split(' ')[1] || student.grade}
                        </div>
                      </td>
                      <td>
                        {(record?.checkInTime || record?.checkOutTime) && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem', display: 'flex', gap: '0.5rem' }}>
                            {record?.checkInTime && <span>🌱 등원 {record.checkInTime}</span>}
                            {record?.checkOutTime && <span>🏡 하원 {record.checkOutTime}</span>}
                          </div>
                        )}
                        <div className="quick-att-buttons" style={{ marginBottom: '0.4rem' }}>
                          <button
                            className={`btn-att-select ${record?.checkInTime ? 'active-present' : ''}`}
                            onClick={() => handleArrival(student.id, cls.id)}
                            title="현재 시각으로 등원 시간을 기록합니다"
                          >
                            <LogIn size={12} /> 등원{record?.checkInTime ? ` ${record.checkInTime}` : ''}
                          </button>
                          <button
                            className={`btn-att-select ${record?.checkOutTime ? 'active-makeup' : ''}`}
                            onClick={() => handleDeparture(student.id, cls.id)}
                            title="현재 시각으로 하원 시간을 기록합니다"
                          >
                            <LogOut size={12} /> 하원{record?.checkOutTime ? ` ${record.checkOutTime}` : ''}
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.4rem' }}>
                          <input
                            type="time"
                            className="form-control"
                            value={record?.checkInTime ?? ''}
                            aria-label={`${student.name} 등원 시간 수정`}
                            onChange={e => handleTimeChange(student.id, cls.id, 'checkInTime', e.target.value)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.45rem' }}
                          />
                          <input
                            type="time"
                            className="form-control"
                            value={record?.checkOutTime ?? ''}
                            aria-label={`${student.name} 하원 시간 수정`}
                            onChange={e => handleTimeChange(student.id, cls.id, 'checkOutTime', e.target.value)}
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.45rem' }}
                          />
                        </div>
                        <div className="quick-att-buttons">
                          <button
                            className={`btn-att-select ${currentStatus === 'present' ? 'active-present' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'present')}
                          >
                            출석
                          </button>
                          <button
                            className={`btn-att-select ${currentStatus === 'absent' ? 'active-absent' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'absent')}
                          >
                            결석
                          </button>
                          <button
                            className={`btn-att-select ${currentStatus === 'makeup' ? 'active-makeup' : ''}`}
                            onClick={() => handleStatusChange(student.id, cls.id, 'makeup')}
                          >
                            보강
                          </button>
                        </div>
                        {currentStatus === 'makeup' && (
                          <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                            <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>결석일:</span>
                            <input
                              type="date"
                              className="form-control"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: '140px' }}
                              value={makeupForDates[`${student.id}-${cls.id}`] ?? record?.makeupForDate ?? ''}
                              onChange={e => handleMakeupForDateChange(student.id, cls.id, e.target.value)}
                              title="이 보강이 대체하는 원래 결석 날짜"
                            />
                          </div>
                        )}
                        {currentStatus === 'absent' && (() => {
                          const linkedMakeup = attendance.find(
                            a => a.studentId === student.id && a.classId === cls.id &&
                                 a.status === 'makeup' && a.makeupForDate === record?.date
                          );
                          return linkedMakeup ? (
                            <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--color-success)' }}>
                              보강 완료 ({linkedMakeup.date})
                            </div>
                          ) : null;
                        })()}
                      </td>
                      <td>
                        <div className="quick-att-buttons">
                          <button
                            className={`btn-att-select ${currentHomework === 'done' ? 'active-present' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'done')}
                          >
                            완료
                          </button>
                          <button
                            className={`btn-att-select ${currentHomework === 'incomplete' ? 'active-late' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'incomplete')}
                          >
                            미흡
                          </button>
                          <button
                            className={`btn-att-select ${currentHomework === 'undone' ? 'active-absent' : ''}`}
                            onClick={() => handleHomeworkChange(student.id, cls.id, 'undone')}
                          >
                            안함
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {currentHomework ? (
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', minWidth: 'auto', margin: 0, display: 'inline-flex', alignItems: 'center' }}
                              onClick={() => handleCopyHomeworkMessage(student.name, currentHomework, memoKey)}
                              title="카톡 메시지 본문 복사"
                            >
                              {copiedStatusKey === memoKey ? (
                                <Check size={12} className="text-success" />
                              ) : (
                                <MessageSquare size={12} className="text-secondary" />
                              )}
                              카톡
                            </button>
                            {onQueueHomeworkAlert && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', minWidth: 'auto', margin: 0, display: 'inline-flex', alignItems: 'center' }}
                                onClick={() => handleQueueHomeworkAlert(student.id, currentHomework)}
                                title="숙제 안내문을 알림장 대기열에 추가"
                              >
                                <MessageSquare size={12} className="text-secondary" />
                                알림장
                              </button>
                            )}
                            {student.parentContact ? (
                              <a
                                href={getSMSLink(student.parentContact, student.name, currentHomework)}
                                className="btn btn-primary"
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minWidth: 'auto', margin: 0 }}
                                title="학부모에게 문자(SMS) 즉시 전송"
                              >
                                <Send size={12} />
                                문자
                              </a>
                            ) : (
                              <button
                                className="btn btn-primary"
                                disabled
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: '0.2rem', opacity: 0.5, minWidth: 'auto', margin: 0, display: 'inline-flex', alignItems: 'center' }}
                                title="연락처 없음"
                              >
                                <Send size={12} />
                                문자
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>체크 대기</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                          placeholder="특이사항 메모 입력 (예: 감기 조퇴...)"
                          value={attendanceMemos[memoKey] ?? record?.memo ?? ''}
                          onChange={e => handleMemoChange(student.id, cls.id, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon-only"
                          title="메모 저장"
                          onClick={() => handleSaveMemo(student.id, cls.id)}
                        >
                          <Save size={16} className="text-primary" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="attendance-mobile-list">
          {targetList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-secondary)' }}>
              🌱 이 조건으로 활성화된 원생이 없습니다. [반/시간표 관리]에서 수강 학생을 지정해 주세요.
            </div>
          ) : (
            targetList.map(({ student, class: cls }) => {
              const record = getAttendanceRecord(student.id, cls.id, selectedDate);
              const currentStatus = record ? normalizeAttendanceStatus(record.status) : undefined;
              const currentHomework = record?.homeworkStatus || '';
              const memoKey = `${student.id}-${cls.id}`;

              return (
                <div key={`${student.id}-${cls.id}-mobile`} className="attendance-mobile-card">
                  <div className="attendance-mobile-card-header">
                    <div>
                      <strong>{student.name}</strong>
                      <div>{cls.name}</div>
                      <span>{student.school || '교습소'} • {student.grade.split(' ')[1] || student.grade}</span>
                    </div>
                    {(record?.checkInTime || record?.checkOutTime) && (
                      <div className="attendance-mobile-times">
                        {record?.checkInTime && <span>등원 {record.checkInTime}</span>}
                        {record?.checkOutTime && <span>하원 {record.checkOutTime}</span>}
                      </div>
                    )}
                  </div>

                  <div className="attendance-mobile-section">
                    <div className="attendance-mobile-label">등하원</div>
                    <div className="quick-att-buttons">
                      <button
                        className={`btn-att-select ${record?.checkInTime ? 'active-present' : ''}`}
                        onClick={() => handleArrival(student.id, cls.id)}
                      >
                        <LogIn size={12} /> 등원{record?.checkInTime ? ` ${record.checkInTime}` : ''}
                      </button>
                      <button
                        className={`btn-att-select ${record?.checkOutTime ? 'active-makeup' : ''}`}
                        onClick={() => handleDeparture(student.id, cls.id)}
                      >
                        <LogOut size={12} /> 하원{record?.checkOutTime ? ` ${record.checkOutTime}` : ''}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.5rem' }}>
                      <input
                        type="time"
                        className="form-control"
                        value={record?.checkInTime ?? ''}
                        aria-label={`${student.name} 등원 시간 수정`}
                        onChange={e => handleTimeChange(student.id, cls.id, 'checkInTime', e.target.value)}
                      />
                      <input
                        type="time"
                        className="form-control"
                        value={record?.checkOutTime ?? ''}
                        aria-label={`${student.name} 하원 시간 수정`}
                        onChange={e => handleTimeChange(student.id, cls.id, 'checkOutTime', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="attendance-mobile-section">
                    <div className="attendance-mobile-label">출결</div>
                    <div className="quick-att-buttons">
                      <button className={`btn-att-select ${currentStatus === 'present' ? 'active-present' : ''}`} onClick={() => handleStatusChange(student.id, cls.id, 'present')}>출석</button>
                      <button className={`btn-att-select ${currentStatus === 'absent' ? 'active-absent' : ''}`} onClick={() => handleStatusChange(student.id, cls.id, 'absent')}>결석</button>
                      <button className={`btn-att-select ${currentStatus === 'makeup' ? 'active-makeup' : ''}`} onClick={() => handleStatusChange(student.id, cls.id, 'makeup')}>보강</button>
                    </div>
                  </div>

                  <div className="attendance-mobile-section">
                    <div className="attendance-mobile-label">숙제</div>
                    <div className="quick-att-buttons">
                      <button className={`btn-att-select ${currentHomework === 'done' ? 'active-present' : ''}`} onClick={() => handleHomeworkChange(student.id, cls.id, 'done')}>완료</button>
                      <button className={`btn-att-select ${currentHomework === 'incomplete' ? 'active-late' : ''}`} onClick={() => handleHomeworkChange(student.id, cls.id, 'incomplete')}>미흡</button>
                      <button className={`btn-att-select ${currentHomework === 'undone' ? 'active-absent' : ''}`} onClick={() => handleHomeworkChange(student.id, cls.id, 'undone')}>안함</button>
                    </div>
                  </div>

                  {currentHomework && (
                    <div className="attendance-mobile-section">
                      <div className="attendance-mobile-label">알림</div>
                      <div className="quick-att-buttons">
                        <button className="btn btn-secondary attendance-mobile-action" onClick={() => handleCopyHomeworkMessage(student.name, currentHomework, memoKey)}>
                          {copiedStatusKey === memoKey ? <><Check size={12} className="text-success" /> 복사됨</> : <><MessageSquare size={12} /> 카톡</>}
                        </button>
                        {onQueueHomeworkAlert && (
                          <button className="btn btn-secondary attendance-mobile-action" onClick={() => handleQueueHomeworkAlert(student.id, currentHomework)}>
                            <MessageSquare size={12} /> 알림장
                          </button>
                        )}
                        {student.parentContact && (
                          <a className="btn btn-primary attendance-mobile-action" href={getSMSLink(student.parentContact, student.name, currentHomework)}>
                            <Send size={12} /> 문자
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="attendance-mobile-section">
                    <div className="attendance-mobile-label">메모</div>
                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.6rem' }}
                        placeholder="특이사항 메모"
                        value={attendanceMemos[memoKey] ?? record?.memo ?? ''}
                        onChange={e => handleMemoChange(student.id, cls.id, e.target.value)}
                      />
                      <button className="btn-icon-only" title="메모 저장" onClick={() => handleSaveMemo(student.id, cls.id)}>
                        <Save size={16} className="text-primary" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Monthly Calendar View */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>
            <Calendar size={20} className="text-primary" /> 월간 출결 캘린더
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input
              type="month"
              className="form-control"
              style={{ width: '160px', padding: '0.35rem 0.65rem' }}
              value={reportMonth}
              onChange={e => setReportMonth(e.target.value)}
            />
          </div>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          날짜를 누르면 위쪽 [일자별 출결 기록]이 해당 날짜로 이동합니다.
        </p>
        <AttendanceCalendar
          attendance={activeAttendance}
          month={reportMonth}
          selectedDate={selectedDate}
          onSelectDate={date => setSelectedDate(date)}
        />
      </div>

      {/* Monthly Attendance Report Sheet */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: 0 }}>
            <Clock size={20} className="text-primary" /> 월간 출결 통계 및 리포트
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>조회 연월:</span>
            <input
              type="month"
              className="form-control"
              style={{ width: '160px', padding: '0.35rem 0.65rem' }}
              value={reportMonth}
              onChange={e => setReportMonth(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="custom-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>학생 이름</th>
                <th>학교 / 학년</th>
                <th style={{ textAlign: 'center', color: 'var(--color-success)' }}>출석</th>
                <th style={{ textAlign: 'center', color: 'var(--color-danger)' }}>결석</th>
                <th style={{ textAlign: 'center', color: 'var(--color-info)' }}>보강</th>
                <th style={{ textAlign: 'center', fontWeight: 700 }}>출결 진행률</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReport.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    등록된 재원생이 없습니다.
                  </td>
                </tr>
              ) : (
                monthlyReport.map(row => {
                  const attended = row.present + row.makeup;
                  const rate = row.total > 0 ? Math.round((attended / row.total) * 100) : 100;
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700 }}>
                        {row.name}
                        {row.isPaused && (
                          <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: '#92400e', fontWeight: 700 }}>휴원</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{row.school} {row.grade.split(' ')[1] || row.grade}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-success)' }}>{row.present}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-danger)' }}>{row.absent}회</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-info)' }}>{row.makeup}회</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                          <span style={{ fontWeight: 700 }}>{rate}%</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({row.total}일 중 {attended}일)</span>
                        </div>
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
  );
};
