/* 그로잉영어 — 알림장 (종합알림장 전용 · 선생님 편집 가능)
   window.GrowingMessaging({ variant })
   · 발송 대기 = 오늘 활동이 있는 "학생별 종합" 1행
   · 종합 알림장 본문은 선생님이 직접 수정 가능(textarea) */
(function () {
const { useState, useMemo, useEffect } = React;
const Icon = window.GDIcon;

function GrowingMessaging({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);
  const active = D.students.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  // 오늘 학생별 종합 요약
  const summaryFor = (sid) => {
    const recs = D.attendance.filter(a => a.studentId === sid && a.date === D.TODAY);
    const kin = D.kioskAlerts.filter(a => a.studentId === sid && a.kind === 'in').map(a => a.time);
    const kout = D.kioskAlerts.filter(a => a.studentId === sid && a.kind === 'out').map(a => a.time);
    const inT = [...recs.map(r => r.checkInTime).filter(Boolean), ...kin][0] || '-';
    const outT = [...recs.map(r => r.checkOutTime).filter(Boolean), ...kout][0] || '-';
    const hwRaw = recs.find(r => r.homeworkStatus)?.homeworkStatus || D.homeworkAlerts.find(a => a.studentId === sid)?.homeworkStatus || '';
    const hw = hwRaw === 'done' ? '완료' : hwRaw === 'incomplete' ? '미흡' : hwRaw === 'undone' ? '안함' : '-';
    const makeup = recs.some(r => r.status === 'makeup');
    return { in: inT, out: outT, hw, hwRaw, makeup };
  };

  const buildMsg = (sid) => {
    const s = summaryFor(sid);
    const n = studentById[sid]?.name || '';
    return `[그로잉영어] ${n} 오늘의 수업 안내 🌱\n\n✅ 등원: ${s.in}\n🏡 하원: ${s.out}\n📝 숙제: ${s.hw}\n🔄 보강: ${s.makeup ? '보강 수업 진행' : '없음'}\n\n오늘도 수고했어요! 감사합니다 😊`;
  };

  // 발송 대기: 오늘 활동(출결/등하원/숙제)이 있는 재원생
  const candidates = useMemo(() => {
    const set = new Set();
    D.attendance.filter(a => a.date === D.TODAY).forEach(a => set.add(a.studentId));
    D.kioskAlerts.forEach(a => set.add(a.studentId));
    D.homeworkAlerts.forEach(a => set.add(a.studentId));
    return [...set].map(sid => studentById[sid]).filter(s => s && s.status === 'active')
      .map(s => ({ student: s, sum: summaryFor(s.id) }))
      .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ko'));
  }, [D, studentById]);

  const [dismissed, setDismissed] = useState([]);
  const [selIds, setSelIds] = useState([]);
  const queue = candidates.filter(c => !dismissed.includes(c.student.id));
  const toggle = (id) => setSelIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const dismiss = (id) => { setDismissed(d => [...d, id]); setSelIds(s => s.filter(x => x !== id)); };
  const dismissSel = () => { setDismissed(d => [...d, ...selIds]); flash(`${selIds.length}명 종합 알림장 발송 완료`); setSelIds([]); };

  // 편집기
  const [stuId, setStuId] = useState(candidates[0]?.student.id || 's1');
  const [draft, setDraft] = useState(() => buildMsg(candidates[0]?.student.id || 's1'));
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(buildMsg(stuId)); setEdited(false); /* eslint-disable-next-line */ }, [stuId]);

  const stu = studentById[stuId];
  const sum = summaryFor(stuId);
  const loadStudent = (sid) => { setStuId(sid); };
  const resetDraft = () => { setDraft(buildMsg(stuId)); setEdited(false); flash('자동 생성 내용으로 되돌렸어요'); };
  const copyMsg = () => { if (navigator.clipboard) navigator.clipboard.writeText(draft).catch(() => {}); setCopied(true); flash('알림장 본문을 복사했어요'); setTimeout(() => setCopied(false), 1800); };

  const Chip = ({ k, v, tone }) => <span className={`msg-chip ${tone || ''}`}><b>{k}</b> {v}</span>;

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 발송 대기 — 학생별 종합 */}
      {queue.length > 0 && (
        <section className="gd-card">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Icon name="bell" size={18} /> 오늘 종합 알림장 발송 대기 <span className="cl-count">{queue.length}명</span></h2>
            <button className="pay-btn ghost sm" disabled={!selIds.length} onClick={dismissSel}><Icon name="check" size={13} /> 선택 {selIds.length || ''} 발송 완료</button>
          </div>
          <div className="msg-srows">
            {queue.map(({ student: s, sum }) => {
              const sel = selIds.includes(s.id);
              const isLoaded = stuId === s.id;
              return (
                <div className={`msg-srow ${sel ? 'sel' : ''} ${isLoaded ? 'loaded' : ''}`} key={s.id}>
                  <button className="msg-check" onClick={() => toggle(s.id)} aria-label="선택">
                    <span className={`msg-box ${sel ? 'on' : ''}`}>{sel && <Icon name="check" size={12} />}</span>
                  </button>
                  <div className="msg-srow-id">
                    <b>{s.name}</b><span>{s.grade}</span>
                    {!s.parentContact && <span className="msg-nocontact">연락처 없음</span>}
                  </div>
                  <div className="msg-sum">
                    <Chip k="등원" v={sum.in} tone="ok" />
                    <Chip k="하원" v={sum.out} tone="info" />
                    <Chip k="숙제" v={sum.hw} tone={sum.hwRaw === 'done' ? 'ok' : sum.hwRaw ? 'warn' : ''} />
                    {sum.makeup && <Chip k="보강" v="진행" tone="warn" />}
                  </div>
                  <div className="msg-srow-acts">
                    <button className={`at-act ${isLoaded ? 'primary' : ''}`} onClick={() => loadStudent(s.id)}><Icon name="msg" size={12} /> 편집</button>
                    {s.parentContact && <button className="at-act" onClick={() => { dismiss(s.id); flash(`${s.name} 알림톡 발송 요청`); }}><Icon name="send" size={12} /> 알림톡</button>}
                    <button className="at-act" onClick={() => dismiss(s.id)}>완료</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 종합 알림장 — 편집 + 미리보기 */}
      <div className="msg-main">
        <section className="gd-card">
          <div className="gd-card-head" style={{ marginBottom: '0.9rem' }}>
            <h2 className="gd-card-title"><Icon name="msg" size={18} /> 종합 알림장 {edited && <span className="msg-edited">수정됨</span>}</h2>
            <button className="pay-btn ghost sm" onClick={resetDraft}><Icon name="refresh" size={13} /> 자동 생성</button>
          </div>
          <label className="msg-label">대상 원생</label>
          <select className="msg-select" value={stuId} onChange={e => setStuId(e.target.value)}>
            {active.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
          </select>
          {stu && (
            <div className="msg-today">
              <div><b>✅ 등원</b> {sum.in}</div><div><b>🏡 하원</b> {sum.out}</div>
              <div><b>📝 숙제</b> {sum.hw}</div><div><b>🔄 보강</b> {sum.makeup ? '진행' : '없음'}</div>
            </div>
          )}
          <label className="msg-label" style={{ marginTop: '0.9rem' }}>알림장 내용 <em className="msg-label-hint">— 선생님이 자유롭게 고칠 수 있어요</em></label>
          <textarea className="msg-edit" value={draft} onChange={e => { setDraft(e.target.value); setEdited(true); }} rows={mobile ? 8 : 10} />
        </section>

        <section className="gd-card msg-preview">
          <h2 className="gd-card-title" style={{ marginBottom: '0.85rem' }}><Icon name="phone" size={18} /> 미리보기</h2>
          <div className="msg-bubble-wrap">
            <div className="msg-bubble">{draft}</div>
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
