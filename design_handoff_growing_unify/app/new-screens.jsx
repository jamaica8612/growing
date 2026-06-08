/* ════════════════════════════════════════════════════════════
   통일 프로토타입 — 새 4화면 (보강·평가·카카오·데이터점검)
   기존 .gd / .at / .pay 어휘로 통일. alert() 대신 toast(props) 사용.
   window.GrowingMakeup / GrowingExams / GrowingKakao / GrowingDataQuality
   ════════════════════════════════════════════════════════════ */
(function () {
  const { useState, useMemo } = React;

  /* 공용 인라인 아이콘 */
  const P = {
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>,
    calcheck: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></>,
    bulb: <><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    clip: <><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12l2 2 4-4"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    bar: <><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></>,
    msgc: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></>,
    key: <><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></>,
    userx: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    alertc: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>,
    alertt: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    arrow: <><path d="M5 12h14M12 5l7 7-7 7"/></>,
  };
  function Ic({ d, size = 16 }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
  }
  const D = () => window.GROWING_DATA;
  const DAYNAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = (date) => DAYNAMES[new Date(`${date}T00:00:00`).getDay()];

  /* ══════════════ 보강 / 보충 ══════════════ */
  function GrowingMakeup({ variant = 'desktop', toast }) {
    const d = D();
    const mobile = variant === 'mobile';
    const [mode, setMode] = useState('makeup');
    const [filter, setFilter] = useState('needed');
    const [search, setSearch] = useState('');
    const stById = useMemo(() => Object.fromEntries(d.students.map(s => [s.id, s])), [d]);
    const clById = useMemo(() => Object.fromEntries(d.classes.map(c => [c.id, c])), [d]);

    const { needed, completed } = useMemo(() => {
      const makeups = d.attendance.filter(a => a.status === 'makeup' && a.makeupForDate);
      const isResolved = (sid, date) => makeups.some(m => m.studentId === sid && m.makeupForDate === date);
      const needed = d.attendance
        .filter(a => a.status === 'absent' && (stById[a.studentId]?.status === 'active') && !isResolved(a.studentId, a.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);
      const completed = makeups
        .filter(m => stById[m.studentId]?.status === 'active')
        .sort((a, b) => b.date.localeCompare(a.date));
      return { needed, completed };
    }, [d, stById]);

    const supplements = useMemo(
      () => d.attendance.filter(a => a.status === 'supplement').sort((a, b) => b.date.localeCompare(a.date)),
      [d]
    );

    const q = search.trim();
    const matchN = (a) => !q || (stById[a.studentId]?.name || '').includes(q) || (clById[a.classId]?.name || '').includes(q);
    const needShow = needed.filter(matchN);
    const doneShow = completed.filter(matchN);

    return (
      <div className={`gd-root${mobile ? ' gd-mobile' : ''}`} style={{ gap: '1.15rem' }}>
        <div className="gd-seg" style={{ alignSelf: 'flex-start', gridTemplateColumns: '1fr 1fr', minWidth: 220 }}>
          <button className={`gd-seg-b${mode === 'makeup' ? ' sel info' : ''}`} onClick={() => setMode('makeup')}>보강 관리</button>
          <button className={`gd-seg-b${mode === 'supplement' ? ' sel warn' : ''}`} onClick={() => setMode('supplement')}>보충 관리</button>
        </div>

        {mode === 'makeup' ? (
          <>
            <div className="gx-banner">
              <div className="gx-banner-l"><h3>보강 현황</h3><p>결석 기록과 연결된 보강만 관리합니다.</p></div>
              <div className="gx-badges">
                <span className="at-pill danger">필요 {needed.length}</span>
                <span className="at-pill info">완료 {completed.length}</span>
              </div>
            </div>

            <div className="mk-toolbar">
              <div className="pay-search" style={{ flex: 1, minWidth: 180 }}>
                <Ic d={P.search} size={15} />
                <input placeholder="학생·반 검색…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="gd-seg" style={{ gridTemplateColumns: '1fr 1fr 1fr', minWidth: 200 }}>
                {[['needed', '보강 필요'], ['completed', '보강 완료'], ['all', '전체']].map(([v, l]) => (
                  <button key={v} className={`gd-seg-b${filter === v ? ' sel ok' : ''}`} onClick={() => setFilter(v)}>{l}</button>
                ))}
              </div>
            </div>

            {(filter === 'all' || filter === 'needed') && (
              <section className="gd-card">
                <div className="gd-card-head"><div className="gd-card-title"><Ic d={P.refresh} size={18} /> 보강 필요</div><span className="gd-card-pill danger">{needShow.length}건</span></div>
                {needShow.length === 0 ? (
                  <div className="gd-empty"><Ic d={P.check} size={26} /><span>보강이 필요한 결석이 없어요</span></div>
                ) : (
                  <div className="mk-cards">
                    {needShow.map(a => {
                      const st = stById[a.studentId]; const cl = clById[a.classId];
                      const recDate = a.date;
                      return (
                        <div key={a.id} className="mk-card need">
                          <div className="mk-card-head">
                            <div><b>{st?.name}</b><span>{cl?.name || '반 정보 없음'}</span></div>
                            <span className="at-pill danger">보강 필요</span>
                          </div>
                          <div className="mk-grid">
                            <div><span>원래 결석일</span><b>{recDate}</b></div>
                            <div><span>메모</span><b>{a.memo || '—'}</b></div>
                          </div>
                          <div className="mk-recs">
                            <span><Ic d={P.bulb} size={13} /> 추천 보강 후보</span>
                            <button onClick={() => toast?.('보강 후보가 선택되었습니다')}>{d.TODAY} 15:00 · {cl?.name}</button>
                          </div>
                          <button className="pay-btn primary sm mk-btn" onClick={() => toast?.(`${st?.name} 보강 기록을 연결했어요`)}>
                            <Ic d={P.calcheck} size={14} /> 보강 처리
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {(filter === 'all' || filter === 'completed') && (
              <section className="gd-card">
                <div className="gd-card-head"><div className="gd-card-title"><Ic d={P.check} size={18} /> 보강 완료</div><span className="gd-card-pill">{doneShow.length}건</span></div>
                {doneShow.length === 0 ? (
                  <div className="gd-empty"><Ic d={P.calcheck} size={24} /><span>완료된 보강 기록이 없어요</span></div>
                ) : (
                  <div className="mk-cards">
                    {doneShow.map(m => {
                      const st = stById[m.studentId]; const cl = clById[m.classId];
                      return (
                        <div key={m.id} className="mk-card done">
                          <div className="mk-card-head"><div><b>{st?.name}</b><span>{cl?.name || '반 정보 없음'}</span></div><span className="at-pill info">완료</span></div>
                          <div className="mk-grid">
                            <div><span>보강일</span><b>{m.date}</b></div>
                            <div><span>원래 결석일</span><b>{m.makeupForDate}</b></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            <div className="gx-banner">
              <div className="gx-banner-l"><h3>보충 현황</h3><p>정규 출결과 별도로 보충한 분량을 학생별로 기록합니다.</p></div>
              <div className="gx-badges">
                <span className="at-pill warn">보충 {supplements.length}건</span>
                <span className="at-pill info">총 {supplements.reduce((s, x) => s + (x.supplementMinutes || 0), 0)}분</span>
              </div>
            </div>
            <section className="gd-card">
              <div className="gd-card-head"><div className="gd-card-title"><Ic d={P.plus} size={18} /> 보충 기록 추가</div></div>
              <div className="mk-grid" style={{ gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr) auto', alignItems: 'end', gap: '.6rem' }}>
                <div><span>날짜</span><b>{d.TODAY}</b></div>
                <div><span>학생</span><b>김서윤</b></div>
                <div><span>반</span><b>Phonics A</b></div>
                <div><span>분량</span><b>30분</b></div>
                <button className="pay-btn primary" onClick={() => toast?.('보충 30분이 기록되었어요')}>저장</button>
              </div>
            </section>
            <section className="gd-card">
              <div className="gd-card-head"><div className="gd-card-title"><Ic d={P.clock} size={18} /> 보충 기록</div><span className="gd-card-pill">{supplements.length}건</span></div>
              {supplements.length === 0 ? (
                <div className="gd-empty"><Ic d={P.clock} size={24} /><span>아직 보충 기록이 없어요</span><span style={{ fontSize: '.82rem', color: 'var(--g-muted)', fontWeight: 400 }}>위에서 보충 분량을 기록해 보세요</span></div>
              ) : (
                <div className="mk-cards">{supplements.map(s => <div key={s.id} className="mk-card done" />)}</div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  /* ══════════════ 평가 관리 ══════════════ */
  const EXAMS = [
    { id: 'e1', title: 'Reading Unit 6 단원평가', classId: 'c2', date: '2026-06-05', submitted: 4, total: 5, avg: 88, status: 'live' },
    { id: 'e2', title: 'Grammar 중간 점검 시험', classId: 'c3', date: '2026-06-09', submitted: 0, total: 6, avg: null, status: 'soon' },
    { id: 'e3', title: 'Phonics 진단 평가', classId: 'c1', date: '2026-05-28', submitted: 3, total: 3, avg: 94, status: 'done' },
    { id: 'e4', title: 'Speaking 수행 루브릭', classId: 'c4', date: '2026-06-12', submitted: 0, total: 3, avg: null, status: 'draft' },
  ];
  const STAT_LABEL = { live: '진행중', soon: '곧 마감', done: '채점완료', draft: '초안' };
  function GrowingExams({ variant = 'desktop', toast }) {
    const d = D();
    const mobile = variant === 'mobile';
    const clById = useMemo(() => Object.fromEntries(d.classes.map(c => [c.id, c])), [d]);
    const [f, setF] = useState('all');
    const live = EXAMS.filter(e => e.status === 'live').length;
    const scored = EXAMS.filter(e => e.avg != null);
    const avgAll = scored.length ? Math.round(scored.reduce((s, e) => s + e.avg, 0) / scored.length) : 0;
    const pending = EXAMS.reduce((s, e) => s + (e.total - e.submitted), 0);
    const rows = f === 'all' ? EXAMS : EXAMS.filter(e => e.status === f);

    const kpi = [
      { ic: P.clip, bg: '#e9f3fb', cl: 'var(--g-info)', label: '진행 중 시험', val: live, em: '개' },
      { ic: P.bar, bg: '#e9f8f1', cl: 'var(--g-mint)', label: '평균 점수', val: avgAll, em: '점' },
      { ic: P.bell, bg: '#fef3c7', cl: '#b4710a', label: '미응시', val: pending, em: '명' },
      { ic: P.calcheck, bg: '#f0eefb', cl: '#7c5cd6', label: '예정 평가', val: EXAMS.filter(e => e.status === 'soon' || e.status === 'draft').length, em: '개' },
    ];

    return (
      <div className={`gd-root${mobile ? ' gd-mobile' : ''}`} style={{ gap: '1.15rem' }}>
        <div className="ex-kpis">
          {kpi.map((k, i) => (
            <div className="gd-stat" key={i}>
              <div className="gd-stat-ic" style={{ background: k.bg, color: k.cl }}><Ic d={k.ic} size={22} /></div>
              <div className="gd-stat-body"><span className="gd-stat-label">{k.label}</span><span className="gd-stat-val">{k.val}<em>{k.em}</em></span></div>
            </div>
          ))}
        </div>

        <section className="gd-card">
          <div className="gd-card-head">
            <div className="gd-card-title"><Ic d={P.clip} size={18} /> 평가 목록</div>
            <div className="gd-seg" style={{ gridTemplateColumns: 'repeat(4,1fr)', minWidth: 260 }}>
              {[['all', '전체'], ['live', '진행중'], ['soon', '예정'], ['done', '완료']].map(([v, l]) => (
                <button key={v} className={`gd-seg-b${f === v ? ' sel ok' : ''}`} onClick={() => setF(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="ex-list">
            {rows.map(e => {
              const cl = clById[e.classId];
              const pct = e.total ? Math.round((e.submitted / e.total) * 100) : 0;
              return (
                <div className="ex-row" key={e.id}>
                  <div className="ex-id">
                    <div className="ex-title"><span className={`ex-stat ${e.status}`}>{STAT_LABEL[e.status]}</span> <span className="ex-name">{e.title}</span></div>
                    <div className="ex-meta">{e.date} ({dow(e.date)})</div>
                  </div>
                  <div className="ex-cls"><span className="ex-clsdot" style={{ background: cl?.color }} />{cl?.name}</div>
                  <div className="ex-prog">
                    <div className="ex-prog-top"><span>응시 {e.submitted}/{e.total}</span><span>{pct}%</span></div>
                    <div className="ex-bar"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div className="ex-score">
                    {e.avg != null ? <><b>{e.avg}<em>점</em></b><span>평균</span></> : <><b style={{ color: 'var(--g-muted)' }}>—</b><span>채점 전</span></>}
                  </div>
                  <div className="ex-acts">
                    <button className="pay-btn ghost sm" onClick={() => toast?.('결과 화면으로 이동합니다')}><Ic d={P.eye} size={14} /> 결과</button>
                    <button className="pay-btn primary sm" onClick={() => toast?.('학부모 안내문 초안을 만들었어요')}><Ic d={P.send} size={14} /> 안내</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  /* ══════════════ 카카오 채널 ══════════════ */
  const REQ_ICON = { attendance: P.calcheck, homework: P.clip, counsel: P.msgc, connect: P.link };
  const REQ_LABEL = { attendance: '출결 확인', homework: '숙제 확인', counsel: '상담 요청', connect: '학생 연결' };
  function GrowingKakao({ variant = 'desktop', toast }) {
    const d = D();
    const mobile = variant === 'mobile';
    const [tab, setTab] = useState('inbox');
    const [autoReply, setAutoReply] = useState(true);
    const requests = [
      { id: 'r1', studentId: 's6', type: 'attendance', text: '오늘 하은이 몇 시에 하원했나요?', time: '14:32', auto: '강하은 학생은 오늘 15:30 등원해 수업 중이에요. 하원하면 바로 알림 보내드릴게요! 🌱' },
      { id: 'r4', studentId: 's2', type: 'homework', text: '준호 오늘 숙제 했나요?', time: '13:40', auto: '이준호 학생 오늘 숙제는 “미흡”으로 기록됐어요. 다음 시간에 보충 예정입니다. 📝' },
      { id: 'r2', studentId: 's3', type: 'counsel', text: '리딩 레벨 관련 상담 요청드려요.', time: '13:10' },
      { id: 'r3', studentId: 's7', type: 'connect', text: '학부모 채널 연결 요청', time: '11:48' },
    ];
    const pending = requests.filter(r => !(autoReply && r.auto));
    const links = d.students.filter(s => s.status === 'active').slice(0, 6).map((s, i) => ({ s, linked: i % 3 !== 0 }));
    const stById = Object.fromEntries(d.students.map(s => [s.id, s]));

    return (
      <div className={`gd-root${mobile ? ' gd-mobile' : ''}`} style={{ gap: '1.15rem' }}>
        <div className="ka-intro">
          <span className="ka-k">K</span>
          <p>카카오 채널봇 연결·테스트를 관리합니다. Skill/Event URL을 관리자센터에 연결한 뒤, 학생 연결 상태와 상담 요청 큐를 확인하세요.</p>
        </div>

        <div className="ka-tabs">
          {[['inbox', '요청 큐', pending.length], ['links', '학생 연결', null], ['settings', '연동 설정', null]].map(([k, l, n]) => (
            <button key={k} className={`ka-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              {l}{n ? <span className="ka-n">{n}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'inbox' && (
          <section className="gd-card">
            {autoReply && (
              <div className="ka-auto-note">
                <span className="ka-auto-dot" /> 출결·숙제 문의는 <b>아이비가 자동응답</b> 중이에요. 상담·연결 요청만 직접 확인하시면 됩니다.
              </div>
            )}
            <div className="ka-inbox">
              {requests.map(r => {
                const st = stById[r.studentId];
                const answered = autoReply && r.auto;
                return (
                  <div className={`ka-req${answered ? ' answered' : ''}`} key={r.id}>
                    <div className="ka-req-ic"><Ic d={REQ_ICON[r.type]} size={18} /></div>
                    <div className="ka-req-id">
                      <b>{st?.name || '미연결 학부모'}</b><span className="ka-type">{REQ_LABEL[r.type]}</span>
                      <p>{r.text}</p>
                      {answered
                        ? <div className="ka-autoans"><span className="ka-autoans-by"><Ic d={P.msgc} size={12} /> 아이비 자동응답</span>{r.auto}</div>
                        : <div className="ka-time">오늘 {r.time}</div>}
                    </div>
                    <div className="ka-req-acts">
                      {answered
                        ? <span className="ka-done-pill"><Ic d={P.check} size={12} /> 자동 처리됨</span>
                        : <>
                            <button className="pay-btn ghost sm" onClick={() => toast?.('답변 초안을 만들었어요')}>답변</button>
                            <button className="pay-btn primary sm" onClick={() => toast?.('처리 완료로 표시했어요')}>완료</button>
                          </>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'links' && (
          <section className="gd-card">
            <div className="gd-card-head"><div className="gd-card-title"><Ic d={P.link} size={18} /> 학생-학부모 연결</div><span className="gd-card-pill">{links.filter(l => l.linked).length}/{links.length} 연결됨</span></div>
            <div className="ka-links">
              {links.map(({ s, linked }) => (
                <div className="ka-link" key={s.id}>
                  <span className="ka-av">{s.name[0]}</span>
                  <div><b>{s.name}</b> <span>· {s.grade}</span><br /><span>{s.parentContact || '연락처 없음'}</span></div>
                  <span className={`ka-state ${linked ? 'linked' : 'pending'}`}>{linked ? '연결됨' : '대기'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="gd-card">
            <div className="ka-fields">
              <div className="ka-auto-toggle">
                <div className="ka-auto-tx">
                  <b><Ic d={P.msgc} size={15} /> 아이비 출결·숙제 자동응답</b>
                  <span>학부모가 등·하원, 숙제 여부를 물으면 아이비가 DB를 조회해 즉시 답합니다. 상담·연결 요청은 자동 처리하지 않고 큐에 남겨요.</span>
                </div>
                <button className={`ka-switch${autoReply ? ' on' : ''}`} role="switch" aria-checked={autoReply} onClick={() => { setAutoReply(v => !v); toast?.(autoReply ? '자동응답을 껐어요' : '자동응답을 켰어요'); }}><span /></button>
              </div>
              <div className="ka-field">
                <label>Skill URL</label>
                <div className="ka-url"><code>https://growing.supabase.co/functions/v1/kakao-skill?secret=••••3f9a</code>
                  <button className="pay-btn ghost sm" onClick={() => toast?.('Skill URL을 복사했어요')}><Ic d={P.copy} size={14} /> 복사</button></div>
              </div>
              <div className="ka-field">
                <label>Event URL</label>
                <div className="ka-url"><code>https://growing.supabase.co/functions/v1/kakao-channel-event?secret=••••7b21</code>
                  <button className="pay-btn ghost sm" onClick={() => toast?.('Event URL을 복사했어요')}><Ic d={P.copy} size={14} /> 복사</button></div>
              </div>
              <div className="ka-field">
                <label>채널 상태</label>
                <div className="ka-url" style={{ background: '#eefaf3', borderColor: '#c7ecd9' }}>
                  <code style={{ color: '#0c7a55' }}>● 연결됨 · 그로잉영어 카카오 채널</code>
                  <button className="pay-btn ghost sm" onClick={() => toast?.('새 시크릿을 발급했어요')}><Ic d={P.key} size={14} /> 시크릿 재발급</button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  /* ══════════════ 데이터 점검 ══════════════ */
  function GrowingDataQuality({ variant = 'desktop', onNavigate }) {
    const d = D();
    const mobile = variant === 'mobile';
    const sections = useMemo(() => {
      const active = d.students.filter(s => s.status === 'active');
      const noContact = active.filter(s => !s.parentContact);
      const assigned = new Set(d.classes.flatMap(c => c.studentIds));
      const noClass = active.filter(s => !assigned.has(s.id));
      const unpaid = d.payments.filter(p => p.status === 'unpaid' && p.billingMonth === d.billingMonth);
      const makeups = d.attendance.filter(a => a.status === 'makeup' && a.makeupForDate);
      const openAbs = d.attendance.filter(a => a.status === 'absent' && active.some(s => s.id === a.studentId)
        && !makeups.some(m => m.studentId === a.studentId && m.makeupForDate === a.date));
      const out = [];
      if (noContact.length) out.push({ key: 'contact', sev: 'danger', icon: P.alertc, title: '연락처 없음', label: '데이터 꼬임', target: 'students', action: '학생 관리로', issues: noContact.map(s => ({ id: s.id, t: s.name, d: `${s.school} ${s.grade} · 학부모 연락처 미입력` })) });
      if (openAbs.length) out.push({ key: 'abs', sev: 'warn', icon: P.alertt, title: '미처리 결석', label: '확인 필요', target: 'makeup', action: '보강 관리로', issues: openAbs.slice(0, 4).map(a => ({ id: a.id, t: d.students.find(s => s.id === a.studentId)?.name, d: `${a.date} 결석 · 보강 미연결` })) });
      if (unpaid.length) out.push({ key: 'pay', sev: 'warn', icon: P.alertt, title: '미납 확인', label: '확인 필요', target: 'payments', action: '수납 관리로', issues: unpaid.slice(0, 4).map(p => ({ id: p.id, t: d.students.find(s => s.id === p.studentId)?.name, d: `${d.billingMonth} · ${p.amount.toLocaleString()}원 미납` })) });
      if (noClass.length) out.push({ key: 'class', sev: 'info', icon: P.info, title: '반 미배정', label: '개선 추천', target: 'classes', action: '반/시간표로', issues: noClass.map(s => ({ id: s.id, t: s.name, d: '아직 어떤 반에도 속하지 않음' })) });
      return out;
    }, [d]);
    const totalIssues = sections.reduce((s, sec) => s + sec.issues.length, 0);

    return (
      <div className={`gd-root${mobile ? ' gd-mobile' : ''}`} style={{ gap: '1.15rem' }}>
        <div className="ex-kpis" style={{ gridTemplateColumns: mobile ? '1fr 1fr 1fr' : 'repeat(3,1fr)' }}>
          <div className="gd-stat gd-stat-danger">
            <div className="gd-stat-ic" style={{ background: '#fdeaea', color: 'var(--g-danger)' }}><Ic d={P.alertc} size={22} /></div>
            <div className="gd-stat-body"><span className="gd-stat-label">전체 점검 항목</span><span className="gd-stat-val">{totalIssues}<em>건</em></span></div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-ic" style={{ background: '#fef3c7', color: '#b4710a' }}><Ic d={P.bell} size={22} /></div>
            <div className="gd-stat-body"><span className="gd-stat-label">확인 필요 카드</span><span className="gd-stat-val">{sections.length}<em>개</em></span></div>
          </div>
          <div className="gd-stat">
            <div className="gd-stat-ic" style={{ background: '#e9f8f1', color: 'var(--g-mint)' }}><Ic d={P.check} size={22} /></div>
            <div className="gd-stat-body"><span className="gd-stat-label">자동 수정</span><span className="gd-stat-val" style={{ fontSize: '1.15rem' }}>없음</span></div>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="gd-card"><div className="gd-empty" style={{ padding: '2rem 1rem' }}><Ic d={P.check} size={34} /><span>데이터 점검 결과가 깨끗해요!</span></div></div>
        ) : (
          <div className="dq-grid">
            {sections.map(sec => (
              <section className="gd-card dq-card" key={sec.key}>
                <div className="dq-head">
                  <div className="dq-head-id">
                    <span className={`dq-ic ${sec.sev}`}><Ic d={sec.icon} size={18} /></span>
                    <div><h3>{sec.title}</h3><span className={`dq-sev ${sec.sev}`}>{sec.label}</span></div>
                  </div>
                  <span className="dq-count">{sec.issues.length}건</span>
                </div>
                <div className="dq-issues">
                  {sec.issues.map(is => <div className="dq-issue" key={is.id}><b>{is.t}</b><span>{is.d}</span></div>)}
                </div>
                <button className="pay-btn ghost dq-action" onClick={() => onNavigate?.(sec.target)}>{sec.action} <Ic d={P.arrow} size={14} /></button>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  window.GrowingMakeup = GrowingMakeup;
  window.GrowingExams = GrowingExams;
  window.GrowingKakao = GrowingKakao;
  window.GrowingDataQuality = GrowingDataQuality;
})();
