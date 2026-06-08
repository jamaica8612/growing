/* ════════════════════════════════════════════════════════════
   통일 프로토타입 — 앱 셸 (새 IA: 그룹 사이드바 + 모바일 5탭+더보기)
   #root 에 마운트. 기존 10화면 + 새 4화면을 하나의 흐름으로 연결.
   ════════════════════════════════════════════════════════════ */
(function () {
  const { useState, useCallback } = React;

  const navIc = {
    dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    att: 'M3 4h18v18H3zM3 10h18M16 2v4M8 2v4M9 16l2 2 4-4',
    makeup: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    msg: 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
    kiosk: 'M2 3h20v14H2zM8 21h8M12 17v4',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z',
    clip: 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1zM8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 13l2 2 4-4',
    card: 'M2 5h20v14H2zM2 10h20',
    counsel: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    bar: 'M3 3v18h18M7 13v5M12 8v10M17 11v7',
    msgc: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    more: 'M4 6h16M4 12h16M4 18h16',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    send: 'm22 2-7 20-4-9-9-4Z M22 2 11 13',
  };
  function NIcon({ d, size = 18 }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.split(' M').map((p, i) => <path key={i} d={i === 0 ? p : 'M' + p} />)}</svg>;
  }

  const NAV_GROUPS = [
    { t: '그날 운영', items: [
      { id: 'dashboard', label: '오늘', ic: 'dash' },
      { id: 'attendance', label: '출결 관리', ic: 'att' },
      { id: 'makeup', label: '보강 · 보충', ic: 'makeup' },
      { id: 'messaging', label: '알림장', ic: 'msg', badge: 6 },
      { id: 'kiosk', label: '키오스크 시작', ic: 'kiosk', kiosk: true },
    ]},
    { t: '원생 · 수업', items: [
      { id: 'students', label: '학생 관리', ic: 'users' },
      { id: 'classes', label: '반 / 시간표', ic: 'book' },
      { id: 'exams', label: '평가 관리', ic: 'clip' },
      { id: 'payments', label: '수납 관리', ic: 'card' },
    ]},
    { t: '기록 · 분석', items: [
      { id: 'counsel', label: '상담 / 진도', ic: 'counsel' },
      { id: 'stats', label: '출결 통계', ic: 'bar' },
      { id: 'kakao', label: '카카오 채널', ic: 'msgc' },
      { id: 'dataquality', label: '데이터 점검', ic: 'shield' },
    ]},
  ];
  const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items).concat([{ id: 'settings', label: '설정', ic: 'gear' }]);

  // 화면 메타 + 렌더 + 맥락 액션(보고서: 내비 층 대신 본문 액션)
  const SCREENS = {
    dashboard:   { title: '오늘 운영', sub: '오늘 수업·출결·보강·미납 안내 후보를 한 화면에서 확인합니다.', C: () => window.GrowingDashboard, acts: [{ to: 'attendance', label: '출결 체크' }, { to: 'kiosk', label: '키오스크 시작', kiosk: true, primary: true }] },
    attendance:  { title: '출결 관리', sub: '날짜·반별 출결, 숙제, 보강 상태를 자세히 입력합니다.', C: () => window.GrowingAttendance, acts: [{ to: 'makeup', label: '보강 관리' }, { to: 'messaging', label: '알림장 발송', primary: true }] },
    makeup:      { title: '보강 · 보충', sub: '결석으로 생긴 보강 필요 항목과 수행한 보강/보충을 처리합니다.', C: () => window.GrowingMakeup, acts: [{ to: 'attendance', label: '출결 입력' }] },
    messaging:   { title: '학부모 소통 · 알림장', sub: '오늘의 등·하원·숙제·보강을 한 번에 묶은 종합 알림장을 보냅니다.', C: () => window.GrowingMessaging, acts: [{ to: 'kakao', label: '카카오 요청', primary: true }] },
    students:    { title: '학생 관리', sub: '학생 상세 타임라인·상담·출결·수납 이력을 관리합니다.', C: () => window.GrowingStudents, acts: [{ to: 'stats', label: '출결 리포트' }, { to: 'messaging', label: '학부모 안내', primary: true }] },
    classes:     { title: '반 / 시간표', sub: '주간 시간표·반별 인원·예상 수강료를 한눈에 봅니다.', C: () => window.GrowingClasses, acts: [{ to: 'attendance', label: '출결 입력' }, { to: 'exams', label: '평가 만들기', primary: true }] },
    exams:       { title: '평가 관리', sub: '시험 제작·배포·제출 현황·결과 안내를 관리합니다.', C: () => window.GrowingExams, acts: [{ to: 'messaging', label: '시험 결과 안내', primary: true }] },
    payments:    { title: '수납 관리', sub: '청구·납부·미납 현황과 매출 추이를 관리합니다.', C: () => window.GrowingPayments, acts: [{ to: 'messaging', label: '미납 안내 보내기', primary: true }, { to: 'students', label: '학생별 이력' }] },
    counsel:     { title: '상담 / 진도 일지', sub: '상담·진도·평가 기록을 학생별로 남깁니다.', C: () => window.GrowingCounsel, acts: [{ to: 'students', label: '학생 상세' }] },
    stats:       { title: '출결 통계', sub: '출석률 추세와 관리가 필요한 학생을 리포트로 봅니다.', C: () => window.GrowingStats, acts: [{ to: 'messaging', label: '관리 대상 안내', primary: true }] },
    kakao:       { title: '카카오 채널', sub: '학부모 카카오 요청과 채널 연동 상태를 확인합니다.', C: () => window.GrowingKakao, acts: [{ to: 'messaging', label: '알림장' }] },
    dataquality: { title: '데이터 점검', sub: '학생·반·출결·수납 데이터의 누락과 중복을 점검합니다.', C: () => window.GrowingDataQuality, acts: [] },
    settings:    { title: '설정', sub: '백업·복원, 키오스크 PIN, 아이비 기억·메모, 알림 템플릿을 관리합니다.', C: () => window.GrowingSettings, acts: [{ to: 'dataquality', label: '데이터 점검' }] },
    kiosk:       { title: '키오스크', sub: '', C: () => window.GrowingKiosk, acts: [] },
  };

  function Sidebar({ active, go, launchKiosk }) {
    return (
      <aside className="side">
        <div className="side-logo">
          <div className="side-logo-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg></div>
          <div className="side-logo-tx"><h1>그로잉영어</h1><span>GROWING ENGLISH</span></div>
        </div>
        {NAV_GROUPS.map(g => (
          <div className="side-group" key={g.t}>
            <div className="side-group-t">{g.t}</div>
            {g.items.map(it => (
              <button key={it.id} className={`side-item${active === it.id ? ' active' : ''}${it.kiosk ? ' kiosk' : ''}`}
                onClick={it.kiosk ? launchKiosk : () => go(it.id)}>
                <NIcon d={navIc[it.ic]} /> {it.label}
                {it.badge ? <span className="badge-n">{it.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
        <div className="side-foot">
          <button className={`side-item${active === 'settings' ? ' active' : ''}`} onClick={() => go('settings')}><NIcon d={navIc.gear} /> 설정</button>
        </div>
      </aside>
    );
  }

  function DesktopApp({ active, go, launchKiosk, toast }) {
    const s = SCREENS[active] || SCREENS.dashboard;
    const Comp = s.C();
    return (
      <div className="app-shell">
        <Sidebar active={active} go={go} launchKiosk={launchKiosk} />
        <main className="app-main">
          <div className="app-topbar">
            <div><h2>{s.title}</h2><p>{s.sub}</p></div>
            <div className="topbar-acts">
              {s.acts.map(a => (
                <button key={a.to + a.label} className={`tb-act${a.primary ? ' primary' : ''}`}
                  onClick={a.kiosk ? launchKiosk : () => go(a.to)}>
                  {a.primary ? <NIcon d={navIc.send} size={14} /> : null}{a.label}
                </button>
              ))}
              <button className="app-logout"><NIcon d={navIc.logout} size={15} /> 로그아웃</button>
            </div>
          </div>
          <div key={active} className="screen-in">
            {Comp ? <Comp variant="desktop" toast={toast} onNavigate={go} /> : <div className="gd-empty">화면을 불러오는 중…</div>}
          </div>
        </main>
      </div>
    );
  }

  const M_TABS = [
    { id: 'dashboard', label: '오늘', ic: 'dash' },
    { id: 'attendance', label: '출결', ic: 'att' },
    { id: 'messaging', label: '알림장', ic: 'msg', badge: 6 },
    { id: 'students', label: '학생', ic: 'users' },
    { id: 'more', label: '더보기', ic: 'more' },
  ];
  const M_PRIMARY = ['dashboard', 'attendance', 'messaging', 'students'];

  function MobileApp({ active, go, launchKiosk, toast }) {
    const [sheet, setSheet] = useState(false);
    const s = SCREENS[active] || SCREENS.dashboard;
    const Comp = s.C();
    const tabActive = M_PRIMARY.includes(active) ? active : null;
    return (
      <div className="m-app">
        <div className="m-header">
          <div className="m-header-logo">
            <div className="side-logo-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg></div>
            <span>{s.title}</span>
          </div>
          <button className="m-menu" onClick={() => setSheet(true)}><NIcon d={navIc.more} size={20} /></button>
        </div>
        <div className="m-body">
          {Comp ? <Comp variant="mobile" toast={toast} onNavigate={(t) => { go(t); }} /> : null}
        </div>
        <nav className="m-nav">
          {M_TABS.map(it => (
            <button key={it.id} className={(it.id === 'more' ? sheet : tabActive === it.id) ? 'active' : ''}
              onClick={() => it.id === 'more' ? setSheet(true) : go(it.id)}>
              <span style={{ position: 'relative' }}><NIcon d={navIc[it.ic]} size={20} />{it.badge ? <span className="badge-dot">{it.badge}</span> : null}</span>
              {it.label}
            </button>
          ))}
        </nav>

        {sheet && (
          <div className="sheet-bg" onClick={() => setSheet(false)}>
            <div className="sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-grip" />
              <h3>모든 메뉴</h3>
              {NAV_GROUPS.map(g => (
                <div key={g.t}>
                  <div className="sheet-sec">{g.t}</div>
                  <div className="sheet-grid">
                    {g.items.map(it => (
                      <button key={it.id} className={`sheet-item${active === it.id ? ' on' : ''}`}
                        onClick={() => { setSheet(false); it.kiosk ? launchKiosk() : go(it.id); }}>
                        <span className="si-ic"><NIcon d={navIc[it.ic]} size={18} /></span><b>{it.label}</b>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="sheet-sec">설정</div>
              <div className="sheet-grid">
                <button className={`sheet-item${active === 'settings' ? ' on' : ''}`} onClick={() => { setSheet(false); go('settings'); }}>
                  <span className="si-ic"><NIcon d={navIc.gear} size={18} /></span><b>설정</b>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function KioskFull({ exit }) {
    const K = window.GrowingKiosk;
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
        {K ? <K variant="desktop" /> : null}
        <button onClick={exit} style={{ position: 'absolute', top: 16, right: 16, zIndex: 60, background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10, padding: '.5rem .9rem', fontFamily: 'inherit', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>← 관리자 화면으로</button>
      </div>
    );
  }

  // ── AI 비서 아이비 (플로팅) ──
  const IVY_SUGG = [
    { q: '오늘 미납 누구야?', a: '오늘 기준 미납은 4건이에요 — 박지민·임채원·한지후·신민준 (합계 84만원). 종합 알림장에 미납 안내를 넣어 드릴까요? 🌱' },
    { q: '한지후 출결 요약해줘', a: '한지후 학생은 최근 2주 결석 3회예요. 보강 미연결이 1건 있어요. 보강·보충 화면에서 바로 처리할 수 있어요.' },
    { q: '박지민 안내문 써줘', a: '박지민 어머니께 보낼 종합 알림장 초안을 만들었어요. 알림장 화면에서 바로 수정·발송하실 수 있어요. 😊' },
  ];
  function Ivy() {
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState([{ who: 'bot', t: '안녕하세요 지선쌤! 운영 데이터 조회나 학부모 안내문 초안, 무엇이든 도와드릴게요. 🌱' }]);
    const [text, setText] = useState('');
    const bodyRef = React.useRef(null);
    React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, open]);
    const send = (q, a) => {
      setMsgs(m => [...m, { who: 'user', t: q }]);
      setText('');
      window.setTimeout(() => setMsgs(m => [...m, { who: 'bot', t: a || '데이터를 확인해볼게요. (프로토타입 — 실제 아이비는 학생·출결·수납·상담 DB를 조회해 답합니다.)' }]), 500);
    };
    return (
      <>
        {open && (
          <div className="ivy-panel">
            <div className="ivy-head">
              <span className="ivy-head-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg></span>
              <div className="ivy-head-tx"><b>아이비</b><span>AI 운영 비서</span></div>
              <button className="ivy-x" onClick={() => setOpen(false)} aria-label="닫기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="ivy-body" ref={bodyRef}>
              {msgs.map((m, i) => <div key={i} className={`ivy-msg ${m.who}`}>{m.t}</div>)}
              <div className="ivy-sugg">
                {IVY_SUGG.map(s => <button key={s.q} onClick={() => send(s.q, s.a)}>{s.q}</button>)}
              </div>
            </div>
            <form className="ivy-input" onSubmit={e => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
              <input placeholder="아이비에게 물어보세요…" value={text} onChange={e => setText(e.target.value)} />
              <button type="submit" aria-label="보내기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button>
            </form>
          </div>
        )}
        <button className={`ivy-fab ${open ? 'on' : ''}`} onClick={() => setOpen(o => !o)} aria-label="AI 비서 아이비">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg>
        </button>
      </>
    );
  }

  function Proto() {
    const [device, setDevice] = useState('desktop');
    const [active, setActive] = useState('dashboard');
    const [toast, setToast] = useState(null);
    const fire = useCallback((msg) => {
      setToast(msg);
      window.clearTimeout(fire._t);
      fire._t = window.setTimeout(() => setToast(null), 2000);
    }, []);
    const go = useCallback((id) => { setActive(id); }, []);
    const launchKiosk = useCallback(() => { setActive('kiosk'); }, []);
    const exitKiosk = useCallback(() => { setActive('dashboard'); }, []);

    const title = (SCREENS[active] || SCREENS.dashboard).title;

    return (
      <div className="proto">
        <div className="proto-bar">
          <div className="proto-brand">
            <span className="pb-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.6 1.4-.5 2.6-.4 4 1.7-.4 3-1 4-2.2 1-1.3 1.3-3 1.4-4.8-2.4.6-3.9 1.5-4.7 3z"/></svg></span>
            그로잉영어 <small>통일 프로토타입</small>
          </div>
          <div className="proto-seg">
            <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>데스크탑
            </button>
            <button className={device === 'tablet' ? 'on' : ''} onClick={() => setDevice('tablet')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 17h.01"/></svg>태블릿
            </button>
            <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>모바일
            </button>
          </div>
          <div className="proto-note">{device === 'tablet' ? '태블릿(아이패드 등)은 풀 레이아웃 — 모바일로 무너지지 않아요' : `현재 화면: ${active === 'kiosk' ? '키오스크' : title} · 클릭해서 둘러보세요`}</div>
        </div>

        <div className={`proto-stage is-${device}`}>
          {device === 'mobile' ? (
            <div className="phone">
              <div className="phone-screen">
                <div className="phone-notch" />
                {active === 'kiosk'
                  ? <div style={{ position: 'relative', height: '100%' }}><KioskFull exit={exitKiosk} /></div>
                  : <MobileApp active={active} go={go} launchKiosk={launchKiosk} toast={fire} />}
              </div>
            </div>
          ) : device === 'tablet' ? (
            <div className="tablet">
              <div className="tablet-screen">
                {active === 'kiosk'
                  ? <div className="app-shell" style={{ position: 'relative' }}><KioskFull exit={exitKiosk} /></div>
                  : <DesktopApp active={active} go={go} launchKiosk={launchKiosk} toast={fire} />}
              </div>
            </div>
          ) : (
            active === 'kiosk'
              ? <div className="app-shell" style={{ position: 'relative' }}><KioskFull exit={exitKiosk} /></div>
              : <DesktopApp active={active} go={go} launchKiosk={launchKiosk} toast={fire} />
          )}
        </div>

        {toast && (
          <div className="toast-wrap"><div className="toast"><span className="tdot" />{toast}</div></div>
        )}
        {active !== 'kiosk' && device !== 'mobile' && <Ivy />}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<Proto />);
})();
