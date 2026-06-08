/* 그로잉영어 — 출결 관리 리디자인 (인터랙티브)
   window.GrowingAttendance({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;
const nowHM = window.gdNowHM;
const dayOf = window.gdDayOf;

const STATUS_META = {
  present: { label: '출석', cls: 'ok' },
  absent: { label: '결석', cls: 'danger' },
  makeup: { label: '보강', cls: 'info' },
  late: { label: '지각', cls: 'warn' },
};

function GrowingAttendance({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const today = D.TODAY;
  const todayDay = dayOf(today);
  const activeIds = useMemo(() => new Set(D.students.filter(s => s.status === 'active').map(s => s.id)), [D]);
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);

  const [classFilter, setClassFilter] = useState('all');

  const todayClasses = useMemo(() =>
    D.classes.map(cls => {
      const sched = cls.schedules.find(s => s.day === todayDay);
      return sched ? { cls, sched } : null;
    }).filter(Boolean).sort((a, b) => a.sched.startTime.localeCompare(b.sched.startTime)),
  [D, todayDay]);

  const [att, setAtt] = useState(() => {
    const m = {};
    D.attendance.forEach(a => { m[`${a.studentId}|${a.classId}`] = {
      status: a.status, checkInTime: a.checkInTime || '', checkOutTime: a.checkOutTime || '',
      homeworkStatus: a.homeworkStatus || '', memo: a.memo || '',
    }; });
    return m;
  });
  const recOf = (sid, cid) => att[`${sid}|${cid}`] || {};
  const setRec = (sid, cid, patch) => setAtt(prev => {
    const k = `${sid}|${cid}`;
    return { ...prev, [k]: { ...(prev[k] || { status: 'present' }), ...patch } };
  });

  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(null);
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const setStatus = (sid, cid, status) => {
    const cur = recOf(sid, cid);
    setRec(sid, cid, { status, checkInTime: status === 'present' && !cur.checkInTime ? nowHM() : cur.checkInTime });
  };
  const arrival = (sid, cid) => setRec(sid, cid, { status: 'present', checkInTime: nowHM() });
  const departure = (sid, cid) => setRec(sid, cid, { checkOutTime: nowHM() });
  const setHw = (sid, cid, hw) => setRec(sid, cid, { homeworkStatus: hw });
  const setMemo = (sid, cid, memo) => setRec(sid, cid, { memo });
  const copyKakao = (sid, cid, name) => {
    if (navigator.clipboard) navigator.clipboard.writeText(`${name} 학생 숙제 안내드립니다. 🌱`).catch(() => {});
    setCopied(`${sid}|${cid}`); flash(`${name} 학부모 안내 메시지를 복사했어요`);
    setTimeout(() => setCopied(null), 1600);
  };

  // 표시 대상
  const groups = todayClasses.filter(({ cls }) => classFilter === 'all' || cls.id === classFilter);

  // 일자 요약
  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, makeup: 0, unchecked: 0, total: 0 };
    todayClasses.forEach(({ cls }) => cls.studentIds.filter(id => activeIds.has(id)).forEach(id => {
      s.total++;
      const r = recOf(id, cls.id);
      if (!r.checkInTime && r.status !== 'absent' && r.status !== 'makeup') { s.unchecked++; }
      else if (r.status === 'absent') s.absent++;
      else if (r.status === 'makeup') s.makeup++;
      else if (r.status === 'late') s.late++;
      else s.present++;
    }));
    return s;
  }, [todayClasses, att, activeIds]);

  const dateLabel = (() => { const d = new Date(`${today}T00:00:00`); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${todayDay})`; })();

  const Seg = ({ value, options, onSel }) => (
    <div className="gd-seg at-seg">
      {options.map(o => (
        <button key={o.v} className={`gd-seg-b ${value === o.v ? 'sel ' + o.c : ''}`} onClick={() => onSel(o.v)}>{o.l}</button>
      ))}
    </div>
  );

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 필터 바 */}
      <div className="at-filterbar">
        <div className="at-filter-left">
          <label className="at-datepick"><span>출결 기준일</span>
            <input type="date" defaultValue={today} className="gd-dateinput" /></label>
          <div className="at-chips">
            <button className={`at-chip ${classFilter === 'all' ? 'on' : ''}`} onClick={() => setClassFilter('all')}>전체 반</button>
            {todayClasses.map(({ cls }) => (
              <button key={cls.id} className={`at-chip ${classFilter === cls.id ? 'on' : ''}`} onClick={() => setClassFilter(cls.id)}>
                <span className="at-chip-dot" style={{ background: cls.color }} />{cls.name}
              </button>
            ))}
          </div>
        </div>
        <span className="at-hint">💡 버튼을 누르면 즉시 자동 저장돼요</span>
      </div>

      {/* 일자 요약 스트립 */}
      <div className="at-summary">
        <div className="at-sum-date"><Icon name="calendar" size={16} /> {dateLabel}</div>
        <div className="at-sum-chips">
          <span className="at-sum ok">출석 <b>{summary.present}</b></span>
          <span className="at-sum warn">지각 <b>{summary.late}</b></span>
          <span className="at-sum danger">결석 <b>{summary.absent}</b></span>
          <span className="at-sum info">보강 <b>{summary.makeup}</b></span>
          <span className="at-sum muted">미체크 <b>{summary.unchecked}</b></span>
        </div>
      </div>

      {/* 반별 로스터 */}
      {groups.map(({ cls, sched }) => {
        const members = cls.studentIds.filter(id => activeIds.has(id));
        return (
          <section className="gd-card at-class" key={cls.id}>
            <div className="at-class-head">
              <span className="gd-class-bar" style={{ background: cls.color }} />
              <span className="gd-class-name">{cls.name}</span>
              <span className="gd-class-time">{sched.startTime}–{sched.endTime}</span>
              <span className="gd-class-count">재원 {members.length}명</span>
            </div>

            {!mobile && (
              <div className="at-table-head">
                <span>학생</span><span>등 · 하원</span><span>출결</span><span>숙제</span><span>비고 메모</span>
              </div>
            )}

            <div className="at-rows">
              {members.map(id => {
                const st = studentById[id];
                const r = recOf(id, cls.id);
                const sm = STATUS_META[r.status] || null;
                return (
                  <div className={`at-row ${r.checkInTime || r.status === 'absent' || r.status === 'makeup' ? 'done' : ''}`} key={id}>
                    <div className="at-cell at-who">
                      <span className="at-name">{st.name}{sm && <span className={`at-pill ${sm.cls}`}>{sm.label}</span>}</span>
                      <span className="at-meta">{st.school} {st.grade}</span>
                    </div>
                    <div className="at-cell at-io">
                      <button className={`gd-io ${r.checkInTime ? 'on-in' : ''}`} onClick={() => arrival(id, cls.id)}>
                        <span className="gd-io-lbl">🌱 등원</span><span className="gd-io-t">{r.checkInTime || '—'}</span></button>
                      <button className={`gd-io ${r.checkOutTime ? 'on-out' : ''}`} onClick={() => departure(id, cls.id)}>
                        <span className="gd-io-lbl">🏡 하원</span><span className="gd-io-t">{r.checkOutTime || '—'}</span></button>
                    </div>
                    <div className="at-cell">
                      {mobile && <span className="at-clabel">출결</span>}
                      <Seg value={r.status} onSel={(v) => setStatus(id, cls.id, v)}
                        options={[{ v: 'present', l: '출석', c: 'ok' }, { v: 'absent', l: '결석', c: 'danger' }, { v: 'makeup', l: '보강', c: 'info' }]} />
                    </div>
                    <div className="at-cell">
                      {mobile && <span className="at-clabel">숙제</span>}
                      <Seg value={r.homeworkStatus} onSel={(v) => setHw(id, cls.id, v)}
                        options={[{ v: 'done', l: '완료', c: 'ok' }, { v: 'incomplete', l: '미흡', c: 'warn' }, { v: 'undone', l: '안함', c: 'danger' }]} />
                    </div>
                    <div className="at-cell at-memo">
                      {mobile && <span className="at-clabel">비고</span>}
                      <input className="at-memo-in" placeholder="특이사항 메모…" value={r.memo || ''} onChange={(e) => setMemo(id, cls.id, e.target.value)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingAttendance = GrowingAttendance;
})();
