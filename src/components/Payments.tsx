import React, { useMemo, useState } from 'react';
import type { Student, Class, Payment, PaymentMethod, PaymentStatus } from '../types';
import { CreditCard, Plus, Trash2, ArrowUpRight, X, CheckCircle2 } from 'lucide-react';
import { buildMonthlyBillingPreview } from '../lib/billingPreview';

interface PaymentsProps {
  payments: Payment[];
  students: Student[];
  classes: Class[];
  onGenerateMonthlyBills: (month: string) => Promise<{ created: number; skipped: number } | undefined>;
  onRecordPayment: (paymentId: string, paymentDate: string, method: PaymentMethod) => void;
  onCancelPayment: (paymentId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onAddManualPayment: (paymentData: Omit<Payment, 'id'>) => void;
}

export const Payments: React.FC<PaymentsProps> = ({
  payments,
  students,
  classes,
  onGenerateMonthlyBills,
  onRecordPayment,
  onCancelPayment,
  onDeletePayment,
  onAddManualPayment,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');

  // Manual payment state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualAmount, setManualAmount] = useState(200000);

  // Batch bill preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(null);
  
  // Record payment state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('card');

  // Filter payments by selected month & search & status
  const filteredPayments = payments
    .filter(p => p.billingMonth === selectedMonth)
    .filter(p => {
      const student = students.find(s => s.id === p.studentId);
      if (!student) return false;
      
      const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase()) || student.school.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

  // Calculate statistics for the selected month
  const totalPaid = payments
    .filter(p => p.billingMonth === selectedMonth && p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalUnpaid = payments
    .filter(p => p.billingMonth === selectedMonth && p.status === 'unpaid')
    .reduce((sum, p) => sum + p.amount, 0);

  const billingCount = payments.filter(p => p.billingMonth === selectedMonth).length;
  const paidCount = payments.filter(p => p.billingMonth === selectedMonth && p.status === 'paid').length;
  const paymentRate = billingCount > 0 ? Math.round((paidCount / billingCount) * 100) : 0;

  // 예상 수납액 = 이번 달 청구 총액(납부 + 미납), 미납률은 금액 기준.
  const totalExpected = totalPaid + totalUnpaid;
  const unpaidRate = totalExpected > 0 ? Math.round((totalUnpaid / totalExpected) * 100) : 0;

  // 미리보기는 생성 로직과 동일한 헬퍼로 계산 → 보이는 것과 만들어지는 것이 일치.
  const preview = useMemo(
    () => buildMonthlyBillingPreview(students, classes, payments, selectedMonth),
    [students, classes, payments, selectedMonth]
  );
  const previewCreateTotal = preview.toCreate.reduce((sum, r) => sum + r.amount, 0);

  // Open Record Payment Modal
  const handleOpenRecordPayment = (paymentId: string) => {
    setRecordingPaymentId(paymentId);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('card');
    setIsRecordModalOpen(true);
  };

  // Submit payment record
  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordingPaymentId) return;
    onRecordPayment(recordingPaymentId, payDate, payMethod);
    setIsRecordModalOpen(false);
    setRecordingPaymentId(null);
  };

  // Submit manual bill creation
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStudentId) {
      alert('학생을 선택해 주세요.');
      return;
    }

    onAddManualPayment({
      studentId: manualStudentId,
      billingMonth: selectedMonth,
      amount: manualAmount,
      status: 'unpaid',
    });

    setIsManualModalOpen(false);
  };

  // 미리보기 모달 열기 (바로 생성하지 않고 대상부터 확인)
  const handleOpenPreview = () => {
    if (students.filter(s => s.status === 'active').length === 0) {
      alert('현재 재원 중인 학생이 없습니다.');
      return;
    }
    setGenResult(null);
    setIsPreviewOpen(true);
  };

