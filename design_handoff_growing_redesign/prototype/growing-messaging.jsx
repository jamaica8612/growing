/* 그로잉영어 — 알림장 발송 리디자인
   window.GrowingMessaging({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;

const HW_LABEL = { done: '완료', incomplete: '미흡', undone: '안함' };
const TEMPLATES = [
  { v: 'in', l: '등원 완료 🌱' }, { v: 'out', l: '하원 완료 🏡' }, { v: 'homework', l: '과제 안내 📝' },
  { v: 'makeup', l: '보강 안내 🕒' }, { v: 'test', l: '평가 결과 🎯' }, { v: 'daily', l: '종합 알림장 📋' },
];

function GrowingMessaging({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);
  const active = D.students.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 대기 큐
  const [dismissed, setDismissed] = useState([]);
  const [selIds, setSelIds] = useState([]);
  const [filter, setFilter] = useState('all');
  const [copiedAlert, setCopiedAlert] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const rows = useMemo(() => {
    const k = D.kioskAlerts.map(a => ({ id: `k-${a.id}`, type: a.kind, label: a.kind === 'in' ? '등원' : '하원',
      badge: a.kind === 'in' ? 'ok' : 'info', studentId: a.studentId, time: a.time, date: a.date, createdAt: a.createdAt }));
    const h = D.homeworkAlerts.map(a => ({ id: `h-${a.id}`, type: 'homework', label: `숙제 ${HW_LABEL[a.homeworkStatus]}`,
      badge: a.homeworkStatus === 'done' ? 'ok' : a.homeworkStatus === 'incomplete' ? 'warn' : 'danger', studentId: a.studentId, date: a.date, createdAt: a.createdAt }));
    return [...k, ...h].filter(r => !dismissed.includes(r.id)).sort((a, b) => b.createdAt - a.createdAt);
  }, [D, dismissed]);

  const shown = rows.filter(r => filter === 'all' || (filter === 'missing' ? !studentById[r.studentId]?.parentContact : r.type === filter));
  const toggle = (id) => setSelIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const dismiss = (id) => { setDismissed(d => [...d, id]); setSelIds(s => s.filter(x => x !== id)); };
  const dismissSel = () => { setDismissed(d => [...d, ...selIds]); setSelIds([]); flash(`${selIds.length}건 발송 완료 처리`); };

  // 조립기
  const [stuId, setStuId] = useState('s1');
  const [tpl, setTpl] = useState('daily');
  const [time, setTime] = useState('15:00');
  const [testName, setTestName] = useState('단어 단원 평가');
  const [score, setScore] = useState('95/100');
  const [copied, setCopied] = useState(false);

  const stu = studentById[stuId];
  const todayRecs = D.attendance.filter(a => a.studentId === stuId && a.date === D.TODAY);
  const summary = {
    in: todayRecs.map(a => a.checkInTime).filter(Boolean).join(', ') || '-',
    out: todayRecs.map(a => a.checkOutTime).filter(Boolean).join(', ') || '-',
    hw: (() => { const h = todayRecs[0]?.homeworkStatus; return h === 'done' ? '완료 ✅' : h === 'incomplete' ? '미흡 📝' : h === 'undone' ? '미완 ❌' : '미기록'; })(),
    makeup: todayRecs.some(a => a.status === 'makeup') ? '보강 수업' : '없음',
  };

  const compiled = useMemo(() => {
    if (!stu) return '';
    const n = stu.name;
    switch (tpl) {
      case 'in': return `[그로잉영어] ${n} 학생이 ${time}에 안전하게 등원했습니다. 🌱`;
      case 'out': return `[그로잉영어] ${n} 학생이 ${time}에 하원했습니다. 오늘도 수고했어요! 🏡`;
      case 'homework': return `안녕하세요, 그로잉영어입니다. 🌱\n\n${n} 학생의 오늘 과제가 미흡하여 안내드립니다. 가정에서 한 번 더 확인 부탁드립니다. 감사합니다.`;
      case 'makeup': return `안녕하세요, 그로잉영어입니다. 🌱\n\n${n} 학생의 보강 수업을 ${time}에 진행할 예정입니다. 참고 부탁드립니다.`;
      case 'test': return `안녕하세요, 그로잉영어입니다. 🌱\n\n${n} 학생의 ${testName} 결과를 안내드립니다.\n- 점수: ${score}\n\n꾸준히 잘 따라오고 있습니다. 격려 부탁드려요! 😊`;
      case 'daily': return `[그로잉영어] ${n} 오늘의 수업 안내 🌱\n\n✅ 등원: ${summary.in}\n🏡 하원: ${summary.out}\n📝 숙제: ${summary.hw}\n🔄 보강: ${summary.makeup}\n\n오늘도 수고했어요! 감사합니다 😊`;
      default: return '';
    }
  }, [stu, tpl, time, testName, score, summary]);

  const copyMsg = () => { if (navigator.clipboard) navigator.clipboard.writeText(compiled).catch(() => {}); setCopied(true); flash('알림장 본문을 복사했어요'); setTimeout(() => setCopied(false), 1800); };

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 발송 대기 큐 */}
      {rows.length > 0 && (
        <section className="gd-card msg-queue">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Icon name="bell" size={18} /> 알림장 발송 대기 <span className="cl-count">{rows.length}건</span></h2>
            <div className="msg-q-actions">
              <button className="pay-btn ghost sm" disabled={!selIds.length} onClick={dismissSel}><Icon name="check" size={13} /> 선택 완료</button>
            </div>
          </div>
          <div className="msg-filters">
            {[['all', `전체 ${rows.length}`], ['in', `등원 ${rows.filter(r => r.type === 'in').length}`], ['out', `하원 ${rows.filter(r => r.type === 'out').length}`], ['homework', `숙제 ${rows.filter(r => r.type === 'homework').length}`], ['missing', `연락처 없음 ${rows.filter(r => !studentById[r.studentId]?.parentContact).length}`]].map(([v, l]) => (
              <button key={v} className={`at-chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          <div className="msg-qlist">
            {shown.length === 0 ? <div className="msg-q-empty">이 필터에 해당하는 대기 알림이 없습니다.</div> :
              shown.map(r => {
                const s = studentById[r.studentId];
                const sel = selIds.includes(r.id);
                return (
                  <div className={`msg-qrow ${sel ? 'sel' : ''}`} key={r.id}>
                    <button className="msg-check" onClick={() => toggle(r.id)} aria-label="선택">
                      <span className={`msg-box ${sel ? 'on' : ''}`}>{sel && <Icon name="check" size={12} />}</span>
                    </button>
                    <span className={`at-pill ${r.badge}`}>{r.label}</span>
                    <span className="msg-qname">{s?.name || '알수없음'}</span>
                    <span className="msg-qtime">{r.time || r.date}</span>
                    <span className={`msg-qcontact ${s?.parentContact ? '' : 'none'}`}>{s?.parentContact ? `📞 ${s.parentContact}` : '연락처 없음'}</span>
                    <div className="msg-qbtns">
                      <button className={`at-act ${copiedAlert === r.id ? 'done' : ''}`} onClick={() => { setCopiedAlert(r.id); flash('복사했어요'); setTimeout(() => setCopiedAlert(null), 1400); }}>{copiedAlert === r.id ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />} 복사</button>
                      {s?.parentContact && <button className="at-act primary" onClick={() => { dismiss(r.id); flash('알림톡 발송 요청'); }}><Icon name="send" size={12} /> 알림톡</button>}
                      <button className="at-act" onClick={() => dismiss(r.id)}>완료</button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 조립기 + 미리보기 */}
      <div className="msg-main">
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}><Icon name="msg" size={18} /> 알림장 조립기</h2>
          <label className="msg-label">대상 원생</label>
          <select className="msg-select" value={stuId} onChange={e => setStuId(e.target.value)}>
            {active.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
          </select>
          {stu && (
            <div className="msg-today">
              <div><b>✅ 등원</b> {summary.in}</div><div><b>🏡 하원</b> {summary.out}</div>
              <div><b>📝 숙제</b> {summary.hw}</div><div><b>🔄 보강</b> {summary.makeup}</div>
            </div>
          )}
          <label className="msg-label">템플릿 유형</label>
          <div className="msg-tpls">
            {TEMPLATES.map(t => <button key={t.v} className={`msg-tpl ${tpl === t.v ? 'on' : ''}`} onClick={() => setTpl(t.v)}>{t.l}</button>)}
          </div>
          {(tpl === 'in' || tpl === 'out' || tpl === 'makeup') && (
            <div className="msg-params"><label className="msg-label">시간</label><input type="time" className="msg-select" value={time} onChange={e => setTime(e.target.value)} /></div>
          )}
          {tpl === 'test' && (
            <div className="msg-params msg-params2">
              <div><label className="msg-label">평가명</label><input className="msg-select" value={testName} onChange={e => setTestName(e.target.value)} /></div>
              <div><label className="msg-label">점수</label><input className="msg-select" value={score} onChange={e => setScore(e.target.value)} /></div>
            </div>
          )}
        </section>

        <section className="gd-card msg-preview">
          <h2 className="gd-card-title" style={{ marginBottom: '0.85rem' }}><Icon name="phone" size={18} /> 미리보기</h2>
          <div className="msg-bubble-wrap">
            <div className="msg-bubble">{compiled}</div>
          </div>
          <div className="msg-send">
            <button className={`pay-btn ghost ${copied ? 'cdone' : ''}`} onClick={copyMsg}>{copied ? <><Icon name="check" size={15} /> 복사 완료</> : <><Icon name="copy" size={15} /> 카카오톡 본문 복사</>}</button>
            <button className="pay-btn primary" disabled={!stu?.parentContact} onClick={() => flash('문자 앱으로 전달했어요')}><Icon name="send" size={15} /> 문자 전송</button>
          </div>
          {stu && <p className="msg-contact">📞 학부모 연락처: {stu.parentContact || '등록되지 않음'}</p>}
        </section>
      </div>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingMessaging = GrowingMessaging;
})();
