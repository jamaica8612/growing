import { useMemo, useState } from 'react';
import type { Student, Class, Attendance, AttendanceStatus } from '../types';
import { BarChart3, CalendarRange, AlertTriangle, Percent, TrendingDown } from 'lucide-react';

interface AttendanceStatsProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
}

interface StudentRow {
  studentId: string;
  name: string;
  school: string;
  grade: string;
  present: number;
  late: number;
  absent: number;
  makeup: number;
  total: number;
  rate: number; // 0-100, "출석 인정"(present+late+makeup) / total
}

const STATUS_META: Record<AttendanceStatus, { label: string; badge: string; color: string }> = {
  present: { label: '출석', badge: 'badge-present', color: 'var(--color-success)' },
  late: { label: '지각', badge: 'badge-late', color: 'var(--color-warning)' },
  absent: { label: '결석', badge: 'badge-absent', color: 'var(--color-danger)' },
  makeup: { label: '보강', badge: 'badge-makeup', color: 'var(--color-info, #3b82f6)' },
};

// Colour the attendance-rate bar by how concerning it is.
const rateColor = (rate: number) =>
  rate >= 90 ? 'var(--color-success)' : rate >= 75 ? 'var(--color-warning)' : 'var(--color-danger)';

export const AttendanceStats: React.FC<AttendanceStatsProps> = ({ students, classes, attendance }) => {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Months that actually have records, plus the current month, newest first.
  const availableMonths = useMemo(() => {
    const months = new Set<string>(attendance.map(a => a.date.substring(0, 7)));
    months.add(currentMonth);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [attendance, currentMonth]);

  const monthRecords = useMemo(
    () => attendance.filter(a => a.date.startsWith(selectedMonth)),
    [attendance, selectedMonth]
  );

  // Overall status totals for the selected month.
  const totals = useMemo(() => {
    const t = { present: 0, late: 0, absent: 0, makeup: 0 };
    monthRecords.forEach(r => {
      t[r.status] += 1;
    });
    const total = t.present + t.late + t.absent + t.makeup;
    const attended = t.present + t.late + t.makeup;
    return { ...t, total, rate: total > 0 ? Math.round((attended / total) * 100) : 0 };
  }, [monthRecords]);

  // Per-student breakdown for active students, worst attendance first so the
  // students who need follow-up surface at the top.
  const studentRows = useMemo<StudentRow[]>(() => {
    return students
      .filter(s => s.status === 'active')
      .map(s => {
        const records = monthRecords.filter(r => r.studentId === s.id);
        const present = records.filter(r => r.status === 'present').length;
        const late = records.filter(r => r.status === 'late').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const makeup = records.filter(r => r.status === 'makeup').length;
        const total = records.length;
        const attended = present + late + makeup;
        return {
          studentId: s.id,
          name: s.name,
          school: s.school,
          grade: s.grade,
          present,
          late,
          absent,
          makeup,
          total,
          rate: total > 0 ? Math.round((attended / total) * 100) : -1, // -1 = no record
        };
      })
      .sort((a, b) => {
        // Students with no record sink to the bottom; otherwise worst rate first.
        if (a.total === 0 && b.total === 0) return a.name.localeCompare(b.name, 'ko');
        if (a.total === 0) return 1;
        if (b.total === 0) return -1;
        if (a.rate !== b.rate) return a.rate - b.rate;
        return b.absent - a.absent;
      });
  }, [students, monthRecords]);

  // Students needing follow-up: at least one record and rate < 80% or >= 3 absences.
  const concernCount = studentRows.filter(r => r.total > 0 && (r.rate < 80 || r.absent >= 3)).length;

  const monthLabel = `${selectedMonth.split('-')[0]}년 ${Number(selectedMonth.split('-')[1])}월`;
  const orderedStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'makeup'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Month selector */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 className="card-title" style={{ marginBottom: '0.35rem' }}>
            <BarChart3 size={20} className="text-primary" /> 월별 출결 통계 리포트
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            선택한 달의 출결 현황을 집계하여 출석률과 관리가 필요한 학생을 한눈에 보여줍니다.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CalendarRange size={18} className="text-secondary" />
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: '140px' }}
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {m.split('-')[0]}년 {Number(m.split('-')[1])}월
              </option>
            ))}
          </select>
        </div>
      </div>

      {totals.total === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--color-text-secondary)' }}>
          🌱 {monthLabel}에 기록된 출결 데이터가 없습니다. [출결 관리]에서 출결을 체크하면 통계가 집계됩니다.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid-container cols-4">
            <div className="card metric-card accent-sage">
              <div className="metric-info">
                <h4>전체 출석률</h4>
                <div className="metric-value">{totals.rate}%</div>
                <div className="metric-sub">총 {totals.total}건 기록 기준</div>
              </div>
              <div className="metric-icon-wrapper">
                <Percent size={24} />
              </div>
            </div>

            <div className="card metric-card danger">
              <div className="metric-info">
                <h4>결석</h4>
                <div className="metric-value">{totals.absent}건</div>
                <div className="metric-sub">전체의 {totals.total > 0 ? Math.round((totals.absent / totals.total) * 100) : 0}%</div>
              </div>
              <div className="metric-icon-wrapper">
                <TrendingDown size={24} />
              </div>
            </div>

            <div className="card metric-card warning">
              <div className="metric-info">
                <h4>지각</h4>
                <div className="metric-value">{totals.late}건</div>
                <div className="metric-sub">보강 {totals.makeup}건 별도</div>
              </div>
              <div className="metric-icon-wrapper">
                <CalendarRange size={24} />
              </div>
            </div>

            <div className="card metric-card danger">
              <div className="metric-info">
                <h4>관리 필요 학생</h4>
                <div className="metric-value">{concernCount}명</div>
                <div className="metric-sub">출석률 80% 미만 또는 결석 3회+</div>
              </div>
              <div className="metric-icon-wrapper">
                <AlertTriangle size={24} />
              </div>
            </div>
          </div>

          {/* Status distribution bar */}
          <div className="card">
            <h3 className="card-title">출결 상태 분포 ({monthLabel})</h3>
            <div style={{ display: 'flex', height: '28px', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {orderedStatuses.map(status => {
                const count = totals[status];
                if (count === 0) return null;
                const pct = (count / totals.total) * 100;
                return (
                  <div
                    key={status}
                    title={`${STATUS_META[status].label} ${count}건 (${Math.round(pct)}%)`}
                    style={{ width: `${pct}%`, backgroundColor: STATUS_META[status].color }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.85rem' }}>
              {orderedStatuses.map(status => (
                <span key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: STATUS_META[status].color, display: 'inline-block' }} />
                  {STATUS_META[status].label} <strong style={{ color: 'var(--color-text-primary)' }}>{totals[status]}건</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Per-student table */}
          <div className="card">
            <h3 className="card-title">학생별 출결 현황 (출석률 낮은 순)</h3>
            <div className="table-wrapper">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>이름</th>
                    <th style={{ width: '130px' }}>학교 / 학년</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>출석</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>지각</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>결석</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>보강</th>
                    <th style={{ minWidth: '160px' }}>출석률</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map(row => (
                    <tr key={row.studentId}>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>{row.name}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {row.school || '교습소'} · {row.grade.split(' ')[1] || row.grade}
                      </td>
                      <td style={{ textAlign: 'center' }}>{row.present}</td>
                      <td style={{ textAlign: 'center', color: row.late > 0 ? 'var(--color-warning)' : undefined }}>{row.late}</td>
                      <td style={{ textAlign: 'center', fontWeight: row.absent > 0 ? 700 : 400, color: row.absent > 0 ? 'var(--color-danger)' : undefined }}>{row.absent}</td>
                      <td style={{ textAlign: 'center' }}>{row.makeup}</td>
                      <td>
                        {row.total === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>이번 달 기록 없음</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div style={{ flexGrow: 1, height: '8px', backgroundColor: '#eef2f0', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                              <div style={{ width: `${row.rate}%`, height: '100%', backgroundColor: rateColor(row.rate), transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '38px', textAlign: 'right', color: rateColor(row.rate) }}>
                              {row.rate}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.85rem' }}>
              ※ 출석률 = (출석 + 지각 + 보강) ÷ 전체 기록. 활성 재원생 {studentRows.length}명 기준이며, 보강은 출석으로 인정합니다.
            </p>
          </div>

          {/* Per-class summary */}
          <div className="card">
            <h3 className="card-title">반별 출석률 ({monthLabel})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {classes.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>개설된 반이 없습니다.</span>
              ) : (
                classes.map(cls => {
                  const records = monthRecords.filter(r => r.classId === cls.id);
                  const total = records.length;
                  const attended = records.filter(r => r.status !== 'absent').length;
                  const rate = total > 0 ? Math.round((attended / total) * 100) : -1;
                  return (
                    <div key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ width: '180px', flexShrink: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cls.name}
                      </span>
                      <div style={{ flexGrow: 1, height: '10px', backgroundColor: '#eef2f0', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        {rate >= 0 && (
                          <div style={{ width: `${rate}%`, height: '100%', backgroundColor: rateColor(rate) }} />
                        )}
                      </div>
                      <span style={{ width: '90px', textAlign: 'right', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                        {rate >= 0 ? `${rate}% (${total}건)` : '기록 없음'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
