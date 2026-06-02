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
                      <button className="at-act primary" onClick={() => flash('알림장 조립기로 전달했어요')}><Icon name="msg" size={13} /> 알림장</button>
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
    </div>
  );
}

window.GrowingCounsel = GrowingCounsel;
})();
