import { useMemo, useState } from 'react';
import type { Student, Class, Attendance, EditableAttendanceStatus, Payment } from '../types';
import { normalizeAttendanceStatus } from '../lib/attendanceStatus';
import { BarChart3, CalendarRange, AlertTriangle, Percent, TrendingDown, Copy, Check, MessageSquare } from 'lucide-react';

interface AttendanceStatsProps {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  onSendDraftToMessaging?: (content: string) => void;
}

interface StudentRow {
  studentId: string;
  name: string;
  school: string;
  grade: string;
  parentContact: string;
  present: number;
  absent: number;
  makeup: number;
  total: number;
  rate: number; // 0-100, "출석 인정"(present+makeup) / total
}

const STATUS_META: Record<EditableAttendanceStatus, { label: string; badge: string; color: string }> = {
  present: { label: '출석', badge: 'badge-present', color: 'var(--color-success)' },
  absent: { label: '결석', badge: 'badge-absent', color: 'var(--color-danger)' },
  makeup: { label: '보강', badge: 'badge-makeup', color: 'var(--color-info, #3b82f6)' },
};

// Colour the attendance-rate bar by how concerning it is.
const rateColor = (rate: number) =>
  rate >= 90 ? 'var(--color-success)' : rate >= 75 ? 'var(--color-warning)' : 'var(--color-danger)';

