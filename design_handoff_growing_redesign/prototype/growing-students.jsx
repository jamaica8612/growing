/* 그로잉영어 — 학생 관리 + 상세(타임라인) 리디자인
   window.GrowingStudents({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;
const L = window.GStudents;

const TAG_SEV = { danger: 'danger', warning: 'warn', info: 'info' };
const TL_META = {
  attendance: { ic: 'calendar', lbl: '출결' },
  homework: { ic: 'checkCircle', lbl: '숙제' },
  payment: { ic: 'card', lbl: '수납' },
  counsel: { ic: 'msg', lbl: '상담' },
  test: { ic: 'trend', lbl: '평가' },
  progress: { ic: 'book', lbl: '진도' },
  report: { ic: 'book', lbl: '리포트' },
};
const SEV_COLOR = { success: '#10b981', danger: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

const TAG_FILTERS = [
  { v: 'all', l: '전체' }, { v: 'has-tags', l: '주의 태그' }, { v: 'unpaid', l: '미납' },
  { v: 'frequent-absence', l: '결석 잦음' }, { v: 'homework-followup', l: '숙제 미흡' },
  { v: 'needs-counsel', l: '상담 필요' }, { v: 'report-missing', l: '리포트 미작성' },
];

function GrowingStudents({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const today = new Date(`${D.TODAY}T00:00:00`);

  const tagMap = useMemo(() => {
    const m = new Map();
    D.students.forEach(s => m.set(s.id, L.getStudentTags({ student: s, classes: D.classes, attendance: D.attendance, payments: D.payments, counselLogs: D.counselLogs, today })));
    return m;
  }, [D]);

  const [search, setSearch] = useState('');
  const [tagF, setTagF] = useState('all');
  const [selId, setSelId] = useState('s3');
  const [tab, setTab] = useState('timeline');
  const [mobileDetail, setMobileDetail] = useState(false);

  const activeStudents = D.students.filter(s => s.status === 'active');
  const list = activeStudents.filter(s => {
    const okS = !search || s.name.includes(search) || (s.school || '').includes(search);
    const tags = tagMap.get(s.id) || [];
    const okT = tagF === 'all' || (tagF === 'has-tags' && tags.length > 0) || tags.some(t => t.key === tagF);
    return okS && okT;
  });

  const sel = D.students.find(s => s.id === selId) || list[0];
  const selTags = sel ? (tagMap.get(sel.id) || []) : [];
  const timeline = useMemo(() => sel ? L.getStudentTimeline({ student: sel, classes: D.classes, attendance: D.attendance, payments: D.payments, counselLogs: D.counselLogs }) : [], [sel, D]);
  const selClasses = sel ? D.classes.filter(c => c.studentIds.includes(sel.id)) : [];
  const selPays = sel ? D.payments.filter(p => p.studentId === sel.id).sort((a, b) => (b.paymentDate || b.billingMonth).localeCompare(a.paymentDate || a.billingMonth)) : [];
  const selLogs = sel ? D.counselLogs.filter(l => l.studentId === sel.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const rate = sel ? L.attendanceRate(sel, D.attendance) : 0;

  const pick = (id) => { setSelId(id); setTab('timeline'); if (mobile) setMobileDetail(true); };

  const TagChips = ({ tags, reasons }) => (
    <div className="st-tags">
      {tags.length === 0 ? <span className="st-tag none">주의 태그 없음</span> :
        tags.map(t => <span key={t.key} className={`st-tag ${TAG_SEV[t.severity]}`} title={t.reason}>{t.label}{reasons && <em> · {t.reason}</em>}</span>)}
    </div>
  );

  const ListPane = (
    <div className="st-list-pane">
      <div className="st-listbar">
        <div className="pay-search"><Icon name="search" size={15} />
          <input placeholder="학생 이름·학교 검색…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div className="st-chips">
        {TAG_FILTERS.map(o => <button key={o.v} className={`at-chip ${tagF === o.v ? 'on' : ''}`} onClick={() => setTagF(o.v)}>{o.l}</button>)}
      </div>
      <div className="st-list">
        {list.length === 0 ? <div className="gd-empty"><Icon name="users" size={26} /><span>조건에 맞는 학생이 없어요</span></div> :
          list.map(s => {
            const tags = tagMap.get(s.id) || [];
            const r = L.attendanceRate(s, D.attendance);
            return (
              <button key={s.id} className={`st-item ${sel && sel.id === s.id ? 'on' : ''}`} onClick={() => pick(s.id)}>
                <div className="st-avatar">{s.name[0]}</div>
                <div className="st-item-body">
                  <div className="st-item-top"><span className="st-item-name">{s.name}</span><span className="st-item-grade">{s.grade}</span></div>
                  <div className="st-item-sub">{s.school}</div>
                  {tags.length > 0 && <div className="st-mini-tags">{tags.slice(0, 3).map(t => <span key={t.key} className={`st-dot ${TAG_SEV[t.severity]}`} title={t.label} />)}{tags.length > 3 && <span className="st-more">+{tags.length - 3}</span>}</div>}
                </div>
                <div className="st-item-rate"><b>{r}%</b><span>출석</span></div>
              </button>
            );
          })}
      </div>
    </div>
  );

  const DetailPane = sel ? (
    <div className="st-detail">
      <div className="st-dhead">
        {mobile && <button className="st-back" onClick={() => setMobileDetail(false)}>‹ 목록</button>}
        <div className="st-dhead-top">
          <div className="st-davatar">{sel.name[0]}</div>
          <div className="st-dhead-id">
            <div className="st-dname">{sel.name}<span className={`st-status ${sel.status}`}>{sel.status === 'active' ? '재원생' : sel.status === 'paused' ? '휴원생' : '퇴원생'}</span></div>
            <div className="st-dmeta">{sel.school} · {sel.grade} · 등록 {sel.registrationDate || '—'}</div>
            <div className="st-contacts"><span><Icon name="phone" size={12} /> 학부모 {sel.parentContact || '없음'}</span></div>
          </div>
          <div className="st-drate">
            <span className="st-drate-v">{rate}<em>%</em></span><span className="st-drate-l">평균 출석</span>
          </div>
        </div>
        <TagChips tags={selTags} reasons />
      </div>

      <div className="st-tabs">
        {[{ v: 'timeline', l: '타임라인' }, { v: 'info', l: '기본 정보' }, { v: 'payments', l: '출결·수납' }, { v: 'counsel', l: '상담 일지' }].map(t => (
          <button key={t.v} className={`st-tab ${tab === t.v ? 'on' : ''}`} onClick={() => setTab(t.v)}>{t.l}</button>
        ))}
      </div>

      <div className="st-tabbody">
        {tab === 'timeline' && (
          <div className="st-timeline">
            {timeline.length === 0 ? <div className="gd-empty"><Icon name="clock" size={24} /><span>기록이 없어요</span></div> :
              timeline.map(ev => {
                const m = TL_META[ev.type] || TL_META.counsel;
                const col = SEV_COLOR[ev.severity] || '#3b82f6';
                return (
                  <div className="st-tl-item" key={ev.id}>
                    <div className="st-tl-rail"><span className="st-tl-node" style={{ background: col }}><Icon name={m.ic} size={12} /></span></div>
                    <div className="st-tl-card">
                      <div className="st-tl-head"><span className="st-tl-type" style={{ color: col }}>{m.lbl}</span><span className="st-tl-title">{ev.title}</span><span className="st-tl-date">{ev.date}</span></div>
                      {ev.detail && <p className="st-tl-detail">{ev.detail}</p>}
                      {ev.meta && <span className="st-tl-meta">{ev.meta}</span>}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {tab === 'info' && (
          <div className="st-info">
            <div className="st-info-grid">
              <div className="st-info-cell"><span>학교 / 학년</span><b>{sel.school || '—'} · {sel.grade}</b></div>
              <div className="st-info-cell"><span>등록일</span><b>{sel.registrationDate || '—'}</b></div>
              <div className="st-info-cell"><span>학생 연락처</span><b>{sel.contact || '없음'}</b></div>
              <div className="st-info-cell"><span>학부모 연락처</span><b>{sel.parentContact || '없음'}</b></div>
            </div>
            <div className="st-classes">
              <h4>수강 중인 반</h4>
              {selClasses.length === 0 ? <p className="st-empty-line">배정된 반이 없습니다.</p> :
                selClasses.map(c => (
                  <div className="st-class-row" key={c.id}>
                    <span className="gd-class-bar" style={{ background: c.color }} />
                    <span className="st-class-name">{c.name}</span>
                    <span className="st-class-sched">{c.schedules.map(s => `${s.day} ${s.startTime}`).join(', ')}</span>
                  </div>
                ))}
            </div>
            <div className="st-memo"><h4>메모 · 교습 가이드</h4><p>{sel.memo || '저장된 특이사항 메모가 없습니다.'}</p></div>
          </div>
        )}
        {tab === 'payments' && (
          <div className="st-pay">
            <div className="st-pay-stat"><div><span>평균 출석률</span><b>{rate}%</b></div><div><span>총 결제 기록</span><b>{selPays.length}건</b></div></div>
            <h4>청구 · 납부 이력</h4>
            {selPays.length === 0 ? <p className="st-empty-line">기록이 없습니다.</p> :
              selPays.map(p => (
                <div className="st-pay-row" key={p.id}>
                  <span className="st-pay-month">{p.billingMonth}</span>
                  <span className="st-pay-amt">{p.amount.toLocaleString()}원</span>
                  <span className={`pay-badge ${p.status}`}>{p.status === 'paid' ? '완납' : '미납'}</span>
                  <span className="st-pay-date">{p.paymentDate || '—'}</span>
                </div>
              ))}
          </div>
        )}
        {tab === 'counsel' && (
          <div className="st-counsel">
            <div className="st-counsel-head"><h4>상담 · 진도 · 평가 일지</h4><button className="pay-btn ghost sm"><Icon name="plus" size={14} /> 일지 작성</button></div>
            {selLogs.length === 0 ? <p className="st-empty-line">기록된 일지가 없습니다.</p> :
              selLogs.map(l => (
                <div className="st-log" key={l.id}>
                  <div className="st-log-head"><span className={`st-log-type ${l.type}`}>{l.type === 'counsel' ? '상담' : l.type === 'test' ? '평가' : '진도'}</span><span className="st-log-title">{l.title}</span><span className="st-log-date">{l.date}</span></div>
                  <p className="st-log-content">{l.content}</p>
                  {l.score && <span className="st-log-score">점수 {l.score}</span>}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  ) : <div className="gd-empty"><Icon name="users" size={28} /><span>학생을 선택하세요</span></div>;

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      <div className={`st-shell ${mobile ? (mobileDetail ? 'show-detail' : 'show-list') : ''}`}>
        {(!mobile || !mobileDetail) && <section className="gd-card st-card-list">{ListPane}</section>}
        {(!mobile || mobileDetail) && <section className="gd-card st-card-detail">{DetailPane}</section>}
      </div>
    </div>
  );
}

window.GrowingStudents = GrowingStudents;
})();
