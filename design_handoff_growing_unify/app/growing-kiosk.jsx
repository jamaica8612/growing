/* 그로잉영어 — 자율출결 키오스크 리디자인
   window.GrowingKiosk({ variant }) — 아트보드를 가득 채우는 풀스크린 단말 */
(function () {
const { useState } = React;
const Icon = window.GDIcon;

function GrowingKiosk({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState(null);
  const [success, setSuccess] = useState(null);

  const active = D.students.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const list = active.filter(s => s.name.includes(search) || (s.school || '').includes(search));

  const check = (type) => {
    if (!sel) return;
    setSuccess({ type, name: sel.name });
    setSel(null);
    setTimeout(() => setSuccess(null), 2400);
  };

  return (
    <div className={`kk-root ${mobile ? 'kk-mobile' : ''}`}>
      <header className="kk-head">
        <div className="kk-logo">
          <div className="kk-logo-ic"><svg width={mobile ? 18 : 22} height={mobile ? 18 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/></svg></div>
          <span className="kk-logo-tx">그로잉영어 자율출결</span>
        </div>
        <div className="kk-head-btns">
          <button className="kk-spk"><Icon name="bell" size={14} /> 스피커 테스트</button>
          <button className="kk-lock"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>
        </div>
      </header>

      <div className="kk-body">
        <div className="kk-search">
          <Icon name="search" size={mobile ? 18 : 22} />
          <input placeholder="이름을 입력해 내 이름 찾기…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="kk-grid">
          {list.length === 0 ? <div className="kk-empty">🔍 검색 결과가 없습니다.</div> :
            list.map(s => (
              <button className="kk-card" key={s.id} onClick={() => setSel(s)}>
                <span className="kk-card-name">{s.name}</span>
                <span className="kk-card-sub">{s.school} {s.grade}</span>
              </button>
            ))}
        </div>
      </div>

      <footer className="kk-foot">🌱 등원·하원 시 이름을 탭한 뒤 버튼을 눌러주세요.</footer>

      {sel && (
        <div className="kk-modal-bg" onClick={() => setSel(null)}>
          <div className="kk-modal" onClick={e => e.stopPropagation()}>
            <span className="kk-modal-meta">{sel.school} | {sel.grade}</span>
            <h2 className="kk-modal-name">{sel.name} 학생</h2>
            <div className="kk-modal-btns">
              <button className="kk-btn in" onClick={() => check('in')}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 5-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/></svg>
                등원 완료 🌱
              </button>
              <button className="kk-btn out" onClick={() => check('out')}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
                하원 완료 🏡
              </button>
            </div>
            <button className="kk-cancel" onClick={() => setSel(null)}>선택 취소 (닫기)</button>
          </div>
        </div>
      )}

      {success && (
        <div className={`kk-success ${success.type}`}>
          <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/></svg>
          <h1 className="kk-success-name">{success.name}</h1>
          <p className="kk-success-msg">{success.type === 'in' ? '등원 처리가 완료되었습니다! 🌱' : '하원 처리가 완료되었습니다! 🏡'}</p>
        </div>
      )}
    </div>
  );
}

window.GrowingKiosk = GrowingKiosk;
})();
