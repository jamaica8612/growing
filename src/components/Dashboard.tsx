import React, { useState } from 'react';
import type { Student, Class, Attendance, Payment, DayOfWeek, HomeworkStatus } from '../types';
import { AlertCircle, Copy, Check, Clock, Calendar, ClipboardCheck } from 'lucide-react';
import { getSchedulesForDay } from '../lib/classSchedules';

interface DashboardProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id' | 'memo'> & { memo?: string }) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  students,
  classes,
  attendance,
  payments,
  onSaveAttendance,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Helper for the selected date's day of the week.
  const getKoreanDayOfWeek = (dateStr: string): DayOfWeek => {
    const days: DayOfWeek[] = ['일', '월', '화', '수', '목', '금', '토'];
    const date = new Date(`${dateStr}T00:00:00`);
    return days[date.getDay()];
  };

  const selectedDay = getKoreanDayOfWeek(selectedDate);

  // Active students
  const activeStudents = students.filter(s => s.status === 'active');
  // 출결 대상은 재원생만. 휴원/퇴원생은 출석 집계와 출결판에서 제외한다.
  const activeStudentIds = new Set(activeStudents.map(s => s.id));

  // Classes for the selected date.
  const selectedClasses = classes.flatMap(cls =>
    getSchedulesForDay(cls, selectedDay).map(schedule => ({ cls, schedule }))
  );

  // Payment Stats for Current Month
  const currentMonthStr = new Date().toISOString().substring(0, 7); // YYYY-MM
  const currentMonthPayments = payments.filter(p => p.billingMonth === currentMonthStr);

  const unpaidCount = currentMonthPayments.filter(p => p.status === 'unpaid').length;
  const totalUnpaid = currentMonthPayments
    .filter(p => p.status === 'unpaid')
    .reduce((sum, p) => sum + p.amount, 0);

  // Selected date attendance rate.
  const selectedAttendanceRecords = attendance.filter(a => a.date === selectedDate);
  // 선택일에 수업이 잡힌 (반, 재원생) 쌍을 집합으로 모은다. 같은 요일에 한 반이
  // 여러 시간표를 가져도 쌍은 한 번만 세고, 분자도 이 쌍에 해당하는 출결만 세어
  // 분모와 일치시킨다(다른 요일 보강 등으로 100%를 넘는 현상 방지).
  const expectedPairs = new Set<string>();
  selectedClasses.forEach(({ cls }) => {
    cls.studentIds.forEach(sid => {
      if (activeStudentIds.has(sid)) expectedPairs.add(`${cls.id}|${sid}`);
    });
  });
  const totalExpectedAttendance = expectedPairs.size;
  // ---- 오늘의 브리핑 (규칙 기반·토큰 0) ----
  // 이미 로드된 데이터로 즉석 계산해, AI 호출 없이 매 진입마다 무료로 보여준다.
  const checkedPairCount = selectedAttendanceRecords.filter(a => expectedPairs.has(`${a.classId}|${a.studentId}`)).length;
  const uncheckedCount = Math.max(totalExpectedAttendance - checkedPairCount, 0);
  const todayMakeups = selectedAttendanceRecords
    .filter(a => a.status === 'makeup' && expectedPairs.has(`${a.classId}|${a.studentId}`))
    .map(a => students.find(s => s.id === a.studentId)?.name)
    .filter((n): n is string => Boolean(n));
  // 최근 14일 결석이 잦은(2회 이상) 재원생
  const briefCutoff = (() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() - 13);
    return d.toISOString().split('T')[0];
  })();
  const absenceCount = new Map<string, number>();
  attendance.forEach(a => {
    if (a.status === 'absent' && a.date >= briefCutoff && a.date <= selectedDate && activeStudentIds.has(a.studentId)) {
      absenceCount.set(a.studentId, (absenceCount.get(a.studentId) ?? 0) + 1);
    }
  });
  const frequentAbsentees = [...absenceCount.entries()]
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({ name: students.find(s => s.id === id)?.name ?? '?', count: n }))
    .sort((a, b) => b.count - a.count);

  // List of unpaid students with details for SMS copy
  const unpaidDetails = currentMonthPayments
    .filter(p => p.status === 'unpaid')
    .map(p => {
      const student = students.find(s => s.id === p.studentId);
      const cls = classes.find(c => c.studentIds.includes(p.studentId));
      return {
        paymentId: p.id,
        studentName: student?.name || '알수없음',
        parentContact: student?.parentContact || '',
        className: cls?.name || '일반 과정',
        amount: p.amount,
      };
    })
    .filter(item => item.parentContact !== '');

  // Copy SMS Helper
  const handleCopySMS = (item: typeof unpaidDetails[0]) => {
    const message = `안녕하세요, 그로잉영어입니다. 🌱\n\n${item.studentName} 학생의 ${currentMonthStr.split('-')[1]}월 교육비(${item.amount.toLocaleString()}원) 수납 안내드립니다.\n\n바쁘시겠지만 기한 내에 확인 부탁드립니다. 감사합니다. 조은 하루 보내세요!`;
    navigator.clipboard.writeText(message).then(() => {
      setCopiedId(item.paymentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const getCurrentTimeStr = (): string =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const getRecordForSelectedDate = (studentId: string, classId: string) =>
    attendance.find(a => a.studentId === studentId && a.classId === classId && a.date === selectedDate);

  // 등원/하원 시각은 정식 필드(checkInTime/checkOutTime)에 기록한다. 한쪽만
  // 전달하면 useAcademyData가 반대쪽 값은 그대로 유지한다.
  const handleArrival = (studentId: string, classId: string) => {
    onSaveAttendance({ studentId, classId, date: selectedDate, status: 'present', checkInTime: getCurrentTimeStr() });
  };

  const handleDeparture = (studentId: string, classId: string) => {
    onSaveAttendance({ studentId, classId, date: selectedDate, status: 'present', checkOutTime: getCurrentTimeStr() });
  };

  const handleTimeChange = (
    studentId: string,
    classId: string,
    field: 'checkInTime' | 'checkOutTime',
    value: string
  ) => {
    const record = getRecordForSelectedDate(studentId, classId);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: record?.status ?? 'present',
      memo: record?.memo ?? '',
      homeworkStatus: record?.homeworkStatus ?? '',
      checkInTime: field === 'checkInTime' ? value : record?.checkInTime,
      checkOutTime: field === 'checkOutTime' ? value : record?.checkOutTime,
    });
  };

  const handleHomework = (studentId: string, classId: string, homeworkStatus: HomeworkStatus) => {
    const record = getRecordForSelectedDate(studentId, classId);
    onSaveAttendance({
      studentId,
      classId,
      date: selectedDate,
      status: record?.status ?? 'present',
      memo: record?.memo ?? '',
      homeworkStatus,
    });
  };

  return (
    <div>
      <div className="card dashboard-date-card" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
            <Calendar size={20} className="text-primary" /> 조회 날짜
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            선택한 날짜의 수업, 출결, 숙제 체크를 한 화면에서 관리합니다.
          </p>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
          <label>날짜 선택</label>
          <input
            type="date"
            className="form-control"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
          />
        </div>
      </div>

      {/* 오늘의 브리핑 (규칙 기반·AI 호출 없음) */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          borderLeft: '4px solid var(--color-primary)',
          background: 'linear-gradient(135deg, #f0f7f3, #ffffff)',
        }}
      >
        <h3 className="card-title" style={{ marginBottom: '0.6rem' }}>
          🌅 오늘의 브리핑
          <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: '0.4rem' }}>
            {selectedDay}요일 · {selectedDate}
          </span>
        </h3>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
          <li>
            오늘 수업 <strong>{selectedClasses.length}개 반</strong>
            {totalExpectedAttendance > 0 && (
              uncheckedCount > 0
                ? <> · 출결 미체크 <strong style={{ color: 'var(--color-warning)' }}>{uncheckedCount}명</strong> 남음</>
                : <> · 출결 체크 <strong style={{ color: 'var(--color-success)' }}>완료</strong> 👍</>
            )}
          </li>
          {todayMakeups.length > 0 && (
            <li>오늘 보강 <strong>{todayMakeups.length}명</strong> ({todayMakeups.join(', ')})</li>
          )}
          <li>
            이번 달 미납{' '}
            {unpaidCount > 0
              ? <><strong style={{ color: 'var(--color-danger)' }}>{unpaidCount}건</strong> ({totalUnpaid.toLocaleString()}원) — 우측 도우미에서 안내장 발송</>
              : <><strong style={{ color: 'var(--color-success)' }}>없음</strong> 👍</>}
          </li>
          {frequentAbsentees.length > 0 && (
            <li style={{ color: 'var(--color-danger)' }}>
              최근 2주 결석 잦은 학생: <strong>{frequentAbsentees.map(f => `${f.name}(${f.count}회)`).join(', ')}</strong> — 상담을 챙겨보세요
            </li>
          )}
        </ul>
      </div>

      {/* Main Grid: Selected Date Attendance & Unpaid Bills */}
      <div className="grid-container cols-2-1">
        {/* Left: Selected Date Classes & Attendance Check */}
        <div className="card">
          <h3 className="card-title dashboard-attendance-title">
            <Clock size={20} className="text-primary" />
            <span className="dashboard-title-desktop">선택일 수업 출결/숙제 체크</span>
            <span className="dashboard-title-mobile">출결/숙제 체크</span>
            <span className="dashboard-title-date">{selectedDate}</span>
          </h3>

          {selectedClasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
              🌱 {selectedDay}요일에는 예정된 정규 수업이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {selectedClasses.map(({ cls, schedule }) => {
                const activeMemberIds = cls.studentIds.filter(sid => activeStudentIds.has(sid));
                const pausedMemberCount = cls.studentIds.filter(
                  sid => students.find(s => s.id === sid)?.status === 'paused'
                ).length;
                return (
                <div key={`${cls.id}-${schedule.day}-${schedule.startTime}-${schedule.endTime}`} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.5rem' }}>
                  <div className="dashboard-class-header">
                    <div className="dashboard-class-info">
                      <span className="dashboard-class-name">{cls.name}</span>
                      <span className="dashboard-class-time">🕒 {schedule.startTime} - {schedule.endTime}</span>
                    </div>
                    <span className="badge badge-present dashboard-member-badge">
                      재원생 {activeMemberIds.length}명
                      {pausedMemberCount > 0 && ` · 휴원 ${pausedMemberCount}`}
                    </span>
                  </div>

                  {activeMemberIds.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: '0.5rem' }}>
                      {cls.studentIds.length === 0
                        ? '배정된 학생이 없습니다. [반/시간표 관리]에서 학생을 추가해 주세요.'
                        : '출결 대상인 재원생이 없습니다. (휴원/퇴원생은 제외됩니다)'}
                    </div>
                  ) : (
                    <div className="quick-att-grid">
                      {activeMemberIds.map(studentId => {
                        const student = students.find(s => s.id === studentId);
                        if (!student) return null;
                        const record = getRecordForSelectedDate(student.id, cls.id);
                        const arrivalTime = record?.checkInTime ?? null;
                        const departureTime = record?.checkOutTime ?? null;
                        const homeworkStatus = record?.homeworkStatus ?? '';

                        return (
                          <div key={student.id} className="quick-att-card">
                            <div className="quick-att-card-header">
                              <span className="quick-att-student-name">{student.name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                {student.school} {student.grade.split(' ')[1] || student.grade}
                              </span>
                            </div>
                            <div className="quick-att-buttons">
                              <button
                                className={`btn-att-select ${arrivalTime ? 'active-present' : ''}`}
                                onClick={() => handleArrival(student.id, cls.id)}
                              >
                                🌱 등원{arrivalTime ? ` ${arrivalTime}` : ''}
                              </button>
                              <button
                                className={`btn-att-select ${departureTime ? 'active-makeup' : ''}`}
                                onClick={() => handleDeparture(student.id, cls.id)}
                              >
                                🏡 하원{departureTime ? ` ${departureTime}` : ''}
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.45rem' }}>
                              <input
                                type="time"
                                className="form-control"
                                value={arrivalTime ?? ''}
                                aria-label={`${student.name} 등원 시간 수정`}
                                onChange={e => handleTimeChange(student.id, cls.id, 'checkInTime', e.target.value)}
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.45rem' }}
                              />
                              <input
                                type="time"
                                className="form-control"
                                value={departureTime ?? ''}
                                aria-label={`${student.name} 하원 시간 수정`}
                                onChange={e => handleTimeChange(student.id, cls.id, 'checkOutTime', e.target.value)}
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.45rem' }}
                              />
                            </div>
                            <div className="quick-att-buttons" style={{ marginTop: '0.45rem' }}>
                              <button
                                className={`btn-att-select ${homeworkStatus === 'done' ? 'active-present' : ''}`}
                                onClick={() => handleHomework(student.id, cls.id, 'done')}
                                title="숙제 완료로 체크"
                              >
                                <ClipboardCheck size={12} /> 완료
                              </button>
                              <button
                                className={`btn-att-select ${homeworkStatus === 'incomplete' ? 'active-late' : ''}`}
                                onClick={() => handleHomework(student.id, cls.id, 'incomplete')}
                                title="숙제 미흡으로 체크"
                              >
                                미흡
                              </button>
                              <button
                                className={`btn-att-select ${homeworkStatus === 'undone' ? 'active-absent' : ''}`}
                                onClick={() => handleHomework(student.id, cls.id, 'undone')}
                                title="숙제 안함으로 체크"
                              >
                                안함
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Unpaid Alerts & Quick SMS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title">
            <AlertCircle size={20} style={{ color: 'var(--color-danger)' }} /> 미납 안내장 발송 도우미
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
            이번 달({currentMonthStr.split('-')[1]}월) 교육비가 미납된 학부모님께 복사해서 보낼 수 있는 메시지입니다.
          </p>

          {unpaidDetails.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-success)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flexGrow: 1, justifyContent: 'center' }}>
              <Check size={32} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>이번 달 미납 내역이 없습니다!</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: '420px', flexGrow: 1 }}>
              {unpaidDetails.map(item => (
                <div
                  key={item.paymentId}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-danger-light)',
                    backgroundColor: '#fffdfd',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {item.studentName} 어머니
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                        📞 {item.parentContact}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.25rem' }}
                      onClick={() => handleCopySMS(item)}
                    >
                      {copiedId === item.paymentId ? (
                        <>
                          <Check size={12} className="text-success" /> 복사 완료
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> 알림장 복사
                        </>
                      )}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-secondary)', borderTop: '1px dashed #fee2e2', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span>{item.className}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                      {item.amount.toLocaleString()}원
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
