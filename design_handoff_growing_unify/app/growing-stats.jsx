/* 그로잉영어 — 출결 통계 리디자인
   window.GrowingStats({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;
const norm = (s) => (s === 'late' ? 'present' : s);
const rateColor = (r) => r >= 90 ? '#10b981' : r >= 75 ? '#f59e0b' : '#ef4444';

function GrowingStats({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const activeIds = useMemo(() => new Set(D.students.filter(s => s.status === 'active').map(s => s.id)), [D]);

  const months = useMemo(() => {
    const set = new Set(D.attendance.map(a => a.date.substring(0, 7)));
    set.add('2026-06');
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [D]);
  const [month, setMonth] = useState('2026-05');

  const recs = useMemo(() => D.attendance.filter(a => a.date.startsWith(month) && activeIds.has(a.studentId)), [D, month, activeIds]);
  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, makeup: 0 };
    recs.forEach(r => t[norm(r.status)]++);
    const total = t.present + t.absent + t.makeup;
    return { ...t, total, rate: total ? Math.round(((t.present + t.makeup) / total) * 100) : 0 };
  }, [recs]);

  const rows = useMemo(() => D.students.filter(s => s.status === 'active').map(s => {
    const rs = recs.filter(r => r.studentId === s.id).map(r => norm(r.status));
    const present = rs.filter(x => x === 'present').length, absent = rs.filter(x => x === 'absent').length, makeup = rs.filter(x => x === 'makeup').length;
    const total = rs.length, rate = total ? Math.round(((present + makeup) / total) * 100) : -1;
    return { s, present, absent, makeup, total, rate };
  }).sort((a, b) => {
    if (a.total === 0 && b.total === 0) return 0; if (a.total === 0) return 1; if (b.total === 0) return -1;
    return a.rate - b.rate || b.absent - a.absent;
  }), [recs, D]);

  const trend = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return [2, 1, 0].map(i => {
      const d = new Date(y, m - 1 - i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const rr = D.attendance.filter(a => a.date.startsWith(mo) && activeIds.has(a.studentId));
      const att = rr.filter(r => norm(r.status) !== 'absent').length;
      return { mo, label: `${d.getMonth() + 1}월`, rate: rr.length ? Math.round((att / rr.length) * 100) : -1, sel: i === 0 };
    });
  }, [D, month, activeIds]);

  const unpaidIds = useMemo(() => new Set(D.payments.filter(p => p.billingMonth === month && p.status === 'unpaid').map(p => p.studentId)), [D, month]);
  const risk = rows.map(r => ({ ...r, unpaid: unpaidIds.has(r.s.id) })).filter(r => (r.total > 0 && (r.rate < 80 || r.absent >= 3)) || r.unpaid);
  const concern = rows.filter(r => r.total > 0 && (r.rate < 80 || r.absent >= 3)).length;
  const mLabel = `${month.split('-')[0]}년 ${Number(month.split('-')[1])}월`;
  const dist = [['present', '출석', '#10b981'], ['absent', '결석', '#ef4444'], ['makeup', '보강', '#3b82f6']];
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const classRates = D.classes.map(c => {
    const rr = recs.filter(r => r.classId === c.id);
    const att = rr.filter(r => norm(r.status) !== 'absent').length;
    return { c, total: rr.length, rate: rr.length ? Math.round((att / rr.length) * 100) : -1 };
  });

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      <div className="st-statbar">
        <div><h2 className="gd-card-title" style={{ marginBottom: '0.2rem' }}><Icon name="chart" size={18} /> 월별 출결 통계</h2>
          <p className="st-statbar-sub">선택한 달의 출석률과 관리가 필요한 학생을 한눈에 봅니다.</p></div>
        <select className="msg-select st-monthsel" value={month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m.split('-')[0]}년 {Number(m.split('-')[1])}월</option>)}
        </select>
      </div>

      {/* KPI */}
      <div className="gd-stats stat4">
        <div className="gd-stat"><div className="gd-stat-ic" style={{ background: '#e9f8f1', color: '#10b981' }}><Icon name="checkCircle" /></div><div className="gd-stat-body"><span className="gd-stat-label">전체 출석률</span><span className="gd-stat-val">{totals.rate}<em>%</em></span><span className="gd-stat-foot" style={{ color: 'var(--g-muted)' }}>{totals.total}건 기준</span></div></div>
        <div className="gd-stat"><div className="gd-stat-ic" style={{ background: '#fdeaea', color: '#ef4444' }}><Icon name="trend" /></div><div className="gd-stat-body"><span className="gd-stat-label">결석</span><span className="gd-stat-val">{totals.absent}<em>건</em></span><span className="gd-stat-foot" style={{ color: 'var(--g-muted)' }}>{totals.total ? Math.round(totals.absent / totals.total * 100) : 0}%</span></div></div>
        <div className="gd-stat"><div className="gd-stat-ic" style={{ background: '#e7f0fb', color: '#3b82f6' }}><Icon name="refresh" /></div><div className="gd-stat-body"><span className="gd-stat-label">보강</span><span className="gd-stat-val">{totals.makeup}<em>건</em></span><span className="gd-stat-foot" style={{ color: 'var(--g-muted)' }}>출석 인정</span></div></div>
        <div className="gd-stat gd-stat-danger"><div className="gd-stat-ic" style={{ background: '#fef3c7', color: '#b4710a' }}><Icon name="alert" /></div><div className="gd-stat-body"><span className="gd-stat-label">관리 필요</span><span className="gd-stat-val">{concern}<em>명</em></span><span className="gd-stat-foot" style={{ color: 'var(--g-muted)' }}>80%↓ · 결석3+</span></div></div>
      </div>

      <div className="stat-row2">
        {/* 3개월 추세 */}
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}><Icon name="chart" size={18} /> 최근 3개월 출석 추세</h2>
          <div className="stat-trend">
            {trend.map(t => (
              <div className="stat-tcol" key={t.mo}>
                <span className="stat-tv" style={{ color: t.rate >= 0 ? rateColor(t.rate) : 'var(--g-muted)' }}>{t.rate >= 0 ? `${t.rate}%` : '—'}</span>
                <div className="stat-tbar-bg"><div className="stat-tbar" style={{ height: `${t.rate >= 0 ? t.rate : 0}%`, background: t.rate >= 0 ? rateColor(t.rate) : '#d1d5db', opacity: t.sel ? 1 : 0.55 }} /></div>
                <span className="stat-tl" style={{ fontWeight: t.sel ? 800 : 500, color: t.sel ? 'var(--g-primary-dark)' : 'var(--g-text2)' }}>{t.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 상태 분포 */}
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}>출결 상태 분포</h2>
          <div className="stat-distbar">
            {dist.map(([k, , c]) => totals[k] > 0 && <div key={k} style={{ width: `${totals[k] / totals.total * 100}%`, background: c }} title={`${k} ${totals[k]}`} />)}
          </div>
          <div className="stat-legend">
            {dist.map(([k, l, c]) => <span key={k} className="stat-leg"><span className="stat-leg-dot" style={{ background: c }} />{l} <b>{totals[k]}건</b></span>)}
          </div>
        </section>
      </div>

      {/* 우선 관리 대상 */}
      {risk.length > 0 && (
        <section className="gd-card stat-risk">
          <div className="gd-card-head"><h2 className="gd-card-title">🚨 우선 관리 대상</h2><span className="gd-card-pill danger">{risk.length}명</span></div>
          <div className="stat-risk-list">
            {risk.map(r => (
              <div className="stat-risk-row" key={r.s.id}>
                <span className="stat-risk-name">{r.s.name}</span>
                <div className="stat-risk-tags">
                  {r.total > 0 && (r.rate < 80 || r.absent >= 3) && <span className="at-pill danger">출결 {r.rate}% · 결석 {r.absent}</span>}
                  {r.unpaid && <span className="at-pill warn">미납</span>}
                </div>
                <button className={`at-act ${copied === r.s.id ? 'done' : ''}`} onClick={() => { setCopied(r.s.id); flash(`${r.s.name} 출결 안내문 복사`); setTimeout(() => setCopied(null), 1500); }}>{copied === r.s.id ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />} 안내</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 학생별 출결 현황 */}
      <section className="gd-card">
        <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}>학생별 출결 현황 <span className="cl-count">출석률 낮은 순</span></h2>
        <div className="stat-thead"><span>이름</span><span className="ta-c">출석</span><span className="ta-c">결석</span><span className="ta-c">보강</span><span>출석률</span></div>
        <div className="stat-trows">
          {rows.map(r => (
            <div className="stat-trow" key={r.s.id}>
              <span className="stat-tn">{r.s.name} <em>{r.s.grade}</em></span>
              <span className="ta-c">{r.present}</span>
              <span className="ta-c" style={{ color: r.absent > 0 ? '#ef4444' : 'inherit', fontWeight: r.absent > 0 ? 800 : 400 }}>{r.absent}</span>
              <span className="ta-c">{r.makeup}</span>
              <span className="stat-rate">
                {r.total === 0 ? <em className="stat-norec">기록 없음</em> : <><div className="stat-rbar"><div style={{ width: `${r.rate}%`, background: rateColor(r.rate) }} /></div><b style={{ color: rateColor(r.rate) }}>{r.rate}%</b></>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 반별 출석률 */}
      <section className="gd-card">
        <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}>반별 출석률</h2>
        <div className="stat-classes">
          {classRates.map(({ c, total, rate }) => (
            <div className="stat-crow" key={c.id}>
              <span className="stat-cn" style={{ color: c.color }}>{c.name}</span>
              <div className="stat-cbar"><div style={{ width: `${rate >= 0 ? rate : 0}%`, background: rate >= 0 ? rateColor(rate) : '#d1d5db' }} /></div>
              <span className="stat-cv">{rate >= 0 ? `${rate}% (${total}건)` : '기록 없음'}</span>
            </div>
          ))}
        </div>
      </section>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingStats = GrowingStats;
})();
