import React, { useMemo } from 'react';
import type { Attendance, EditableAttendanceStatus } from '../types';
import { normalizeAttendanceStatus } from '../lib/attendanceStatus';

interface AttendanceCalendarProps {
  attendance: Attendance[];
  month: string; // YYYY-MM
  selectedDate?: string; // YYYY-MM-DD
  onSelectDate?: (date: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 출결 상태별 표시 색상(기존 디자인 토큰 재사용)과 라벨.
const STATUS_META: { key: EditableAttendanceStatus; label: string; color: string }[] = [
  { key: 'present', label: '출석', color: 'var(--color-success)' },
  { key: 'absent', label: '결석', color: 'var(--color-danger)' },
  { key: 'makeup', label: '보강', color: 'var(--color-info)' },
];

type DayCounts = Record<EditableAttendanceStatus, number>;

// 기존 출결 데이터를 월간 달력 그리드로 시각화한다. 신규 데이터 없이
// attendance 배열을 날짜별로 집계만 한다. 날짜 클릭 시 상위로 알린다.
export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  attendance,
  month,
  selectedDate,
  onSelectDate,
}) => {
  // 날짜(YYYY-MM-DD) → 상태별 건수 집계
  const countsByDate = useMemo(() => {
    const map: Record<string, DayCounts> = {};
    for (const a of attendance) {
      if (!a.date.startsWith(month)) continue;
      const day = (map[a.date] ??= { present: 0, absent: 0, makeup: 0 });
      day[normalizeAttendanceStatus(a.status)]++;
    }
    return map;
  }, [attendance, month]);

  // 달력 셀 구성: 1일의 요일만큼 앞에 빈 칸을 채운 뒤 날짜를 나열.
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

  const monthTotal = useMemo(() => {
    const total: DayCounts = { present: 0, absent: 0, makeup: 0 };
    for (const counts of Object.values(countsByDate)) {
      total.present += counts.present;
      total.absent += counts.absent;
      total.makeup += counts.makeup;
    }
    return total;
  }, [countsByDate]);

  return (
    <div>
      {/* 범례 + 월 합계 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
        {STATUS_META.map(s => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: s.color, display: 'inline-block' }} />
            {s.label} {monthTotal[s.key]}
          </span>
        ))}
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.25rem 0',
              color: i === 0 ? 'var(--color-danger)' : i === 6 ? 'var(--color-info)' : 'var(--color-text-secondary)',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} />;
          const counts = countsByDate[date];
          const dayNum = Number(date.slice(-2));
          const isSelected = date === selectedDate;
          const hasData = !!counts;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate?.(date)}
              title={date}
              style={{
                minHeight: '64px',
                padding: '0.3rem',
                border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isSelected ? 'var(--color-accent-mint-light, #d1fae5)' : hasData ? '#fafcfb' : '#fff',
                cursor: onSelectDate ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '0.2rem',
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{dayNum}</span>
              {hasData && (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                  {STATUS_META.map(s =>
                    counts[s.key] > 0 ? (
                      <span
                        key={s.key}
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          padding: '2px 4px',
                          borderRadius: '4px',
                          color: '#fff',
                          backgroundColor: s.color,
                        }}
                      >
                        {s.label[0]}{counts[s.key]}
                      </span>
                    ) : null
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
