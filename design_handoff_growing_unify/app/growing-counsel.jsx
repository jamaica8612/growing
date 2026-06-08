/* 그로잉영어 — 상담/진도 일지 리디자인
   window.GrowingCounsel({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;

const TYPE_META = {
  counsel: { label: '상담', color: '#f59e0b', bg: '#fef6e7' },
  progress: { label: '진도', color: '#3b82f6', bg: '#eef4fc' },
  test: { label: '평가', color: '#10b981', bg: '#e9f8f1' },
};

function GrowingCounsel({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);

  const [logs, setLogs] = useState(() => [...D.counselLogs]);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  // 월간 성장 리포트 (기능 제안 4)
  const [showReport, setShowReport] = useState(false);
  const [reportStu, setReportStu] = useState('s3');
  const activeStudents = useMemo(() => D.students.filter(s => s.status === 'active'), [D]);
  const report = useMemo(() => {
    const recs = D.attendance.filter(a => a.studentId === reportStu && a.date >= '2026-05-01' && a.date <= '2026-05-31');
    const present = recs.filter(a => ['present', 'late', 'makeup'].includes(a.status)).length;
    const total = recs.length;
    const rate = total ? Math.round((present / total) * 100) : 0;
    const hwRecs = recs.filter(a => a.homeworkStatus);
    const hwDone = hwRecs.filter(a => a.homeworkStatus === 'done').length;
    const hwRate = hwRecs.length ? Math.round((hwDone / hwRecs.length) * 100) : 0;
    const tests = logs.filter(l => l.studentId === reportStu && l.type === 'test');
    const notes = logs.filter(l => l.studentId === reportStu && (l.type === 'counsel' || l.type === 'progress'));
    return { rate, total, present, hwRate, hwTotal: hwRecs.length, hwDone, tests, notes };
  }, [reportStu, logs]);
  const reportStudent = studentById[reportStu];

  const filtered = logs.filter(l => {
    const st = studentById[l.studentId];
    const okS = !search || l.title.includes(search) || l.content.includes(search) || (st && st.name.includes(search));
    const okT = typeF === 'all' || l.type === typeF;
    return okS && okT;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const counts = {
    all: logs.length,
    counsel: logs.filter(l => l.type === 'counsel').length,
    progress: logs.filter(l => l.type === 'progress').length,
    test: logs.filter(l => l.type === 'test').length,
  };

  const copyMsg = (l) => {
    const st = studentById[l.studentId];
    if (navigator.clipboard) navigator.clipboard.writeText(`안녕하세요, 그로잉영어입니다. 🌱\n\n${st?.name || '학생'} 학생의 ${TYPE_META[l.type].label} 내용을 안내드립니다.\n- 제목: ${l.title}\n\n${l.content}`).catch(() => {});
    setCopied(l.id); flash(`${st?.name || '학생'} 학부모 안내문을 복사했어요`);
    setTimeout(() => setCopied(null), 1600);
  };
  const del = (id) => { setLogs(prev => prev.filter(l => l.id !== id)); flash('일지를 삭제했어요'); };

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 툴바 */}
      <div className="cl-toolbar">
        <div className="pay-search cl-search"><Icon name="search" size={15} />
          <input placeholder="제목·내용·학생 검색…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="gd-seg cl-typeseg">
          {[{ v: 'all', l: `전체 ${counts.all}` }, { v: 'counsel', l: `상담 ${counts.counsel}` }, { v: 'progress', l: `진도 ${counts.progress}` }, { v: 'test', l: `평가 ${counts.test}` }].map(o => (
            <button key={o.v} className={`gd-seg-b ${typeF === o.v ? 'sel ok' : ''}`} onClick={() => setTypeF(o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="cl-tools-right">
          <button className="pay-btn ghost" onClick={() => setShowReport(true)}><Icon name="trend" size={15} /> 월간 리포트</button>
          <button className="pay-btn ghost"><Icon name="save" size={15} /> 내보내기</button>
          <button className="pay-btn primary"><Icon name="plus" size={15} /> 일지 등록</button>
        </div>
      </div>

      {/* 일지 타임라인 */}
      <section className="gd-card">
        <div className="gd-card-head">
          <h2 className="gd-card-title"><Icon name="msg" size={18} /> 상담 · 학습 일지 <span className="cl-count">{filtered.length}건</span></h2>
        </div>
        {filtered.length === 0 ? (
          <div className="gd-empty"><Icon name="msg" size={28} /><span>조건에 맞는 일지가 없어요</span></div>
        ) : (
          <div className="cl-list">
            {filtered.map(l => {
              const st = studentById[l.studentId];
              const m = TYPE_META[l.type] || TYPE_META.counsel;
              return (
                <div className="cl-log" key={l.id} style={{ borderLeftColor: m.color, background: m.bg }}>
                  <div className="cl-log-top">
                    <div className="cl-log-id">
                      <span className="cl-type" style={{ background: m.color }}>{m.label}</span>
                      <span className="cl-who">{st?.name || '퇴원생'} <em>{st ? `${st.school} ${st.grade}` : ''}</em></span>
                    </div>
                    <div className="cl-log-actions">
                      <span className="cl-date"><Icon name="calendar" size={12} /> {l.date}</span>
                      <button className={`at-act ${copied === l.id ? 'done' : ''}`} onClick={() => copyMsg(l)}>
                        {copied === l.id ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />} 안내 복사</button>
                      <button className="cl-del" onClick={() => del(l.id)} title="삭제"><Icon name="trash" size={14} /></button>
                    </div>
                  </div>
                  <div className="cl-title">{l.title}</div>
                  <p className="cl-content">{l.content}</p>
                  {l.type === 'test' && l.score && <span className="cl-score"><Icon name="trend" size={13} /> 평가 결과: {l.score}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}

      {showReport && reportStudent && (
        <div className="rp-bg" onClick={() => setShowReport(false)}>
          <div className="rp" onClick={e => e.stopPropagation()}>
            <div className="rp-head">
              <div className="rp-head-tx">
                <span className="rp-tag">🌱 월간 성장 리포트 · 2026년 5월</span>
                <h3>{reportStudent.name} <em>{reportStudent.school} {reportStudent.grade}</em></h3>
              </div>
              <button className="rp-x" onClick={() => setShowReport(false)} aria-label="닫기"><Icon name="plus" size={18} /></button>
            </div>
            <div className="rp-body">
              <select className="msg-select rp-pick" value={reportStu} onChange={e => setReportStu(e.target.value)}>
                {activeStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
              </select>
              <div className="rp-kpis">
                <div className="rp-kpi"><b>{report.rate}<em>%</em></b><span>출석률</span><small>{report.present}/{report.total}회</small></div>
                <div className="rp-kpi"><b>{report.hwRate}<em>%</em></b><span>숙제 수행</span><small>{report.hwDone}/{report.hwTotal}회</small></div>
                <div className="rp-kpi"><b>{report.tests.length}<em>건</em></b><span>평가 응시</span><small>5월 기준</small></div>
                <div className="rp-kpi"><b>{report.notes.length}<em>건</em></b><span>상담·진도</span><small>기록</small></div>
              </div>
              <div className="rp-sec">
                <h4><Icon name="trend" size={14} /> 평가 결과</h4>
                {report.tests.length === 0 ? <p className="rp-empty">이 달 평가 기록이 없어요.</p> :
                  report.tests.map(t => <div className="rp-row" key={t.id}><span>{t.title}</span><b>{t.score || '—'}</b></div>)}
              </div>
              <div className="rp-sec">
                <h4><Icon name="msg" size={14} /> 상담 · 진도 하이라이트</h4>
                {report.notes.length === 0 ? <p className="rp-empty">이 달 상담·진도 기록이 없어요.</p> :
                  report.notes.map(n => <div className="rp-note" key={n.id}><b>{n.title}</b><p>{n.content}</p></div>)}
              </div>
              <p className="rp-foot-note">⚙️ 규칙 기반 자동 초안이에요. AI는 호출하지 않으며, 보내기 전에 선생님이 확인·수정할 수 있어요.</p>
            </div>
            <div className="rp-foot">
              <button className="pay-btn ghost" onClick={() => flash('인쇄 / PDF 미리보기를 열었어요')}>🖨 인쇄 · PDF</button>
              <button className="pay-btn primary" onClick={() => { setShowReport(false); flash(`${reportStudent.name} 월간 리포트를 종합 알림장에 담았어요`); }}><Icon name="send" size={14} /> 종합 알림장으로</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.GrowingCounsel = GrowingCounsel;
})();
