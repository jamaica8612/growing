/* 그로잉영어 — 리디자인 대시보드 (인터랙티브)
   window.GrowingDashboard 로 노출. props: { variant: 'desktop' | 'mobile' } */
const { useState, useMemo, useEffect } = React;

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
function dayOf(dateStr) {
  return DAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* 진행률 도넛 링 */
function Ring({ value, total, size = 60, stroke = 7 }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3ece7" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct >= 1 ? 'var(--g-mint)' : 'var(--g-primary)'}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(.16,1,.3,1)' }}
      />
    </svg>
  );
}

/* 미니 아이콘 (lucide 대체용 인라인 SVG) */
const I = {
  book: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  msg: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  login: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m22 4-10 10.01-3-3" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
};
function Icon({ name, size = 18, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{I[name]}</svg>
  );
}

function GrowingDashboard({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const today = D.TODAY;
  const todayDay = dayOf(today);

  const activeIds = useMemo(() => new Set(D.students.filter(s => s.status === 'active').map(s => s.id)), [D]);
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);

  // 오늘 수업 (요일 매칭)
  const todayClasses = useMemo(() => {
    return D.classes
      .map(cls => {
        const sched = cls.schedules.find(s => s.day === todayDay);
        return sched ? { cls, sched } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.sched.startTime.localeCompare(b.sched.startTime));
  }, [D, todayDay]);

  // 출결 상태 (편집 가능) — key: `${sid}|${cid}`
  const [att, setAtt] = useState(() => {
    const m = {};
    D.attendance.forEach(a => {
      m[`${a.studentId}|${a.classId}`] = {
        status: a.status, checkInTime: a.checkInTime || '', checkOutTime: a.checkOutTime || '',
        homeworkStatus: a.homeworkStatus || '', makeupForDate: a.makeupForDate || '',
      };
    });
    return m;
  });

  // 기대 출결 쌍 (오늘 수업 × 재원생)
  const expected = useMemo(() => {
    const set = new Set();
    todayClasses.forEach(({ cls }) => cls.studentIds.forEach(sid => { if (activeIds.has(sid)) set.add(`${cls.id}|${sid}`); }));
    return set;
  }, [todayClasses, activeIds]);

  const checkedCount = useMemo(() => {
    let n = 0;
    expected.forEach(pair => {
      const [cid, sid] = pair.split('|');
      const rec = att[`${sid}|${cid}`];
      if (rec && (rec.checkInTime || rec.status === 'absent')) n++;
    });
    return n;
  }, [expected, att]);
  const totalExpected = expected.size;
  const unchecked = Math.max(totalExpected - checkedCount, 0);

  const makeupNames = useMemo(() =>
    Object.entries(att).filter(([, r]) => r.status === 'makeup')
      .map(([k]) => studentById[k.split('|')[0]]?.name).filter(Boolean), [att, studentById]);

  // 미납
  const unpaid = useMemo(() =>
    D.payments.filter(p => p.billingMonth === D.billingMonth && p.status === 'unpaid')
      .map(p => ({ ...p, student: studentById[p.studentId] }))
      .filter(p => p.student), [D, studentById]);
  const unpaidTotal = unpaid.reduce((s, p) => s + p.amount, 0);

  const frequentAbsent = D.pastAbsences.map(a => ({ name: studentById[a.studentId]?.name ?? '?', count: a.count }));

  // 인터랙션
  const setRec = (sid, cid, patch) => {
    setAtt(prev => {
      const k = `${sid}|${cid}`;
      const cur = prev[k] || { status: 'present', checkInTime: '', checkOutTime: '', homeworkStatus: '' };
      return { ...prev, [k]: { ...cur, ...patch } };
    });
  };
  const arrival = (sid, cid) => setRec(sid, cid, { status: 'present', checkInTime: nowHM() });
  const departure = (sid, cid) => setRec(sid, cid, { checkOutTime: nowHM() });
  const setHw = (sid, cid, hw) => setRec(sid, cid, { homeworkStatus: hw });

  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState(null);
  const copySMS = (item) => {
    const month = D.billingMonth.split('-')[1];
    const msg = `안녕하세요, 그로잉영어입니다. 🌱\n\n${item.student.name} 학생의 ${month}월 교육비(${item.amount.toLocaleString()}원) 수납 안내드립니다.\n\n바쁘시겠지만 기한 내에 확인 부탁드립니다. 감사합니다. 좋은 하루 보내세요!`;
    if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(() => {});
    setCopiedId(item.id);
    setToast(`${item.student.name} 학부모님 안내 메시지를 복사했어요`);
    setTimeout(() => setCopiedId(null), 1800);
    setTimeout(() => setToast(null), 2400);
  };

  const dateLabel = (() => {
    const d = new Date(`${today}T00:00:00`);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${todayDay})`;
  })();
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '오늘도 수고 많으세요' : '오늘 하루도 잘 마무리해요';

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* ── 인사 / 날짜 ── */}
      <header className="gd-hero">
        <div className="gd-hero-leaf" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c5-3 9-7 9-13 0-3-1-6-1-6s-4 1-7 4-4 7-4 10c0 0-2-1-3-3 0 0 0 5 6 8z" /></svg>
        </div>
        <div className="gd-hero-text">
          <span className="gd-hero-date">{dateLabel}</span>
          <h1 className="gd-hero-greet">지선쌤, {greet}</h1>
          <p className="gd-hero-sub">오늘은 {todayClasses.length}개 반 수업이 있고, 출결 {unchecked > 0 ? `${unchecked}명 체크가 남았어요.` : '체크를 모두 마쳤어요.'}</p>
        </div>
        {!mobile && (
          <label className="gd-datepick">
            <span>조회 날짜</span>
            <input type="date" defaultValue={today} className="gd-dateinput" />
          </label>
        )}
      </header>

      {/* ── 요약 타일 ── */}
      <div className="gd-stats">
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#eaf4ee', color: 'var(--g-primary)' }}><Icon name="book" /></div>
          <div className="gd-stat-body"><span className="gd-stat-label">오늘 수업</span><span className="gd-stat-val">{todayClasses.length}<em>개 반</em></span></div>
        </div>
        <div className="gd-stat gd-stat-ring">
          <Ring value={checkedCount} total={totalExpected} size={mobile ? 52 : 58} />
          <div className="gd-stat-body">
            <span className="gd-stat-label">출결 진행</span>
            <span className="gd-stat-val">{checkedCount}<em>/{totalExpected}명</em></span>
          </div>
        </div>
        <div className="gd-stat">
          <div className="gd-stat-ic" style={{ background: '#e7f0fb', color: 'var(--g-info)' }}><Icon name="refresh" /></div>
          <div className="gd-stat-body"><span className="gd-stat-label">오늘 보강</span><span className="gd-stat-val">{makeupNames.length}<em>명</em></span></div>
        </div>
        <div className={`gd-stat ${unpaid.length ? 'gd-stat-danger' : ''}`}>
          <div className="gd-stat-ic" style={{ background: unpaid.length ? '#fdeaea' : '#eaf4ee', color: unpaid.length ? 'var(--g-danger)' : 'var(--g-mint)' }}><Icon name="card" /></div>
          <div className="gd-stat-body"><span className="gd-stat-label">이번 달 미납</span><span className="gd-stat-val">{unpaid.length}<em>건</em></span>{unpaid.length > 0 && <span className="gd-stat-foot">{unpaidTotal.toLocaleString()}원</span>}</div>
        </div>
      </div>

      {/* ── 오늘의 브리핑 ── */}
      <section className="gd-brief">
        <div className="gd-brief-head">
          <span className="gd-brief-badge">🌅 오늘의 브리핑</span>
          <span className="gd-brief-meta">{dateLabel}</span>
        </div>
        <ul className="gd-brief-list">
          <li><span className="gd-dot gd-dot-primary" />오늘 수업 <b>{todayClasses.length}개 반</b> · {unchecked > 0 ? <>출결 미체크 <b className="t-warn">{unchecked}명</b> 남음</> : <>출결 체크 <b className="t-ok">완료</b> 👍</>}</li>
          {makeupNames.length > 0 && <li><span className="gd-dot gd-dot-info" />오늘 보강 <b>{makeupNames.length}명</b> ({makeupNames.join(', ')})</li>}
          <li><span className="gd-dot gd-dot-danger" />이번 달 미납 {unpaid.length > 0 ? <><b className="t-danger">{unpaid.length}건</b> ({unpaidTotal.toLocaleString()}원) — 우측에서 안내 발송</> : <><b className="t-ok">없음</b> 👍</>}</li>
          {frequentAbsent.length > 0 && <li><span className="gd-dot gd-dot-warn" />최근 2주 결석 잦은 학생: <b className="t-danger">{frequentAbsent.map(f => `${f.name}(${f.count}회)`).join(', ')}</b> — 상담 권장</li>}
        </ul>
      </section>

      {/* ── 본문 그리드 ── */}
      <div className="gd-main">
        {/* 출결·숙제 체크 */}
        <section className="gd-card gd-att">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Icon name="clock" size={18} /> 출결 · 숙제 체크</h2>
            <span className="gd-card-pill">{checkedCount}/{totalExpected} 완료</span>
          </div>
          <div className="gd-classes">
            {todayClasses.map(({ cls, sched }) => {
              const members = cls.studentIds.filter(id => activeIds.has(id));
              return (
                <div className="gd-class" key={cls.id}>
                  <div className="gd-class-head">
                    <span className="gd-class-bar" style={{ background: cls.color }} />
                    <span className="gd-class-name">{cls.name}</span>
                    <span className="gd-class-time">{sched.startTime}–{sched.endTime}</span>
                    <span className="gd-class-count">재원 {members.length}명</span>
                  </div>
                  <div className="gd-students">
                    {members.map(id => {
                      const st = studentById[id];
                      const rec = att[`${id}|${cls.id}`] || {};
                      const inT = rec.checkInTime, outT = rec.checkOutTime, hw = rec.homeworkStatus;
                      const isMakeup = rec.status === 'makeup';
                      return (
                        <div className={`gd-st ${inT ? 'is-in' : ''}`} key={id}>
                          <div className="gd-st-top">
                            <div className="gd-st-id">
                              <span className="gd-st-name">{st.name}{isMakeup && <span className="gd-st-tag">보강</span>}</span>
                              <span className="gd-st-meta">{st.school} {st.grade}</span>
                            </div>
                            {inT && <span className="gd-st-status">출석</span>}
                          </div>
                          <div className="gd-st-inout">
                            <button className={`gd-io ${inT ? 'on-in' : ''}`} onClick={() => arrival(id, cls.id)}>
                              <span className="gd-io-lbl">🌱 등원</span><span className="gd-io-t">{inT || '—'}</span>
                            </button>
                            <button className={`gd-io ${outT ? 'on-out' : ''}`} onClick={() => departure(id, cls.id)}>
                              <span className="gd-io-lbl">🏡 하원</span><span className="gd-io-t">{outT || '—'}</span>
                            </button>
                          </div>
                          <div className="gd-st-hw">
                            <span className="gd-hw-lbl">숙제</span>
                            <div className="gd-seg">
                              <button className={`gd-seg-b ${hw === 'done' ? 'sel ok' : ''}`} onClick={() => setHw(id, cls.id, 'done')}>완료</button>
                              <button className={`gd-seg-b ${hw === 'incomplete' ? 'sel warn' : ''}`} onClick={() => setHw(id, cls.id, 'incomplete')}>미흡</button>
                              <button className={`gd-seg-b ${hw === 'undone' ? 'sel danger' : ''}`} onClick={() => setHw(id, cls.id, 'undone')}>안함</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 미납 안내 도우미 */}
        <section className="gd-card gd-pay">
          <div className="gd-card-head">
            <h2 className="gd-card-title"><Icon name="bell" size={18} /> 미납 안내 도우미</h2>
            {unpaid.length > 0 && <span className="gd-card-pill danger">{unpaid.length}건</span>}
          </div>
          <p className="gd-pay-desc">{D.billingMonth.split('-')[1]}월 미납 학부모님께 보낼 안내 메시지를 복사하세요.</p>
          {unpaid.length === 0 ? (
            <div className="gd-empty"><Icon name="check" size={30} /><span>이번 달 미납이 없어요!</span></div>
          ) : (
            <div className="gd-pay-list">
              {unpaid.map(item => (
                <div className="gd-pay-item" key={item.id}>
                  <div className="gd-pay-row">
                    <div className="gd-pay-who">
                      <span className="gd-pay-name">{item.student.name} 어머니</span>
                      <span className="gd-pay-phone"><Icon name="phone" size={11} /> {item.student.parentContact || '연락처 없음'}</span>
                    </div>
                    <button className={`gd-copy ${copiedId === item.id ? 'done' : ''}`} disabled={!item.student.parentContact} onClick={() => copySMS(item)}>
                      {copiedId === item.id ? <><Icon name="check" size={13} /> 복사됨</> : <><Icon name="copy" size={13} /> 복사</>}
                    </button>
                  </div>
                  <div className="gd-pay-foot">
                    <span>{D.classes.find(c => c.studentIds.includes(item.studentId))?.name || '일반 과정'}</span>
                    <b>{item.amount.toLocaleString()}원</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingDashboard = GrowingDashboard;
window.GDIcon = Icon;
window.GDRing = Ring;
window.gdDayOf = dayOf;
window.gdNowHM = nowHM;
