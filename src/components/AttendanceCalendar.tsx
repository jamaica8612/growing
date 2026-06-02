import { useMemo } from 'react';
import type { Attendance } from '../types';
import { normalizeAttendanceStatus } from '../lib/attendanceStatus';

interface AttendanceCalendarProps {
  attendance: Attendance[];
  month: string; // YYYY-MM
  selectedDate?: string; // YYYY-MM-DD
  onSelectDate?: (date: string) => void;
  compact?: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// normalizeAttendanceStatus 집계만 — 신규 데이터 없음.
export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  attendance,
  month,
  selectedDate,
  onSelectDate,
  compact = false,
}) => {
  // 날짜(YYYY-MM-DD) → 상태별 건수 집계
  const countsByDate = useMemo(() => {
    const map: Record<string, { present: number; absent: number; makeup: number }> = {};
    for (const a of attendance) {
      if (!a.date.startsWith(month)) continue;
      const day = (map[a.date] ??= { present: 0, absent: 0, makeup: 0 });
      day[normalizeAttendanceStatus(a.status)]++;
    }
    return map;
  }, [attendance, month]);

  // 달력 셀: 1일 요일만큼 빈 칸 + 날짜 나열
  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return [] as (string | null)[];
    const firstDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(`${month}-${String(d).padStart(2, '0')}`);
    }
    return list;
  }, [month]);

  // 월 합계
  const monthTotal = useMemo(() => {
    const total = { present: 0, absent: 0, makeup: 0 };
    for (const c of Object.values(countsByDate)) {
      total.present += c.present;
      total.absent += c.absent;
      total.makeup += c.makeup;
    }
    return total;
  }, [countsByDate]);

  return (
    <div className={`cal${compact ? ' cal-compact' : ''}`}>
      {/* 요일 헤더 */}
      <div className="cal-grid cal-head">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`cal-wd${i === 0 ? ' sun' : ''}${i === 6 ? ' sat' : ''}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 셀 그리드 */}
      <div className="cal-grid">
        {cells.map((date, idx) => {
          if (!date) return <div key={`e-${idx}`} className="cal-cell empty" />;
          const c = countsByDate[date];
          const dayNum = Number(date.slice(-2));
          const isSelected = date === selectedDate;
          const hasData = !!c;
          return (
            <button
              key={date}
              type="button"
              className={`cal-cell${hasData ? ' has' : ''}${isSelected ? ' selected' : ''}${onSelectDate ? ' cal-actionable' : ''}`}
              onClick={() => onSelectDate?.(date)}
              title={date}
            >
              <span className="cal-d">{dayNum}</span>
              {hasData && (
                <div className="cal-dots">
                  {c.present > 0 && <span className="cal-dot present" title={`출석 ${c.present}`} />}
                  {c.makeup > 0 && <span className="cal-dot makeup" title={`보강 ${c.makeup}`} />}
                  {c.absent > 0 && <span className="cal-dot absent" title={`결석 ${c.absent}`} />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 + 월 합계 */}
      <div className="cal-legend">
        <span><i className="cal-dot present" /> 출석 {monthTotal.present}</span>
        <span><i className="cal-dot makeup" /> 보강 {monthTotal.makeup}</span>
        <span><i className="cal-dot absent" /> 결석 {monthTotal.absent}</span>
      </div>
    </div>
  );
};
