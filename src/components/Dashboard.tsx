import React, { useState } from 'react';
import type { Student, Class, Attendance, Payment, DayOfWeek, HomeworkStatus } from '../types';
import { Bell, BookOpen, Check, Clock, Copy, CreditCard, RefreshCw } from 'lucide-react';
import { getSchedulesForDay } from '../lib/classSchedules';

/* 진행률 도넛 링 */
function Ring({ value, total, size = 58, stroke = 7 }: { value: number; total: number; size?: number; stroke?: number }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3ece7" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct >= 1 ? 'var(--color-accent-mint)' : 'var(--color-primary)'}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(.16,1,.3,1)' }}
      />
    </svg>
  );
}

interface DashboardProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  onSaveAttendance: (attendanceData: Omit<Attendance, 'id' | 'memo'> & { memo?: string }) => void;
  onNavigate?: (tab: 'attendance' | 'makeup' | 'messaging' | 'payments') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  students,
  classes,
  attendance,
  payments,
  onSaveAttendance,
  onNavigate,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const getKoreanDayOfWeek = (dateStr: string): DayOfWeek => {
    const days: DayOfWeek[] = ['일', '월', '화', '수', '목', '금', '토'];
    return days[new Date(`${dateStr}T00:00:00`).getDay()];
  };

  const selectedDay = getKoreanDayOfWeek(selectedDate);

  const activeStudents = students.filter(s => s.status === 'active');
  const activeStudentIds = new Set(activeStudents.map(s => s.id));

  const selectedClasses = classes.flatMap(cls =>
    getSchedulesForDay(cls, selectedDay).map(schedule => ({ cls, schedule }))
  ).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime));

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const currentMonthPayments = payments.filter(p => p.billingMonth === currentMonthStr);
  const unpaidCount = currentMonthPayments.filter(p => p.status === 'unpaid').length;
  const totalUnpaid = currentMonthPayments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0);

  const selectedAttendanceRecords = attendance.filter(a => a.date === selectedDate);

  const expectedPairs = new Set<string>();
  selectedClasses.forEach(({ cls }) => {
    cls.studentIds.forEach(sid => {
      if (activeStudentIds.has(sid)) expectedPairs.add(`${cls.id}|${sid}`);
    });
  });
  const totalExpectedAttendance = expectedPairs.size;

  const checkedPairCount = selectedAttendanceRecords.filter(
    a => expectedPairs.has(`${a.classId}|${a.studentId}`) && (a.checkInTime || a.status === 'absent')
  ).length;
  const uncheckedCount = Math.max(totalExpectedAttendance - checkedPairCount, 0);

  const todayMakeups = selectedAttendanceRecords
    .filter(a => a.status === 'makeup')
    .map(a => students.find(s => s.id === a.studentId)?.name)
    .filter((n): n is string => Boolean(n));

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

  const handleCopySMS = (item: typeof unpaidDetails[0]) => {
    const message = `안녕하세요, 그로잉영어입니다. 🌱\n\n${item.studentName} 학생의 ${currentMonthStr.split('-')[1]}월 교육비(${item.amount.toLocaleString()}원) 수납 안내드립니다.\n\n바쁘시겠지만 기한 내에 확인 부탁드립니다. 감사합니다. 좋은 하루 보내세요!`;
    navigator.clipboard.writeText(message).then(() => {
      setCopiedId(item.paymentId);
      setToast(`${item.studentName} 학부모님 안내 메시지를 복사했어요`);
      setTimeout(() => setCopiedId(null), 1800);
      setTimeout(() => setToast(null), 2400);
    });
  };

  const getCurrentTimeStr = () =>
    new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const getRecordForSelectedDate = (studentId: string, classId: string) =>
    attendance.find(a => a.studentId === studentId && a.classId === classId && a.date === selectedDate);

  const handleArrival = (studentId: string, classId: string) => {
    onSaveAttendance({ studentId, classId, date: selectedDate, status: 'present', checkInTime: getCurrentTimeStr() });
  };

  const handleDeparture = (studentId: string, classId: string) => {
    onSaveAttendance({ studentId, classId, date: selectedDate, status: 'present', checkOutTime: getCurrentTimeStr() });
  };

  const handleTimeChange = (studentId: string, classId: string, field: 'checkInTime' | 'checkOutTime', value: string) => {
    const record = getRecordForSelectedDate(studentId, classId);
    onSaveAttendance({
      studentId, classId, date: selectedDate,
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
      studentId, classId, date: selectedDate,
      status: record?.status ?? 'present',
      memo: record?.memo ?? '',
      homeworkStatus,
    });
  };

  const d = new Date(`${selectedDate}T00:00:00`);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${selectedDay})`;
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '오늘도 수고 많으세요' : '오늘 하루도 잘 마무리해요';

  return (
    <div className="gd-root">
      {/* ── 인사 히어로 밴드 ── */}
      <header className="gd-hero">
        <div className="gd-hero-leaf" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c5-3 9-7 9-13 0-3-1-6-1-6s-4 1-7 4-4 7-4 10c0 0-2-1-3-3 0 0 0 5 6 8z" />
          </svg>
        </div>
        <div className="gd-hero-text">
          <span className="gd-hero-date">{dateLabel}</span>
          <h1 className="gd-hero-greet">{greet}</h1>
          <p className="gd-hero-sub">
            오늘은 {selectedClasses.length}개 반 수업이 있고,{' '}
            {uncheckedCount > 0 ? `출결 ${uncheckedCount}명 체크가 남았어요.` : '출결 체크를 모두 마쳤어요.'}
          </p>
        </div>
        <label className="gd-datepick">
          <span>조회 날짜</span>
          <input
            type="date"
            className="gd-dateinput"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </label>
      </header>

      {/* ── 모바일 전용 날짜 선택 바 ── */}
      <div className="gd-datepick-mobile">
        <label htmlFor="mobile-date-input">📅 조회 날짜</label>
        <input
          id="mobile-date-input"
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
      </div>

      {/* ── 요약 타일 4개 ── */}
      <section className="today-flow">
        <div>
          <span className="today-flow-kicker">오늘 업무 흐름</span>
          <h2>수업 체크부터 학부모 안내까지 한 번에 이어집니다.</h2>
        </div>
        <div className="today-flow-actions" aria-label="오늘 업무 바로가기">
          <button type="button" onClick={() => onNavigate?.('attendance')}>
            <Clock size={15} /> 출결 상세
          </button>
          <button type="button" onClick={() => onNavigate?.('makeup')}>
            <RefreshCw size={15} /> 보강 처리
          </button>
          <button type="button" onClick={() => onNavigate?.('messaging')}>
            <Bell size={15} /> 알림장 발송
          </button>
          <button type="button" onClick={() => onNavigate?.('payments')}>
            <CreditCard size={15} /> 미납 확인
          </button>
        </div>
      </section>

      <div className="gd-stats">
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#eaf4ee', color: 'var(--color-primary)' }}>
            <BookOpen size={18} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">오늘 수업</span>
            <span className="gd-stat-val">{selectedClasses.length}<em>개 반</em></span>
          </div>
        </div>

        <div className="gd-stat gd-stat-ring">
          <Ring value={checkedPairCount} total={totalExpectedAttendance} />
          <div className="gd-stat-body">
            <span className="gd-stat-label">출결 진행</span>
            <span className="gd-stat-val">{checkedPairCount}<em>/{totalExpectedAttendance}명</em></span>
          </div>
        </div>

        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#e7f0fb', color: 'var(--color-info)' }}>
            <RefreshCw size={18} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">오늘 보강</span>
            <span className="gd-stat-val">{todayMakeups.length}<em>명</em></span>
          </div>
        </div>

        <div className={`gd-stat ${unpaidCount > 0 ? 'gd-stat-danger' : ''}`}>
          <div
            className="gd-stat-ic"
            style={{
              background: unpaidCount > 0 ? '#fdeaea' : '#eaf4ee',
              color: unpaidCount > 0 ? 'var(--color-danger)' : 'var(--color-accent-mint)',
            }}
          >
            <CreditCard size={18} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">이번 달 미납</span>
            <span className="gd-stat-val">{unpaidCount}<em>건</em></span>
            {unpaidCount > 0 && <span className="gd-stat-foot">{totalUnpaid.toLocaleString()}원</span>}
          </div>
        </div>
      </div>

      {/* ── 오늘의 브리핑 ── */}
      <section className="gd-brief">
        <div className="gd-brief-head">
          <span className="gd-brief-badge">🌅 오늘의 브리핑</span>
          <span className="gd-brief-meta">{dateLabel}</span>
        </div>
        <ul className="gd-brief-list">
          <li>
            <span className="gd-dot gd-dot-primary" />
            오늘 수업 <b>{selectedClasses.length}개 반</b>{' '}
            {uncheckedCount > 0
              ? <>· 출결 미체크 <b className="t-warn">{uncheckedCount}명</b> 남음</>
              : <>· 출결 체크 <b className="t-ok">완료</b> 👍</>
            }
          </li>
          {todayMakeups.length > 0 && (
            <li>
              <span className="gd-dot gd-dot-info" />
              오늘 보강 <b>{todayMakeups.length}명</b> ({todayMakeups.join(', ')})
            </li>
          )}
          <li>
            <span className="gd-dot gd-dot-danger" />
            이번 달 미납{' '}
            {unpaidCount > 0
              ? <><b className="t-danger">{unpaidCount}건</b> ({totalUnpaid.toLocaleString()}원) — 우측에서 안내 발송</>
              : <><b className="t-ok">없음</b> 👍</>
            }
          </li>
          {frequentAbsentees.length > 0 && (
            <li>
              <span className="gd-dot gd-dot-warn" />
              최근 2주 결석 잦은 학생:{' '}
              <b className="t-danger">{frequentAbsentees.map(f => `${f.name}(${f.count}회)`).join(', ')}</b> — 상담 권장
            </li>
          )}
        </ul>
      </section>

      {/* ── 본문 2단 그리드 ── */}
      <div className="gd-main">
        {/* 좌: 출결·숙제 체크 */}
        <section className="gd-card gd-att">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Clock size={18} /> 출결 · 숙제 체크</h2>
            <span className="gd-card-pill">{checkedPairCount}/{totalExpectedAttendance} 완료</span>
          </div>

          {selectedClasses.length === 0 ? (
            <div className="gd-empty">
              <span style={{ fontSize: '2rem' }}>🌱</span>
              <span>{selectedDay}요일에는 예정된 수업이 없습니다.</span>
            </div>
          ) : (
            <div className="gd-classes">
              {selectedClasses.map(({ cls, schedule }) => {
                const activeMemberIds = cls.studentIds.filter(sid => activeStudentIds.has(sid));
                const pausedCount = cls.studentIds.filter(
                  sid => students.find(s => s.id === sid)?.status === 'paused'
                ).length;
                return (
                  <div className="gd-class" key={`${cls.id}-${schedule.day}-${schedule.startTime}`}>
                    <div className="gd-class-head">
                      <span className="gd-class-bar" style={{ background: cls.color }} />
                      <span className="gd-class-name">{cls.name}</span>
                      <span className="gd-class-time">{schedule.startTime}–{schedule.endTime}</span>
                      <span className="gd-class-count">
                        재원 {activeMemberIds.length}명{pausedCount > 0 && ` · 휴원 ${pausedCount}`}
                      </span>
                    </div>

                    {activeMemberIds.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: '0.5rem' }}>
                        {cls.studentIds.length === 0
                          ? '배정된 학생이 없습니다. [반/시간표]에서 학생을 추가하세요.'
                          : '출결 대상인 재원생이 없습니다. (휴원/퇴원생 제외)'}
                      </div>
                    ) : (
                      <div className="gd-students">
                        {activeMemberIds.map(studentId => {
                          const student = students.find(s => s.id === studentId);
                          if (!student) return null;
                          const record = getRecordForSelectedDate(student.id, cls.id);
                          const inT = record?.checkInTime ?? null;
                          const outT = record?.checkOutTime ?? null;
                          const hw = record?.homeworkStatus ?? '';
                          const isMakeup = record?.status === 'makeup';

                          return (
                            <div key={student.id} className={`gd-st ${inT ? 'is-in' : ''}`}>
                              <div className="gd-st-top">
                                <div className="gd-st-id">
                                  <span className="gd-st-name">
                                    {student.name}
                                    {isMakeup && <span className="gd-st-tag">보강</span>}
                                  </span>
                                  <span className="gd-st-meta">{student.school} {student.grade.split(' ')[1] || student.grade}</span>
                                </div>
                                {inT && <span className="gd-st-status">출석</span>}
                              </div>

                              <div className="gd-st-inout">
                                <button className={`gd-io ${inT ? 'on-in' : ''}`} onClick={() => handleArrival(student.id, cls.id)}>
                                  <span className="gd-io-lbl">🌱 등원</span>
                                  <span className="gd-io-t">{inT || '—'}</span>
                                </button>
                                <button className={`gd-io ${outT ? 'on-out' : ''}`} onClick={() => handleDeparture(student.id, cls.id)}>
                                  <span className="gd-io-lbl">🏡 하원</span>
                                  <span className="gd-io-t">{outT || '—'}</span>
                                </button>
                              </div>

                              <div className="gd-st-inout" style={{ gap: '0.3rem', marginBottom: '0.35rem' }}>
                                <input
                                  type="time"
                                  className="form-control"
                                  value={inT ?? ''}
                                  aria-label={`${student.name} 등원 시간 수정`}
                                  onChange={e => handleTimeChange(student.id, cls.id, 'checkInTime', e.target.value)}
                                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}
                                />
                                <input
                                  type="time"
                                  className="form-control"
                                  value={outT ?? ''}
                                  aria-label={`${student.name} 하원 시간 수정`}
                                  onChange={e => handleTimeChange(student.id, cls.id, 'checkOutTime', e.target.value)}
                                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}
                                />
                              </div>

                              <div className="gd-st-hw">
                                <span className="gd-hw-lbl">숙제</span>
                                <div className="gd-seg">
                                  <button
                                    className={`gd-seg-b ${hw === 'done' ? 'sel ok' : ''}`}
                                    onClick={() => handleHomework(student.id, cls.id, 'done')}
                                  >완료</button>
                                  <button
                                    className={`gd-seg-b ${hw === 'incomplete' ? 'sel warn' : ''}`}
                                    onClick={() => handleHomework(student.id, cls.id, 'incomplete')}
                                  >미흡</button>
                                  <button
                                    className={`gd-seg-b ${hw === 'undone' ? 'sel danger' : ''}`}
                                    onClick={() => handleHomework(student.id, cls.id, 'undone')}
                                  >안함</button>
                                </div>
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
        </section>

        {/* 우: 미납 안내 도우미 */}
        <section className="gd-card gd-pay">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Bell size={18} /> 미납 안내 도우미</h2>
            {unpaidCount > 0 && <span className="gd-card-pill danger">{unpaidCount}건</span>}
          </div>
          <p className="gd-pay-desc">
            {currentMonthStr.split('-')[1]}월 미납 학부모님께 보낼 안내 메시지를 복사하세요.
          </p>

          {unpaidDetails.length === 0 ? (
            <div className="gd-empty">
              <Check size={30} />
              <span>이번 달 미납이 없어요!</span>
            </div>
          ) : (
            <div className="gd-pay-list">
              {unpaidDetails.map(item => (
                <div className="gd-pay-item" key={item.paymentId}>
                  <div className="gd-pay-row">
                    <div className="gd-pay-who">
                      <span className="gd-pay-name">{item.studentName} 어머니</span>
                      <span className="gd-pay-phone">📞 {item.parentContact}</span>
                    </div>
                    <button
                      className={`gd-copy ${copiedId === item.paymentId ? 'done' : ''}`}
                      onClick={() => handleCopySMS(item)}
                    >
                      {copiedId === item.paymentId
                        ? <><Check size={13} /> 복사됨</>
                        : <><Copy size={13} /> 복사</>
                      }
                    </button>
                  </div>
                  <div className="gd-pay-foot">
                    <span>{item.className}</span>
                    <b>{item.amount.toLocaleString()}원</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="gd-toast">
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  );
};
