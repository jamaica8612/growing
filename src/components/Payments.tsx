import React, { useMemo, useRef, useState } from 'react';
import type { Student, Class, Payment, PaymentMethod, PaymentStatus } from '../types';
import { BarChart3, Check, CheckCircle2, ExternalLink, PieChart, Plus, Search, TrendingUp, Trash2, Upload, X } from 'lucide-react';
import { buildMonthlyBillingPreview } from '../lib/billingPreview';
import { parsePayssamExcel, type PayssamRow } from '../lib/payssam';
import { getClassPaymentStats, getPaymentMethodStats, classifyUnpaidMonths } from '../lib/paymentStats';

type MatchedRow = PayssamRow & { studentId: string };

interface PaymentsProps {
  payments: Payment[];
  students: Student[];
  classes: Class[];
  onGenerateMonthlyBills: (month: string) => Promise<{ created: number; skipped: number } | undefined>;
  onRecordPayment: (paymentId: string, paymentDate: string, method: PaymentMethod) => void;
  onCancelPayment: (paymentId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onAddManualPayment: (paymentData: Omit<Payment, 'id'>) => void;
  onImportPayssam: (rows: MatchedRow[]) => Promise<{ created: number; updated: number; skipped: number } | undefined>;
}

function Ring({ value, total, size = 52, stroke = 6 }: { value: number; total: number; size?: number; stroke?: number }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3ece7" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={pct >= 1 ? 'var(--color-accent-mint)' : 'var(--color-primary)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(.16,1,.3,1)' }}
      />
    </svg>
  );
}

const METHOD_LABEL: Record<string, string> = {
  card: '카드',
  cash: '현금',
  transfer: '계좌이체',
};

