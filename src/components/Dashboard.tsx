import React, { useState } from 'react';
import type { Student, Class, Attendance, Payment, DayOfWeek } from '../types';
import { Users, BookOpen, CreditCard, AlertCircle, Copy, Check, Clock, Calendar } from 'lucide-react';

interface DashboardProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id'>) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  students,
  classes,
  attendance,
  payments,
  onSaveAttendance,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Helper for today's day of the week
  const getKoreanDayOfWeek = (): DayOfWeek => {
    const days: DayOfWeek[] = ['일', '월', '화', '수', '목', '금', '토'];
    const today = new Date();
    return days[today.getDay()];
  };

  const todayDay = getKoreanDayOfWeek();
  const todayDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Active students
  const activeStudents = students.filter(s => s.status === 'active');
  const activeCount = activeStudents.length;

  // Today's classes
  const todayClasses = classes.filter(c => c.days.includes(todayDay));

  // Payment Stats for Current Month
  const currentMonthStr = new Date().toISOString().substring(0, 7); // YYYY-MM
  const currentMonthPayments = payments.filter(p => p.billingMonth === currentMonthStr);

  const unpaidCount = currentMonthPayments.filter(p => p.status === 'unpaid').length;
  const totalUnpaid = currentMonthPayments
    .filter(p => p.status === 'unpaid')
    .reduce((sum, p) => sum + p.amount, 0);

  // Today's Attendance Rate
  const todayAttendanceRecords = attendance.filter(a => a.date === todayDateStr);
  const totalExpectedAttendance = todayClasses.reduce((sum, c) => sum + c.studentIds.length, 0);
  const presentOrLateCount = todayAttendanceRecords.filter(
    a => a.status === 'present' || a.status === 'late'
  ).length;

  const attendanceRate = totalExpectedAttendance > 0 
    ? Math.round((presentOrLateCount / totalExpectedAttendance) * 100) 
    : 100;

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

  const getRecordForToday = (studentId: string, classId: string) =>
    attendance.find(a => a.studentId === studentId && a.classId === classId && a.date === todayDateStr);

  const parseTimes = (memo: string) => {
    const arr = memo.match(/등원:\s*(\d{2}:\d{2})/);
    const dep = memo.match(/하원:\s*(\d{2}:\d{2})/);
    return { arrivalTime: arr?.[1] ?? null, departureTime: dep?.[1] ?? null };
  };

  const handleArrival = (studentId: string, classId: string) => {
    const now = getCurrentTimeStr();
    const existing = getRecordForToday(studentId, classId);
    const { departureTime } = existing ? parseTimes(existing.memo) : { departureTime: null };
    const memo = departureTime ? `등원: ${now} / 하원: ${departureTime}` : `등원: ${now}`;
    onSaveAttendance({ studentId, classId, date: todayDateStr, status: 'present', memo });
  };

  const handleDeparture = (studentId: string, classId: string) => {
    const now = getCurrentTimeStr();
    const existing = getRecordForToday(studentId, classId);
    const { arrivalTime } = existing ? parseTimes(existing.memo) : { arrivalTime: null };
    const memo = arrivalTime ? `등원: ${arrivalTime} / 하원: ${now}` : `하원: ${now}`;
    onSaveAttendance({ studentId, classId, date: todayDateStr, status: 'present', memo });
  };

  return (
    <div>
      {/* Metrics Row */}
      <div className="grid-container cols-4" style={{ marginBottom: '2rem' }}>
        <div className="card metric-card">
          <div className="metric-info">
            <h4>재원생 수</h4>
            <div className="metric-value">{activeCount}명</div>
            <div className="metric-sub">총 등록 학생: {students.length}명</div>
          </div>
          <div className="metric-icon-wrapper">
            <Users size={24} />
          </div>
        </div>

        <div className="card metric-card accent-mint">
          <div className="metric-info">
            <h4>오늘의 수업</h4>
            <div className="metric-value">{todayClasses.length}개 반</div>
            <div className="metric-sub">요일: {todayDay}요일</div>
          </div>
          <div className="metric-icon-wrapper">
            <BookOpen size={24} />
          </div>
        </div>

        <div className="card metric-card accent-sage">
          <div className="metric-info">
            <h4>오늘 등원율</h4>
            <div className="metric-value">{attendanceRate}%</div>
            <div className="metric-sub">
              {presentOrLateCount} / {totalExpectedAttendance} 명 등원 완료
            </div>
          </div>
          <div className="metric-icon-wrapper">
            <Calendar size={24} />
          </div>
        </div>

        <div className="card metric-card danger">
          <div className="metric-info">
            <h4>미납 교육비</h4>
            <div className="metric-value">{unpaidCount}건</div>
            <div className="metric-sub">{totalUnpaid.toLocaleString()}원 미납 상태</div>
          </div>
          <div className="metric-icon-wrapper">
            <CreditCard size={24} />
          </div>
        </div>
      </div>

      {/* Main Grid: Today's Attendance & Unpaid Bills */}
      <div className="grid-container cols-2-1">
        {/* Left: Today's Classes & Attendance Check */}
        <div className="card">
          <h3 className="card-title">
            <Clock size={20} className="text-primary" /> 오늘 수업 출결 체크 ({todayDateStr})
          </h3>

          {todayClasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
              🌱 오늘은 예정된 정규 수업이 없습니다. 편안한 하루 보내세요!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {todayClasses.map(cls => (
                <div key={cls.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                        {cls.name}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>
                        🕒 {cls.startTime} - {cls.endTime}
                      </span>
                    </div>
                    <span className="badge badge-present" style={{ fontSize: '0.7rem' }}>
                      학생 {cls.studentIds.length}명
                    </span>
                  </div>

                  {cls.studentIds.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: '0.5rem' }}>
                      배정된 학생이 없습니다. [반/시간표 관리]에서 학생을 추가해 주세요.
                    </div>
                  ) : (
                    <div className="quick-att-grid">
                      {cls.studentIds.map(studentId => {
                        const student = students.find(s => s.id === studentId);
                        if (!student) return null;
                        const record = getRecordForToday(student.id, cls.id);
                        const { arrivalTime, departureTime } = record ? parseTimes(record.memo) : { arrivalTime: null, departureTime: null };

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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
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