  // 미리보기에서 확인을 눌렀을 때만 실제 생성. 결과(생성/건너뜀)를 모달에 표시.
  const handleConfirmGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await onGenerateMonthlyBills(selectedMonth);
      if (result) {
        setGenResult(result);
      } else {
        // guard가 오류를 처리(알림)한 경우 — 모달만 닫는다.
        setIsPreviewOpen(false);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Historical revenue calculation for the last 5 months
  const getHistoricalRevenue = () => {
    const months: string[] = [];
    const today = new Date();
    
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().substring(0, 7)); // YYYY-MM
    }

    return months.map(m => {
      const revenue = payments
        .filter(p => p.billingMonth === m && p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        label: `${m.split('-')[1]}월`,
        value: revenue,
        rawMonth: m,
      };
    });
  };

  const revenueHistory = getHistoricalRevenue();
  const maxHistoryValue = Math.max(...revenueHistory.map(h => h.value), 1); // Avoid division by 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Metrics and Revenue Chart Row */}
      <div className="grid-container cols-2-1">
        {/* Left: Monthly Summary Metrics */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h3 className="card-title">
            <CreditCard size={20} className="text-primary" /> {selectedMonth.split('-')[1]}월 수납 요약 지표
          </h3>

          {/* 예상 수납액(이번 달 청구 총액)을 가장 크게 — 운영 첫 화면 숫자 */}
          <div style={{ margin: '0.75rem 0 0.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>이번 달 예상 수납액</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>
              {totalExpected.toLocaleString()}원
            </div>
          </div>

          <div className="grid-container cols-3" style={{ gap: '1rem', margin: '0.75rem 0' }}>
            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-light)', border: '1px solid #a3e2c9', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 600 }}>납부액</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.25rem' }}>
                {totalPaid.toLocaleString()}원
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-light)', border: '1px solid #fee2e2', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)', fontWeight: 600 }}>미납액</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: '0.25rem' }}>
                {totalUnpaid.toLocaleString()}원
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f0f7f3', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>미납률</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: unpaidRate > 0 ? 'var(--color-danger)' : 'var(--color-primary-dark)', marginTop: '0.25rem' }}>
                {unpaidRate}%
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
            <span>총 청구 {billingCount}건 · 완료 {paidCount}건</span>
            <span>건수 기준 수납률 {paymentRate}%</span>
          </div>
        </div>

        {/* Right: Revenue growth bar chart */}
        <div className="card">
          <h3 className="card-title">
            <ArrowUpRight size={20} className="text-success" /> 최근 5개월 매출 추이 (수납 완료액 기준)
          </h3>
          <div className="css-chart">
            {revenueHistory.map(item => {
              const heightPercent = (item.value / maxHistoryValue) * 120; // scale to fit nicely in 160px height
              return (
                <div key={item.rawMonth} className="chart-bar-wrapper">
                  <div
                    className="chart-bar"
                    style={{ height: `${Math.max(5, heightPercent)}px` }}
                    data-value={`${(item.value / 10000).toLocaleString()}만원`}
                  />
                  <div className="chart-label">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Payment Administration Board */}
      <div className="card">
        {/* Toolbar */}
        <div className="filter-bar">
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="month"
              className="form-control"
              style={{ width: '160px' }}
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
            <div className="search-input-wrapper" style={{ width: '220px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="학생 이름 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              style={{ width: '120px' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as PaymentStatus | 'all')}
            >
              <option value="all">전체 상태</option>
              <option value="paid">완납</option>
              <option value="unpaid">미납</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsManualModalOpen(true)}>
              <Plus size={16} /> 청구서 추가
            </button>
            <button className="btn btn-primary" onClick={handleOpenPreview}>
              🌱 {selectedMonth.split('-')[1]}월 청구 일괄 생성
            </button>
          </div>
        </div>

        {/* Payments List Table */}
        <div className="table-wrapper mobile-card-desktop">
          <table className="custom-table">
            <thead>
              <tr>
                <th>학생 이름</th>
                <th>소속 학교</th>
                <th>수강 과정 / 반</th>
                <th>청구 금액</th>
                <th>수납 상태</th>
                <th>납부일자</th>
                <th>결제수단</th>
                <th style={{ textAlign: 'right' }}>수납 처리 및 삭제</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
                    🌱 이번 달에 청구된 수납 내역이 없습니다. [청구 일괄 생성] 버튼을 누르면 재원생 시간표 요금을 기준으로 청구서가 일괄 자동 생성됩니다.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(pay => {
                  const student = students.find(s => s.id === pay.studentId);
                  // Find classes student attends
                  const studentClasses = classes.filter(c => c.studentIds.includes(pay.studentId));
                  const classNamesStr = studentClasses.map(c => c.name).join(', ') || '개별 지정 코스';

                  return (
                    <tr key={pay.id}>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                        {student?.name || '알수없음'}
                      </td>
                      <td>{student?.school || '-'}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        {classNamesStr}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {pay.amount.toLocaleString()}원
                      </td>
                      <td>
                        <span className={`badge ${pay.status === 'paid' ? 'badge-paid' : 'badge-unpaid'}`}>
                          {pay.status === 'paid' ? '완납' : '미납'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{pay.paymentDate || '-'}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {pay.paymentMethod === 'card' ? '카드' :
                         pay.paymentMethod === 'cash' ? '현금' :
                         pay.paymentMethod === 'transfer' ? '계좌이체' : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                          {pay.status === 'unpaid' ? (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => handleOpenRecordPayment(pay.id)}
                            >
                              수납 처리
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                              onClick={() => {
                                if (window.confirm('완납 처리를 취소하고 다시 미납 상태로 되돌리시겠습니까?')) {
                                  onCancelPayment(pay.id);
                                }
                              }}
                            >
                              수납 취소
                            </button>
                          )}
                          <button
                            className="btn-icon-only text-danger"
                            title="청구서 삭제"
                            onClick={() => {
                              if (window.confirm('이 청구 내역을 완전히 삭제하시겠습니까?')) {
                                onDeletePayment(pay.id);
                              }
                            }}
                          >
                            <Trash2 size={15} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {filteredPayments.length === 0 ? (
            <div className="mobile-empty-card">
              🌱 이번 달에 청구된 수납 내역이 없습니다. [청구 일괄 생성] 버튼을 누르면 재원생 시간표 요금을 기준으로 청구서가 일괄 자동 생성됩니다.
            </div>
          ) : (
            filteredPayments.map(pay => {
              const student = students.find(s => s.id === pay.studentId);
              const studentClasses = classes.filter(c => c.studentIds.includes(pay.studentId));
              const classNamesStr = studentClasses.map(c => c.name).join(', ') || '개별 지정 코스';
              const methodLabel =
                pay.paymentMethod === 'card' ? '카드' :
                pay.paymentMethod === 'cash' ? '현금' :
                pay.paymentMethod === 'transfer' ? '계좌이체' : '-';

              return (
                <div key={`${pay.id}-mobile`} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <div>
                      <strong>{student?.name || '알수없음'}</strong>
                      <span>{student?.school || '-'} · {classNamesStr}</span>
                    </div>
                    <span className={`badge ${pay.status === 'paid' ? 'badge-paid' : 'badge-unpaid'}`}>
                      {pay.status === 'paid' ? '완납' : '미납'}
                    </span>
                  </div>

                  <div className="mobile-data-grid">
                    <div>
                      <span>청구 금액</span>
                      <strong>{pay.amount.toLocaleString()}원</strong>
                    </div>
                    <div>
                      <span>납부일자</span>
                      <strong>{pay.paymentDate || '-'}</strong>
                    </div>
                    <div>
                      <span>결제수단</span>
                      <strong>{methodLabel}</strong>
                    </div>
                  </div>

                  <div className="mobile-card-actions">
                    {pay.status === 'unpaid' ? (
                      <button className="btn btn-primary" onClick={() => handleOpenRecordPayment(pay.id)}>
                        수납 처리
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (window.confirm('완납 처리를 취소하고 다시 미납 상태로 되돌리시겠습니까?')) {
                            onCancelPayment(pay.id);
                          }
                        }}
                      >
                        수납 취소
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (window.confirm('이 청구 내역을 완전히 삭제하시겠습니까?')) {
                          onDeletePayment(pay.id);
                        }
                      }}
                    >
                      <Trash2 size={14} /> 삭제
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Record Payment */}
      {isRecordModalOpen && recordingPaymentId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">수납 상세 정보 입력</h3>
              <button className="btn-icon-only" onClick={() => setIsRecordModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>납부 결제 일자</label>
                  <input
                    type="date"
                    className="form-control"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>결제 수단</label>
                  <select
                    className="form-control"
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="card">카드 결제</option>
                    <option value="transfer">계좌이체</option>
                    <option value="cash">현금 결제</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsRecordModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  수납 완료 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Manual Payment */}
      {isManualModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title">개별 청구서 추가</h3>
              <button className="btn-icon-only" onClick={() => setIsManualModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>청구 대상 학생</label>
                  <select
                    className="form-control"
                    value={manualStudentId}
                    onChange={e => setManualStudentId(e.target.value)}
                    required
                  >
                    <option value="">학생을 선택하세요</option>
                    {/* 재원생 + 휴원생(퇴원 제외). 휴원생은 자동 일괄청구에서는 빠지지만
                        교재비 등 예외적 수동 청구는 가능해야 한다. */}
                    {students.filter(s => s.status !== 'inactive').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.status === 'paused' ? ' (휴원)' : ''} ({s.school} | {s.grade.split(' ')[1] || s.grade})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>청구 연월</label>
                  <input
                    type="month"
                    className="form-control"
                    value={selectedMonth}
                    disabled // lock to current view month
                  />
                </div>

                <div className="form-group">
                  <label>청구 금액 (원)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={manualAmount}
                    onChange={e => setManualAmount(Number(e.target.value))}
                    step={5000}
                    min={0}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsManualModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  청구 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Batch Bill Preview & Confirm */}
      {isPreviewOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedMonth.split('-')[0]}년 {selectedMonth.split('-')[1]}월 청구 일괄 생성
              </h3>
              <button className="btn-icon-only" onClick={() => setIsPreviewOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {genResult ? (
                // 생성 완료 결과 화면
                <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                  <CheckCircle2 size={40} style={{ color: 'var(--color-success)' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.75rem' }}>
                    청구서 {genResult.created}건 생성 완료
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.35rem' }}>
                    {genResult.skipped > 0
                      ? `이미 청구가 있어 ${genResult.skipped}건은 건너뛰었습니다.`
                      : '건너뛴 항목은 없습니다.'}
                  </div>
                </div>
              ) : (
                // 미리보기 화면
                <>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                    재원생의 반별 원비(개별 원비 반영)를 기준으로 청구서를 만듭니다. 아래 내용을 확인한 뒤 생성하세요.
                  </p>

                  {/* 생성 예정 */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>
                        생성 예정 {preview.toCreate.length}건
                      </strong>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                        합계 {previewCreateTotal.toLocaleString()}원
                      </span>
                    </div>
                    {preview.toCreate.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
                        새로 생성할 청구서가 없습니다. (모두 이미 청구되었거나 제외 대상)
                      </div>
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

                  {/* 이미 청구됨 (건너뜀) */}
                  {preview.alreadyBilled.length > 0 && (
                    <div style={{ marginBottom: '0.85rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        이미 있음 · 건너뜀 {preview.alreadyBilled.length}건
                      </strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                        {preview.alreadyBilled.map(r => r.name).join(', ')}
                      </div>
                    </div>
                  )}

                  {/* 제외 (반 미배정·원비 0) */}
                  {preview.excluded.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        제외 {preview.excluded.length}건
                      </strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                        {preview.excluded.map(r => `${r.name}(${r.reason})`).join(', ')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              {genResult ? (
                <button type="button" className="btn btn-primary" onClick={() => setIsPreviewOpen(false)}>
                  닫기
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsPreviewOpen(false)} disabled={isGenerating}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmGenerate}
                    disabled={isGenerating || preview.toCreate.length === 0}
                  >
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