export const Payments: React.FC<PaymentsProps> = ({
  payments,
  students,
  classes,
  onGenerateMonthlyBills,
  onRecordPayment,
  onCancelPayment,
  onDeletePayment,
  onAddManualPayment,
  onImportPayssam,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualAmount, setManualAmount] = useState(200000);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importParsed, setImportParsed] = useState<{ matched: MatchedRow[]; unmatched: PayssamRow[]; errors: string[]; skippedVoid: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('card');

  const monthPayments = useMemo(
    () => payments.filter(p => p.billingMonth === selectedMonth),
    [payments, selectedMonth]
  );
  const filteredPayments = useMemo(
    () => monthPayments.filter(p => {
      const student = students.find(s => s.id === p.studentId);
      if (!student) return false;
      const keyword = search.trim().toLowerCase();
      const matchesSearch = !keyword || student.name.toLowerCase().includes(keyword) || student.school.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    }),
    [monthPayments, search, statusFilter, students]
  );

  const totalPaid = monthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const totalUnpaid = monthPayments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0);
  const billingCount = monthPayments.length;
  const paidCount = monthPayments.filter(p => p.status === 'paid').length;
  const totalExpected = totalPaid + totalUnpaid;
  const paymentRate = billingCount > 0 ? Math.round((paidCount / billingCount) * 100) : 0;

  const preview = useMemo(() => buildMonthlyBillingPreview(students, classes, payments, selectedMonth), [students, classes, payments, selectedMonth]);
  const previewCreateTotal = preview.toCreate.reduce((sum, r) => sum + r.amount, 0);

  // 반별 수납 현황 (useMemo)
  const classPaymentStatsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof getClassPaymentStats>> = {};
    classes.forEach(cls => {
      map[cls.id] = getClassPaymentStats(cls.id, monthPayments, classes);
    });
    return map;
  }, [classes, monthPayments]);

  // 결제 방법별 통계 (useMemo)
  const methodStats = useMemo(() => {
    return getPaymentMethodStats(monthPayments);
  }, [monthPayments]);

  // 미납 기간 맵 (useMemo) — 연체 개월은 "선택 월"이 아니라 "오늘 월" 기준
  const currentMonth = new Date().toISOString().substring(0, 7);
  const unpaidMonthsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof classifyUnpaidMonths>> = {};
    monthPayments.forEach(p => {
      if (p.status === 'unpaid') {
        map[p.id] = classifyUnpaidMonths(p, currentMonth);
      }
    });
    return map;
  }, [monthPayments, currentMonth]);

  const revenueHistory = (() => {
    const months: string[] = [];
    const today = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().substring(0, 7));
    }
    return months.map(m => ({
      label: `${Number(m.split('-')[1])}월`,
      value: payments.filter(p => p.billingMonth === m && p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
      rawMonth: m,
    }));
  })();
  const maxHistoryValue = Math.max(...revenueHistory.map(h => h.value), 1);
  const [yearLabel, monthLabelRaw] = selectedMonth.split('-');
  const monthLabel = Number(monthLabelRaw);

  const handleOpenRecordPayment = (paymentId: string) => {
    setRecordingPaymentId(paymentId);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('card');
    setIsRecordModalOpen(true);
  };

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordingPaymentId) return;
    onRecordPayment(recordingPaymentId, payDate, payMethod);
    setIsRecordModalOpen(false);
    setRecordingPaymentId(null);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStudentId) {
      alert('학생을 선택해 주세요.');
      return;
    }
    onAddManualPayment({ studentId: manualStudentId, billingMonth: selectedMonth, amount: manualAmount, status: 'unpaid' });
    setIsManualModalOpen(false);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const buf = ev.target?.result as ArrayBuffer;
      const result = parsePayssamExcel(buf);
      const norm = (s: string) => s.replace(/\s/g, '');
      const matched: MatchedRow[] = [];
      const unmatched: PayssamRow[] = [];

      for (const row of result.rows) {
        const student = students.find(s => norm(s.name) === norm(row.name));
        if (student) matched.push({ ...row, studentId: student.id });
        else unmatched.push(row);
      }

      setImportParsed({ matched, unmatched, errors: result.errors, skippedVoid: result.skippedVoid });
      setImportResult(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importParsed || importParsed.matched.length === 0) return;
    setIsImporting(true);
    try {
      const result = await onImportPayssam(importParsed.matched);
      if (result) setImportResult(result);
      else setIsImportOpen(false);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloseImport = () => {
    setIsImportOpen(false);
    setImportParsed(null);
    setImportResult(null);
  };

  const handleOpenPreview = () => {
    if (students.filter(s => s.status === 'active').length === 0) {
      alert('현재 재원 중인 학생이 없습니다.');
      return;
    }
    setGenResult(null);
    setIsPreviewOpen(true);
  };

  const handleConfirmGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await onGenerateMonthlyBills(selectedMonth);
      if (result) setGenResult(result);
      else setIsPreviewOpen(false);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="gd-root">
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
              <Ring value={paidCount} total={billingCount} />
              <div><span>수납률</span><b>{paymentRate}%</b></div>
            </div>
          </div>
          <div className="pay-foot">총 청구 {billingCount}건 · 완료 {paidCount}건 · 미납 {billingCount - paidCount}건</div>
        </section>

        <section className="gd-card pay-chart">
          <h2 className="gd-card-title"><TrendingUp size={18} /> 최근 5개월 매출 추이</h2>
          <div className="pay-bars">
            {revenueHistory.map((h, i) => (
              <div className="pay-bar-col" key={h.rawMonth}>
                <span className="pay-bar-v">{h.value > 0 ? `${(h.value / 10000).toLocaleString()}만` : '0'}</span>
                <div className="pay-bar" style={{ height: `${Math.max(6, (h.value / maxHistoryValue) * 130)}px`, opacity: i === revenueHistory.length - 1 ? 1 : 0.78 }} />
                <span className="pay-bar-l">{h.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 반별 수납 비교 차트 */}
        {classes.length > 0 && (
          <section className="gd-card pay-class-chart">
            <h2 className="gd-card-title"><BarChart3 size={18} /> 반별 수납 비교</h2>
            <div className="pay-class-items">
              {classes.slice(0, 8).map(cls => {
                const stats = classPaymentStatsMap[cls.id];
                return (
                  <div className="pay-class-item" key={cls.id}>
                    <div className="pay-class-header">
                      <span className="pay-class-name">{cls.name}</span>
                      <span className="pay-class-rate">{stats.rate}%</span>
                    </div>
                    <div className="pay-class-bar-wrap">
                      <div
                        className="pay-class-bar"
                        style={{ width: `${stats.rate}%` }}
                      />
                    </div>
                    <div className="pay-class-footer">
                      <span>{stats.studentCount}명</span>
                      <span>{(stats.totalPaid / 10000).toLocaleString()}만원</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 결제 방법별 통계 */}
        {methodStats.length > 0 && (
          <section className="gd-card pay-method-chart">
            <h2 className="gd-card-title"><PieChart size={18} /> 결제 방법별 현황</h2>
            <div className="pay-method-items">
              {methodStats.map(stat => {
                const getMethodColor = (): string => {
                  switch (stat.method) {
                    case 'card': return 'color-info';
                    case 'cash': return 'color-warning';
                    case 'transfer': return 'color-success';
                    default: return 'color-text-muted';
                  }
                };
                return (
                  <div className="pay-method-item" key={stat.method}>
                    <div className="pay-method-color" style={{ backgroundColor: `var(--${getMethodColor()})` }} />
                    <div className="pay-method-content">
                      <span className="pay-method-label">{stat.label}</span>
                      <span className="pay-method-count">{stat.count}건</span>
                    </div>
                    <div className="pay-method-right">
                      <span className="pay-method-amount">{(stat.amount / 10000).toLocaleString()}만</span>
                      <span className="pay-method-percent">{stat.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <section className="gd-card">
        <div className="pay-toolbar">
          <div className="pay-tools-left">
            <input type="month" className="form-control" style={{ width: '155px', padding: '0.45rem 0.7rem' }} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
            <div className="pay-search">
              <Search size={15} />
              <input placeholder="학생 이름 검색..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="gd-seg pay-statusseg">
              {([['all', '전체'], ['paid', '완납'], ['unpaid', '미납']] as const).map(([value, label]) => (
                <button key={value} className={`gd-seg-b ${statusFilter === value ? 'sel ok' : ''}`} onClick={() => setStatusFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="pay-tools-right">
            <a className="pay-btn ghost" href="https://manager.payssam.kr/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> 결제선생 바로가기</a>
            <button className="pay-btn ghost" onClick={() => setIsManualModalOpen(true)}><Plus size={15} /> 청구서 추가</button>
            <button className="pay-btn ghost" onClick={() => { setIsImportOpen(true); setImportParsed(null); setImportResult(null); }}><Upload size={15} /> 결제선생</button>
            <button className="pay-btn primary" onClick={handleOpenPreview}>{monthLabel}월 청구 일괄 생성</button>
          </div>
        </div>

        <div className="pay-thead">
          <span>학생</span><span>수강 과정</span><span>청구액</span><span>상태</span><span>납부일</span><span>수단</span><span className="ta-r">처리</span>
        </div>

        <div className="pay-rows">
          {filteredPayments.length === 0 ? (
            <div className="gd-empty">
              <Check size={28} />
              <span>조건에 맞는 내역이 없어요. [일괄 생성] 버튼으로 청구서를 만들어 보세요.</span>
            </div>
          ) : (
            filteredPayments.map(pay => {
              const student = students.find(s => s.id === pay.studentId);
              const studentClasses = classes.filter(c => c.studentIds.includes(pay.studentId));
              const classNamesStr = studentClasses.map(c => c.name).join(', ') || '개별 코스';

              return (
                <div className="pay-row" key={pay.id}>
                  <div className="pay-c pay-name">
                    <b>{student?.name || '알 수 없음'}</b>
                    <span className="pay-cls-m">{classNamesStr}</span>
                  </div>
                  <div className="pay-c pay-cls">{classNamesStr}</div>
                  <div className="pay-c pay-amt">{pay.amount.toLocaleString()}원</div>
                  <div className="pay-c">
                    {pay.status === 'paid' ? (
                      <span className="pay-badge paid">완납</span>
                    ) : unpaidMonthsMap[pay.id] ? (
                      <span className={`pay-badge unpaid unpaid-${unpaidMonthsMap[pay.id].severity}`}>
                        {unpaidMonthsMap[pay.id].label}
                      </span>
                    ) : (
                      <span className="pay-badge unpaid">미납</span>
                    )}
                  </div>
                  <div className="pay-c pay-date">{pay.paymentDate || '-'}</div>
                  <div className="pay-c pay-method">{pay.paymentMethod ? METHOD_LABEL[pay.paymentMethod] ?? '-' : '-'}</div>
                  <div className="pay-c pay-act">
                    {pay.status === 'unpaid' ? (
                      <button className="pay-btn primary sm" onClick={() => handleOpenRecordPayment(pay.id)}>수납 처리</button>
                    ) : (
                      <button className="pay-btn ghost sm" onClick={() => { if (window.confirm('완납을 취소하고 미납으로 되돌릴까요?')) onCancelPayment(pay.id); }}>수납 취소</button>
                    )}
                    <button className="pay-icon" title="청구서 삭제" onClick={() => { if (window.confirm('이 청구 내역을 삭제할까요?')) onDeletePayment(pay.id); }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {isRecordModalOpen && recordingPaymentId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">수납 상세 정보 입력</h3>
              <button className="btn-icon-only" onClick={() => setIsRecordModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleRecordSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>납부 결제 일자</label>
                  <input type="date" className="form-control" value={payDate} onChange={e => setPayDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>결제 수단</label>
                  <select className="form-control" value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}>
                    <option value="card">카드 결제</option>
                    <option value="transfer">계좌이체</option>
                    <option value="cash">현금 결제</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsRecordModalOpen(false)}>취소</button>
                <button type="submit" className="btn btn-primary">수납 완료 저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title">개별 청구서 추가</h3>
              <button className="btn-icon-only" onClick={() => setIsManualModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>청구 대상 학생</label>
                  <select className="form-control" value={manualStudentId} onChange={e => setManualStudentId(e.target.value)} required>
                    <option value="">학생을 선택하세요</option>
                    {students.filter(s => s.status !== 'inactive').map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.status === 'paused' ? ' (휴원)' : ''} ({s.school} | {s.grade.split(' ')[1] || s.grade})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>청구 월</label>
                  <input type="month" className="form-control" value={selectedMonth} disabled />
                </div>
                <div className="form-group">
                  <label>청구 금액 (원)</label>
                  <input type="number" className="form-control" value={manualAmount} onChange={e => setManualAmount(Number(e.target.value))} step={5000} min={0} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsManualModalOpen(false)}>취소</button>
                <button type="submit" className="btn btn-primary">청구 등록</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFileChange} />

      {isImportOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">결제선생 발송수납내역 가져오기</h3>
              <button className="btn-icon-only" onClick={handleCloseImport}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {importResult ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                  <CheckCircle2 size={40} style={{ color: 'var(--color-success)' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.75rem' }}>가져오기 완료</div>
                  <div style={{ fontSize: '0.87rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem', lineHeight: 1.7 }}>
                    신규 생성 {importResult.created}건 · 납부 업데이트 {importResult.updated}건 · 건너뜀 {importResult.skipped}건
                  </div>
                </div>
              ) : !importParsed ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', lineHeight: 1.7 }}>
                    결제선생 매니저 또는 엑셀에서<br /><strong>발송수납내역 파일(.xlsx)</strong>을 내려받아 업로드하세요.
                  </div>
                  <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> 파일 선택</button>
                  <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    지원 형식: xlsx · 컬럼: 발송일시, 이름, 금액(원), 품목, 수납상태<br />수납 완료와 현장수납 내역만 가져오고, 파기 내역은 자동 제외합니다.
                  </div>
                </div>
              ) : (
                <>
                  {importParsed.errors.length > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '0.65rem 0.85rem', marginBottom: '0.85rem', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
                      {importParsed.errors.map((error, i) => <div key={i}>{error}</div>)}
                    </div>
                  )}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>가져올 항목 {importParsed.matched.length}건</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>학생 매칭 완료</span>
                    </div>
                    {importParsed.matched.length === 0 ? (
                      <div style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>Growing에 등록된 학생과 일치하는 항목이 없습니다.</div>
                    ) : (
                      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                        {importParsed.matched.map((row, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', fontSize: '0.84rem', borderBottom: '1px solid #f0f2f0', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, minWidth: 60 }}>{row.name}</span>
                            <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{row.item}</span>
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.amount.toLocaleString()}원</span>
                            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: 999, background: row.isPaid ? '#d1fae5' : '#fef3c7', color: row.isPaid ? '#065f46' : '#92400e', whiteSpace: 'nowrap' }}>{row.rawStatus}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {importParsed.unmatched.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>학생 미매칭 · 건너뜀 {importParsed.unmatched.length}건</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', lineHeight: 1.6 }}>
                        {importParsed.unmatched.map(row => row.name).join(', ')} 은 Growing에 등록된 이름과 다릅니다.
                      </div>
                    </div>
                  )}
                  {importParsed.skippedVoid > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>실제 취소/파기 {importParsed.skippedVoid}건은 자동 제외합니다.</div>}
                  <button className="btn btn-secondary" style={{ marginTop: '0.85rem', fontSize: '0.82rem' }} onClick={() => fileInputRef.current?.click()}>다른 파일 선택</button>
                </>
              )}
            </div>
            <div className="modal-footer">
              {importResult ? (
                <button type="button" className="btn btn-primary" onClick={handleCloseImport}>닫기</button>
              ) : !importParsed ? (
                <button type="button" className="btn btn-secondary" onClick={handleCloseImport}>취소</button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={handleCloseImport} disabled={isImporting}>취소</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmImport} disabled={isImporting || importParsed.matched.length === 0}>
                    {isImporting ? '가져오는 중...' : `${importParsed.matched.length}건 가져오기`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{yearLabel}년 {monthLabel}월 청구 일괄 생성</h3>
              <button className="btn-icon-only" onClick={() => setIsPreviewOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {genResult ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                  <CheckCircle2 size={40} style={{ color: 'var(--color-success)' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.75rem' }}>청구서 {genResult.created}건 생성 완료</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.35rem' }}>
                    {genResult.skipped > 0 ? `이미 청구가 있어 ${genResult.skipped}건은 건너뛰었습니다.` : '건너뛴 항목은 없습니다.'}
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>재원생의 반별 수업료를 기준으로 청구서를 만듭니다. 확인 후 생성하세요.</p>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>생성 예정 {preview.toCreate.length}건</strong>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>합계 {previewCreateTotal.toLocaleString()}원</span>
                    </div>
                    {preview.toCreate.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>새로 생성할 청구서가 없습니다.</div>
                    ) : (
                      <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                        {preview.toCreate.map(row => (
                          <div key={row.studentId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderBottom: '1px solid #f0f2f0' }}>
                            <span>{row.name}</span>
                            <span style={{ fontWeight: 600 }}>{row.amount.toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {preview.alreadyBilled.length > 0 && (
                    <div style={{ marginBottom: '0.85rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>이미 있음 · 건너뜀 {preview.alreadyBilled.length}건</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{preview.alreadyBilled.map(row => row.name).join(', ')}</div>
                    </div>
                  )}
                  {preview.excluded.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>제외 {preview.excluded.length}건</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{preview.excluded.map(row => `${row.name}(${row.reason})`).join(', ')}</div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              {genResult ? (
                <button type="button" className="btn btn-primary" onClick={() => setIsPreviewOpen(false)}>닫기</button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsPreviewOpen(false)} disabled={isGenerating}>취소</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmGenerate} disabled={isGenerating || preview.toCreate.length === 0}>
                    {isGenerating ? '생성 중...' : `${preview.toCreate.length}건 생성`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
