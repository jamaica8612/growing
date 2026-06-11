import React, { useState } from 'react';
import type { Student, Class, Payment, DayOfWeek } from '../types';
import { Bell, BookOpen, Check, Copy, CreditCard, MessageCircle } from 'lucide-react';
import { getSchedulesForDay } from '../lib/classSchedules';
import { localToday, localMonth } from '../lib/dateUtils';

interface DashboardProps {
  students: Student[];
  classes: Class[];
  payments: Payment[];
  onNavigate?: (tab: 'messaging' | 'payments' | 'kakao') => void;
  pendingCounselCount?: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  students,
  classes,
  payments,
  onNavigate,
  pendingCounselCount = 0,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(localToday);

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
  const todayStudentCount = selectedClasses.reduce(
    (sum, { cls }) => sum + cls.studentIds.filter(sid => activeStudentIds.has(sid)).length,
    0,
  );

  const currentMonthStr = localMonth();
  const currentMonthPayments = payments.filter(p => p.billingMonth === currentMonthStr);
  const unpaidCount = currentMonthPayments.filter(p => p.status === 'unpaid').length;
  const totalUnpaid = currentMonthPayments
    .filter(p => p.status === 'unpaid')
    .reduce((sum, p) => sum + p.amount, 0);

  const unpaidDetails = currentMonthPayments
    .filter(p => p.status === 'unpaid')
    .map(p => {
      const student = students.find(s => s.id === p.studentId);
      const cls = classes.find(c => c.studentIds.includes(p.studentId));
      return {
        paymentId: p.id,
        studentName: student?.name || '학생',
        parentContact: student?.parentContact || '',
        className: cls?.name || '일반 과정',
        amount: p.amount,
      };
    })
    .filter(item => item.parentContact !== '');

  const handleCopySMS = (item: typeof unpaidDetails[0]) => {
    const message = `안녕하세요. 그로잉영어입니다.\n\n${item.studentName} 학생의 ${currentMonthStr.split('-')[1]}월 교육비 ${item.amount.toLocaleString()}원 미납 안내드립니다.\n\n확인 부탁드립니다. 감사합니다.`;
    navigator.clipboard.writeText(message).then(() => {
      setCopiedId(item.paymentId);
      setToast(`${item.studentName} 학부모님 안내 메시지를 복사했어요.`);
      setTimeout(() => setCopiedId(null), 1800);
      setTimeout(() => setToast(null), 2400);
    }).catch(() => {
      setToast('클립보드 복사에 실패했습니다.');
      setTimeout(() => setToast(null), 2400);
    });
  };

  const d = new Date(`${selectedDate}T00:00:00`);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${selectedDay})`;
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '오늘도 수고 많으세요' : '오늘 하루도 잘 마무리해요';

  return (
    <div className="gd-root">
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
            오늘은 {selectedClasses.length}개 반 수업과 {todayStudentCount}명의 수업 대상자가 있습니다.
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

      <div className="gd-datepick-mobile">
        <label htmlFor="mobile-date-input">조회 날짜</label>
        <input
          id="mobile-date-input"
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
      </div>

      {pendingCounselCount > 0 && (
        <button
          type="button"
          className="counsel-alert-banner"
          onClick={() => onNavigate?.('kakao')}
        >
          <Bell size={16} />
          <span>미처리 상담 요청 <strong>{pendingCounselCount}건</strong> 확인하기</span>
          <span className="counsel-alert-arrow">›</span>
        </button>
      )}

      <section className="today-flow">
        <div>
          <span className="today-flow-kicker">오늘 업무 흐름</span>
          <h2>수업 일정, 미납 안내, 학부모 메시지만 빠르게 확인합니다.</h2>
        </div>
        <div className="today-flow-actions" aria-label="오늘 업무 바로가기">
          <button type="button" onClick={() => onNavigate?.('messaging')}>
            <Bell size={15} /> 알림장 발송
          </button>
          <button type="button" onClick={() => onNavigate?.('payments')}>
            <CreditCard size={15} /> 미납 확인
          </button>
          <button type="button" onClick={() => onNavigate?.('kakao')}>
            <MessageCircle size={15} /> 카카오 요청
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

        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#e7f0fb', color: 'var(--color-info)' }}>
            <BookOpen size={18} />
          </div>
          <div className="gd-stat-body">
            <span className="gd-stat-label">수업 대상</span>
            <span className="gd-stat-val">{todayStudentCount}<em>명</em></span>
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

      <section className="gd-brief">
        <div className="gd-brief-head">
          <span className="gd-brief-badge">오늘의 브리핑</span>
          <span className="gd-brief-meta">{dateLabel}</span>
        </div>
        <ul className="gd-brief-list">
          <li>
            <span className="gd-dot gd-dot-primary" />
            오늘 수업 <b>{selectedClasses.length}개 반</b> · 수업 대상 <b>{todayStudentCount}명</b>
          </li>
          <li>
            <span className="gd-dot gd-dot-danger" />
            이번 달 미납{' '}
            {unpaidCount > 0
              ? <><b className="t-danger">{unpaidCount}건</b> ({totalUnpaid.toLocaleString()}원) 확인 필요</>
              : <><b className="t-ok">없음</b></>
            }
          </li>
        </ul>
      </section>

      <div className="gd-main">
        <section className="gd-card gd-att">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><BookOpen size={18} /> 오늘 수업 일정</h2>
            <span className="gd-card-pill">{selectedClasses.length}개 반</span>
          </div>

          {selectedClasses.length === 0 ? (
            <div className="gd-empty">
              <span style={{ fontSize: '2rem' }}>-</span>
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
                      <span className="gd-class-time">{schedule.startTime}-{schedule.endTime}</span>
                      <span className="gd-class-count">
                        재원 {activeMemberIds.length}명{pausedCount > 0 && ` · 휴원 ${pausedCount}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
              <span>이번 달 미납이 없어요.</span>
            </div>
          ) : (
            <div className="gd-pay-list">
              {unpaidDetails.map(item => (
                <div className="gd-pay-item" key={item.paymentId}>
                  <div className="gd-pay-row">
                    <div className="gd-pay-who">
                      <span className="gd-pay-name">{item.studentName} 학부모님</span>
                      <span className="gd-pay-phone">{item.parentContact}</span>
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
