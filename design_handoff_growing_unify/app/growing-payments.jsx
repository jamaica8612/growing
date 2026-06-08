/* 그로잉영어 — 수납 관리 리디자인 (인터랙티브)
   window.GrowingPayments({ variant }) */
(function () {
const { useState, useMemo } = React;
const Icon = window.GDIcon;
const Ring = window.GDRing;

const METHOD = { card: '카드', cash: '현금', transfer: '계좌이체' };

function GrowingPayments({ variant = 'desktop' }) {
  const D = window.GROWING_DATA;
  const mobile = variant === 'mobile';
  const studentById = useMemo(() => Object.fromEntries(D.students.map(s => [s.id, s])), [D]);
  const classOf = (sid) => D.classes.find(c => c.studentIds.includes(sid));

  const [rows, setRows] = useState(() => D.payments.map(p => ({ ...p })));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const monthLabel = D.billingMonth.split('-')[1];

  const totalPaid = rows.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalUnpaid = rows.filter(p => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0);
  const totalExpected = totalPaid + totalUnpaid;
  const paidCount = rows.filter(p => p.status === 'paid').length;
  const billingCount = rows.length;
  const rate = billingCount > 0 ? Math.round((paidCount / billingCount) * 100) : 0;

  const filtered = rows.filter(p => {
    const st = studentById[p.studentId];
    if (!st) return false;
    const okSearch = st.name.includes(search) || (st.school || '').includes(search);
    const okStatus = statusFilter === 'all' || p.status === statusFilter;
    return okSearch && okStatus;
  });

  const today = D.TODAY;
  const recordPay = (id) => {
    setRows(prev => prev.map(p => p.id === id ? { ...p, status: 'paid', paymentDate: today, method: 'card' } : p));
    flash('수납 처리되었어요');
  };
  const cancelPay = (id) => {
    setRows(prev => prev.map(p => p.id === id ? { ...p, status: 'unpaid', paymentDate: undefined, method: undefined } : p));
    flash('미납으로 되돌렸어요');
  };

  const hist = D.revenueHistory;
  const maxV = Math.max(...hist.map(h => h.value), 1);

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      {/* 요약 + 차트 */}
      <div className="pay-top">
        <section className="gd-card pay-summary">
          <div className="pay-expected">
            <span className="pay-exp-label">{monthLabel}월 예상 수납액</span>
            <span className="pay-exp-val">{totalExpected.toLocaleString()}<em>원</em></span>
          </div>
          <div className="pay-sub3">
            <div className="pay-sub ok"><span>납부 완료</span><b>{totalPaid.toLocaleString()}원</b></div>
            <div className="pay-sub danger"><span>미납</span><b>{totalUnpaid.toLocaleString()}원</b></div>
            <div className="pay-sub ring">
              <Ring value={paidCount} total={billingCount} size={52} />
              <div><span>수납률</span><b>{rate}%</b></div>
            </div>
          </div>
          <div className="pay-foot">총 청구 {billingCount}건 · 완료 {paidCount}건 · 미납 {billingCount - paidCount}건</div>
        </section>

        <section className="gd-card pay-chart">
          <h2 className="gd-card-title"><Icon name="trend" size={18} /> 최근 5개월 매출 추이</h2>
          <div className="pay-bars">
            {hist.map((h, i) => (
              <div className="pay-bar-col" key={h.label}>
                <span className="pay-bar-v">{(h.value / 10000).toLocaleString()}만</span>
                <div className="pay-bar" style={{ height: `${Math.max(6, (h.value / maxV) * 130)}px`, opacity: i === hist.length - 1 ? 1 : 0.78 }} />
                <span className="pay-bar-l">{h.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 장부 */}
      <section className="gd-card">
        <div className="pay-toolbar">
          <div className="pay-tools-left">
            <div className="pay-search"><Icon name="search" size={15} />
              <input placeholder="학생 이름 검색…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="gd-seg pay-statusseg">
              {[{ v: 'all', l: '전체' }, { v: 'paid', l: '완납' }, { v: 'unpaid', l: '미납' }].map(o => (
                <button key={o.v} className={`gd-seg-b ${statusFilter === o.v ? 'sel ok' : ''}`} onClick={() => setStatusFilter(o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <div className="pay-tools-right">
            <button className="pay-btn ghost"><Icon name="plus" size={15} /> 청구서 추가</button>
            <button className="pay-btn primary">🌱 {monthLabel}월 청구 일괄 생성</button>
          </div>
        </div>

        {!mobile && (
          <div className="pay-thead">
            <span>학생</span><span>수강 과정</span><span>청구액</span><span>상태</span><span>납부일</span><span>수단</span><span className="ta-r">처리</span>
          </div>
        )}

        <div className="pay-rows">
          {filtered.length === 0 ? (
            <div className="gd-empty"><Icon name="check" size={28} /><span>조건에 맞는 내역이 없어요</span></div>
          ) : filtered.map(p => {
            const st = studentById[p.studentId];
            const cls = classOf(p.studentId);
            return (
              <div className={`pay-row ${p.status}`} key={p.id}>
                <div className="pay-c pay-name"><b>{st.name}</b>{mobile && <span className="pay-cls-m">{cls?.name || '개별 코스'}</span>}</div>
                <div className="pay-c pay-cls">{cls?.name || '개별 코스'}</div>
                <div className="pay-c pay-amt">{p.amount.toLocaleString()}원</div>
                <div className="pay-c"><span className={`pay-badge ${p.status}`}>{p.status === 'paid' ? '완납' : '미납'}</span></div>
                <div className="pay-c pay-date">{p.paymentDate || '—'}</div>
                <div className="pay-c pay-method">{p.method ? METHOD[p.method] : '—'}</div>
                <div className="pay-c pay-act">
                  {p.status === 'unpaid'
                    ? <button className="pay-btn primary sm" onClick={() => recordPay(p.id)}>수납 처리</button>
                    : <button className="pay-btn ghost sm" onClick={() => cancelPay(p.id)}>수납 취소</button>}
                  <button className="pay-icon" title="삭제"><Icon name="trash" size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingPayments = GrowingPayments;
})();