export const AttendanceStats: React.FC<AttendanceStatsProps> = ({ students, classes, attendance, payments, onSendDraftToMessaging }) => {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Months that actually have records, plus the current month, newest first.
  const availableMonths = useMemo(() => {
    const months = new Set<string>(attendance.map(a => a.date.substring(0, 7)));
    months.add(currentMonth);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [attendance, currentMonth]);

  // 통계는 재원생 기준. 휴원/퇴원생의 잔존 출결 기록은 KPI·반별 출석률에서
  // 제외해, 학생별 표(재원생만)와 모수를 일치시킨다.
  const activeStudentIds = useMemo(
    () => new Set(students.filter(s => s.status === 'active').map(s => s.id)),
    [students]
  );
  const monthRecords = useMemo(
    () => attendance.filter(a => a.date.startsWith(selectedMonth) && activeStudentIds.has(a.studentId)),
    [attendance, selectedMonth, activeStudentIds]
  );

  // Overall status totals for the selected month.
  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, makeup: 0 };
    monthRecords.forEach(r => {
      t[normalizeAttendanceStatus(r.status)] += 1;
    });
    const total = t.present + t.absent + t.makeup;
    const attended = t.present + t.makeup;
    return { ...t, total, rate: total > 0 ? Math.round((attended / total) * 100) : 0 };
  }, [monthRecords]);

  // Per-student breakdown for active students, worst attendance first so the
  // students who need follow-up surface at the top.
  const studentRows = useMemo<StudentRow[]>(() => {
    return students
      .filter(s => s.status === 'active')
      .map(s => {
        const records = monthRecords.filter(r => r.studentId === s.id);
        const normalized = records.map(r => normalizeAttendanceStatus(r.status));
        const present = normalized.filter(status => status === 'present').length;
        const absent = normalized.filter(status => status === 'absent').length;
        const makeup = normalized.filter(status => status === 'makeup').length;
        const total = records.length;
        const attended = present + makeup;
        return {
          studentId: s.id,
          name: s.name,
          school: s.school,
          grade: s.grade,
          parentContact: s.parentContact,
          present,
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

  // Last 3 months attendance trend (including selectedMonth).
  const trend = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [2, 1, 0].map(i => {
      const d = new Date(y, m - 1 - i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const recs = attendance.filter(a => a.date.startsWith(mo) && activeStudentIds.has(a.studentId));
      const attended = recs.filter(r => normalizeAttendanceStatus(r.status) !== 'absent').length;
      return {
        month: mo,
        label: `${d.getMonth() + 1}월`,
        total: recs.length,
        rate: recs.length ? Math.round((attended / recs.length) * 100) : -1,
      };
    });
  }, [attendance, selectedMonth, activeStudentIds]);

  // Combined risk: low attendance OR unpaid for selectedMonth.
  const unpaidIds = useMemo(
    () => new Set(payments.filter(p => p.billingMonth === selectedMonth && p.status === 'unpaid').map(p => p.studentId)),
    [payments, selectedMonth]
  );

  const riskList = useMemo(
    () =>
      studentRows
        .map(r => ({ ...r, unpaid: unpaidIds.has(r.studentId) }))
        .filter(r => (r.total > 0 && (r.rate < 80 || r.absent >= 3)) || r.unpaid)
        .sort(
          (a, b) =>
            (Number(b.unpaid) + Number(b.rate < 80 || b.absent >= 3)) -
            (Number(a.unpaid) + Number(a.rate < 80 || a.absent >= 3))
        ),
    [studentRows, unpaidIds]
  );

  // Students needing follow-up: at least one record and rate < 80% or >= 3 absences.
  const concernRows = studentRows.filter(r => r.total > 0 && (r.rate < 80 || r.absent >= 3));
  const concernCount = concernRows.length;

  const monthNum = Number(selectedMonth.split('-')[1]);
  const monthLabel = `${selectedMonth.split('-')[0]}년 ${monthNum}월`;
  const orderedStatuses: EditableAttendanceStatus[] = ['present', 'absent', 'makeup'];

  // Build a parent-facing attendance summary message for one student. The
  // closing line softens or congratulates depending on the attendance level.
  const buildAttendanceMessage = (row: StudentRow) => {
    const needsAttention = row.rate < 80 || row.absent >= 3;
    const closing = needsAttention
      ? '최근 출결이 다소 불규칙하여 안내드립니다. 규칙적인 출석이 학습 흐름에 큰 도움이 되니, 가정에서도 관심과 격려 부탁드립니다. 😊'
      : `${row.name} 학생이 성실하게 잘 출석하고 있습니다. 늘 믿고 맡겨주셔서 감사합니다. 😊`;
    return (
      `안녕하세요, 그로잉영어입니다. 🌱\n\n` +
      `${row.name} 학생의 ${monthNum}월 출결 현황을 안내드립니다.\n\n` +
      `- 출석 ${row.present}회 / 결석 ${row.absent}회 / 보강 ${row.makeup}회\n` +
      `- 출석률 ${row.rate}%\n\n` +
      closing
    );
  };

  const handleCopyMessage = (row: StudentRow) => {
    navigator.clipboard.writeText(buildAttendanceMessage(row)).then(() => {
      setCopiedId(row.studentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleSendToMessaging = (row: StudentRow) => {
    onSendDraftToMessaging?.(buildAttendanceMessage(row));
  };

  return (
    <div className="gd-root">
      {/* ── 월 선택 바 ── */}
      <div className="st-statbar">
        <div>
          <h3 className="gd-card-title" style={{ marginBottom: '0.2rem' }}><BarChart3 size={18} /> 월별 출결 통계 리포트</h3>
          <div className="st-statbar-sub">선택한 달의 출결 현황을 집계하여 출석률과 관리 필요 학생을 한눈에 봅니다.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CalendarRange size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <select className="form-control st-monthsel" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {availableMonths.map(m => <option key={m} value={m}>{m.split('-')[0]}년 {Number(m.split('-')[1])}월</option>)}
          </select>
        </div>
      </div>

      {totals.total === 0 ? (
        <div className="gd-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--color-text-secondary)' }}>
          🌱 {monthLabel}에 기록된 출결 데이터가 없습니다. [출결 관리]에서 출결을 체크하면 통계가 집계됩니다.
        </div>
      ) : (
        <>
          {/* ── KPI 타일 4개 ── */}
          <div className="gd-stats">
            <div className="gd-stat">
              <div className="gd-stat-ic" style={{ background: '#ecfccb', color: 'var(--color-accent-sage)' }}><Percent size={18} /></div>
              <div className="gd-stat-body">
                <span className="gd-stat-label">전체 출석률</span>
                <span className="gd-stat-val">{totals.rate}<em>%</em></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>총 {totals.total}건 기준</span>
              </div>
            </div>
            <div className="gd-stat">
              <div className="gd-stat-ic" style={{ background: '#fdeaea', color: 'var(--color-danger)' }}><TrendingDown size={18} /></div>
              <div className="gd-stat-body">
                <span className="gd-stat-label">결석</span>
                <span className="gd-stat-val">{totals.absent}<em>건</em></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>전체의 {totals.total > 0 ? Math.round((totals.absent / totals.total) * 100) : 0}%</span>
              </div>
            </div>
            <div className="gd-stat">
              <div className="gd-stat-ic" style={{ background: '#fef3c7', color: 'var(--color-warning)' }}><CalendarRange size={18} /></div>
              <div className="gd-stat-body">
                <span className="gd-stat-label">보강</span>
                <span className="gd-stat-val">{totals.makeup}<em>건</em></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>출석 인정 기록</span>
              </div>
            </div>
            <div className={`gd-stat ${concernCount > 0 ? 'gd-stat-danger' : ''}`}>
              <div className="gd-stat-ic" style={{ background: concernCount > 0 ? '#fdeaea' : '#eaf4ee', color: concernCount > 0 ? 'var(--color-danger)' : 'var(--color-accent-mint)' }}><AlertTriangle size={18} /></div>
              <div className="gd-stat-body">
                <span className="gd-stat-label">관리 필요</span>
                <span className="gd-stat-val">{concernCount}<em>명</em></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>80% 미만·결석 3회+</span>
              </div>
            </div>
          </div>

          {/* ── 3개월 추세 ── */}
          <div className="gd-card">
            <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}><BarChart3 size={18} /> 최근 3개월 출석 추세</h2>
            <div className="stat-trend">
              {trend.map((t, i) => {
                const isSelected = i === 2;
                const color = t.rate >= 0 ? rateColor(t.rate) : '#d1d5db';
                const barPct = t.rate >= 0 ? t.rate : 0;
                return (
                  <div key={t.month} className="stat-tcol">
                    <span className="stat-tv" style={{ color: t.rate >= 0 ? color : 'var(--color-text-muted)' }}>{t.rate >= 0 ? `${t.rate}%` : '—'}</span>
                    <div className="stat-tbar-bg">
                      <div className="stat-tbar" style={{ height: `${barPct}%`, minHeight: barPct > 0 ? '4px' : '0', backgroundColor: color, opacity: isSelected ? 1 : 0.65 }} />
                    </div>
                    <span className="stat-tl" style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)' }}>{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우선 관리 대상 — 출결 저조 또는 미납 */}
          {riskList.length > 0 && (
            <div className="card" style={{ borderLeft: '5px solid var(--color-warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                <div>
                  <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>🚨 우선 관리 대상</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    {monthLabel} 기준 출석률 저조·결석 반복·미납 학생입니다.
                  </p>
                </div>
                <span className="badge badge-absent" style={{ fontSize: '0.78rem' }}>{riskList.length}명</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {riskList.map(r => (
                  <div
                    key={r.studentId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.55rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: '#fffdf5',
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ color: 'var(--color-primary-dark)', minWidth: '56px' }}>{r.name}</strong>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flex: 1 }}>
                      {r.total > 0 && (r.rate < 80 || r.absent >= 3) && (
                        <span className="badge badge-absent" style={{ fontSize: '0.72rem' }}>
                          출결 {r.rate}% · 결석 {r.absent}
                        </span>
                      )}
                      {r.unpaid && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                          미납
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {concernRows.length > 0 && (
            <div className="card" style={{ borderLeft: '5px solid var(--color-danger)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div>
                  <h3 className="card-title" style={{ marginBottom: '0.35rem' }}>
                    <AlertTriangle size={20} style={{ color: 'var(--color-danger)' }} /> 출결 후속 관리 대상
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {monthLabel} 기준 출석률이 낮거나 결석이 반복된 학생입니다. 안내문을 복사하거나 알림장 조립기로 넘겨 바로 다듬을 수 있습니다.
                  </p>
                </div>
                <span className="badge badge-absent" style={{ fontSize: '0.78rem' }}>{concernRows.length}명 확인 필요</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '0.75rem' }}>
                {concernRows.slice(0, 8).map(row => (
                  <div
                    key={row.studentId}
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-danger-light)',
                      backgroundColor: '#fffdfd',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ color: 'var(--color-primary-dark)' }}>{row.name}</strong>
                        <div style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                          {row.school || '교습소'} · {row.grade.split(' ')[1] || row.grade}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: rateColor(row.rate) }}>{row.rate}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                      <span className="badge badge-absent">결석 {row.absent}</span>
                      <span className="badge badge-present">출석 {row.present}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ flex: '1 1 110px', padding: '0.4rem 0.6rem', fontSize: '0.76rem', gap: '0.25rem' }}
                        onClick={() => handleCopyMessage(row)}
                      >
                        {copiedId === row.studentId ? <><Check size={12} className="text-success" /> 복사됨</> : <><Copy size={12} /> 안내 복사</>}
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ flex: '1 1 120px', padding: '0.4rem 0.6rem', fontSize: '0.76rem', gap: '0.25rem' }}
                        onClick={() => handleSendToMessaging(row)}
                      >
                        <MessageSquare size={12} /> 알림장으로
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {concernRows.length > 8 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.75rem' }}>
                  상위 8명만 표시했습니다. 전체 목록은 아래 학생별 출결 현황에서 확인하세요.
                </p>
              )}
            </div>
          )}

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
            <div className="table-wrapper mobile-card-desktop">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>이름</th>
                    <th style={{ width: '130px' }}>학교 / 학년</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>출석</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>결석</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>보강</th>
                    <th style={{ minWidth: '160px' }}>출석률</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>알림장</th>
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
                      <td style={{ textAlign: 'center' }}>
                        {row.total === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>—</span>
                        ) : (
                          <>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', gap: '0.25rem' }}
                              title={row.parentContact ? `학부모 연락처: ${row.parentContact}` : '학부모 연락처가 등록되지 않았습니다'}
                              onClick={() => handleCopyMessage(row)}
                            >
                              {copiedId === row.studentId ? (
                                <>
                                  <Check size={12} className="text-success" /> 복사됨
                                </>
                              ) : (
                                <>
                                  <Copy size={12} /> 출결 안내
                                </>
                              )}
                            </button>
                            {onSendDraftToMessaging && (
                              <button
                                className="btn btn-primary"
                                style={{ marginLeft: '0.35rem', padding: '0.35rem 0.6rem', fontSize: '0.75rem', gap: '0.25rem' }}
                                title="출결 안내문을 알림장 조립기로 보내기"
                                onClick={() => handleSendToMessaging(row)}
                              >
                                <MessageSquare size={12} /> 보내기
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {studentRows.map(row => (
                <div key={`${row.studentId}-mobile`} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.school || '교습소'} · {row.grade.split(' ')[1] || row.grade}</span>
                    </div>
                    <strong style={{ color: row.total === 0 ? 'var(--color-text-muted)' : rateColor(row.rate), fontSize: '1rem' }}>
                      {row.total === 0 ? '기록 없음' : `${row.rate}%`}
                    </strong>
                  </div>

                  <div className="mobile-stat-strip">
                    <span className="badge badge-present">출석 {row.present}</span>
                    <span className="badge badge-absent">결석 {row.absent}</span>
                    <span className="badge badge-makeup">보강 {row.makeup}</span>
                  </div>

                  {row.total > 0 && (
                    <>
                      <div className="mobile-progress">
                        <div style={{ width: `${row.rate}%`, backgroundColor: rateColor(row.rate) }} />
                      </div>
                      <div className="mobile-card-actions">
                        <button className="btn btn-secondary" onClick={() => handleCopyMessage(row)}>
                          {copiedId === row.studentId ? <><Check size={14} className="text-success" /> 복사됨</> : <><Copy size={14} /> 출결 안내</>}
                        </button>
                        {onSendDraftToMessaging && (
                          <button className="btn btn-primary" onClick={() => handleSendToMessaging(row)}>
                            <MessageSquare size={14} /> 보내기
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.85rem' }}>
              ※ 출석률 = (출석 + 보강) ÷ 전체 기록. 활성 재원생 {studentRows.length}명 기준이며, 보강은 출석으로 인정합니다.
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
                  const attended = records.filter(r => normalizeAttendanceStatus(r.status) !== 'absent').length;
                  const rate = total > 0 ? Math.round((attended / total) * 100) : -1;
                  return (
                    <div key={cls.id} className="class-rate-row">
                      <span className="class-rate-name">
                        {cls.name}
                      </span>
                      <div className="class-rate-bar">
                        {rate >= 0 && (
                          <div style={{ width: `${rate}%`, height: '100%', backgroundColor: rateColor(rate) }} />
                        )}
                      </div>
                      <span className="class-rate-value">
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
