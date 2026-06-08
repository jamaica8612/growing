/* 그로잉영어 — 반/시간표 관리 리디자인
   window.GrowingClasses({ variant }) */
(function () {
const { useMemo } = React;
const Icon = window.GDIcon;

const DAYS = ['월', '화', '수', '목', '금'];
const START_H = 13, END_H = 20;
const TOTAL = (END_H - START_H) * 60;
const mins = (t) => { const [h, m] = t.split(':').map(Number); return Math.max(0, h * 60 + m - START_H * 60); };
const dur = (a, b) => { const [ah, am] = a.split(':').map(Number); const [bh, bm] = b.split(':').map(Number); return (bh * 60 + bm) - (ah * 60 + am); };

function GrowingClasses({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const activeIds = useMemo(() => new Set(D.students.filter(s => s.status === 'active').map(s => s.id)), [D]);
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);

  const summary = D.classes.map(cls => {
    const members = cls.studentIds.filter(id => activeIds.has(id));
    return { cls, count: members.length, tuition: members.length * (cls.tuitionFee || 0) };
  });
  const totals = summary.reduce((a, c) => ({ count: a.count + c.count, tuition: a.tuition + c.tuition }), { count: 0, tuition: 0 });

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 주간 시간표 */}
      <section className="gd-card">
        <div className="gd-card-head">
          <h2 className="gd-card-title"><Icon name="calendar" size={18} /> 주간 강의 시간표 <span className="cl-count">월–금</span></h2>
          <button className="pay-btn primary"><Icon name="plus" size={15} /> 클래스 추가</button>
        </div>
        <div className="tt-wrap">
          <div className="tt-grid">
            <div className="tt-corner">시간</div>
            {DAYS.map(d => <div className="tt-dayhead" key={d}>{d}요일</div>)}
            <div className="tt-timecol">
              {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
                <div className="tt-time" key={i} style={{ top: `${(i / (END_H - START_H)) * 100}%` }}>{String(START_H + i).padStart(2, '0')}:00</div>
              ))}
            </div>
            {DAYS.map(day => (
              <div className="tt-daycol" key={day}>
                {D.classes.flatMap(cls => cls.schedules.filter(s => s.day === day).map(s => ({ cls, s }))).map(({ cls, s }) => {
                  const members = cls.studentIds.filter(id => activeIds.has(id)).length;
                  return (
                    <div className="tt-slot" key={`${cls.id}-${s.startTime}`}
                      style={{ top: `${(mins(s.startTime) / TOTAL) * 100}%`, height: `${(dur(s.startTime, s.endTime) / TOTAL) * 100}%`, background: `${cls.color}1f`, borderLeftColor: cls.color, color: cls.color }}>
                      <span className="tt-slot-name">{cls.name}</span>
                      <span className="tt-slot-time">{s.startTime}–{s.endTime}</span>
                      <span className="tt-slot-count">👤 {members}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="cls-grid2">
        {/* 반별 현황 요약 */}
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}><Icon name="users" size={18} /> 반별 현황 요약</h2>
          <div className="cls-summary">
            {summary.map(({ cls, count, tuition }) => (
              <div className="cls-srow" key={cls.id} style={{ borderLeftColor: cls.color }}>
                <span className="cls-sname" style={{ color: cls.color }}>{cls.name}</span>
                <span className="cls-scount">재원 {count}명</span>
                <span className="cls-stui">{tuition.toLocaleString()}원</span>
              </div>
            ))}
            <div className="cls-srow total">
              <span className="cls-sname">전체 합계</span>
              <span className="cls-scount">재원 {totals.count}명</span>
              <span className="cls-stui">{totals.tuition.toLocaleString()}원</span>
            </div>
          </div>
        </section>

        {/* 운영 중인 클래스 */}
        <section className="gd-card">
          <h2 className="gd-card-title" style={{ marginBottom: '1rem' }}><Icon name="book" size={18} /> 운영 중인 클래스 <span className="cl-count">{D.classes.length}개</span></h2>
          <div className="cls-cards">
            {D.classes.map(cls => {
              const members = cls.studentIds.filter(id => activeIds.has(id));
              return (
                <div className="cls-card" key={cls.id} style={{ borderTopColor: cls.color }}>
                  <div className="cls-card-head"><span className="cls-card-name" style={{ color: cls.color }}>{cls.name}</span>
                    {members.length >= (cls.capacity || 99) && <span className="cls-full">정원 마감</span>}
                  </div>
                  <div className="cls-cap">
                    <div className="cls-cap-bar"><i style={{ width: `${Math.min(100, (members.length / (cls.capacity || members.length || 1)) * 100)}%`, background: cls.color }} /></div>
                    <span className="cls-cap-t">재원 {members.length}<em> / 정원 {cls.capacity}</em></span>
                  </div>
                  <div className="cls-card-line"><Icon name="clock" size={13} /> {cls.schedules.map(s => `${s.day} ${s.startTime}`).join(' · ')}</div>
                  <div className="cls-card-line"><Icon name="card" size={13} /> 기본 원비 {(cls.tuitionFee || 0).toLocaleString()}원</div>
                  <div className="cls-chips">
                    {members.length === 0 ? <span className="cls-empty">배정 없음</span> :
                      cls.studentIds.map(sid => {
                        const st = studentById[sid];
                        const paused = st?.status === 'paused';
                        return <span key={sid} className={`cls-chip ${paused ? 'paused' : ''}`}>{st?.name || '미등록'}{paused ? ' (휴원)' : ''}</span>;
                      })}
                  </div>
                  {cls.waitlist && cls.waitlist.length > 0 && (
                    <div className="cls-wait">
                      <span className="cls-wait-h">⏳ 대기 {cls.waitlist.length}명</span>
                      {cls.waitlist.map((w, i) => <span key={i} className="cls-wchip">{w}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

window.GrowingClasses = GrowingClasses;
})();
