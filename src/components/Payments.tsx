import React, { useState } from 'react';
import type { Student, Class, Payment, PaymentMethod, PaymentStatus } from '../types';
import { CreditCard, Plus, Trash2, ArrowUpRight, X } from 'lucide-react';

interface PaymentsProps {
  payments: Payment[];
  students: Student[];
  classes: Class[];
  onGenerateMonthlyBills: (month: string) => void;
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

  // Automated batch bill generation
  const handleGenerateBatchBills = () => {
    const activeCount = students.filter(s => s.status === 'active').length;
    if (activeCount === 0) {
      alert('현재 재원 중인 학생이 없습니다.');
      return;
    }
    
    // Check if bills already exist for the selected month
    const existCount = payments.filter(p => p.billingMonth === selectedMonth).length;
    if (existCount > 0) {
      if (!window.confirm(`${selectedMonth}월에 이미 등록된 수납 내역이 ${existCount}건 존재합니다. 추가로 누락된 학생 청구서를 생성할까요?`)) {
        return;
      }
    }

    onGenerateMonthlyBills(selectedMonth);
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

          <div className="grid-container cols-3" style={{ gap: '1rem', margin: '1rem 0' }}>
            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-light)', border: '1px solid #a3e2c9', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 600 }}>수납 완료 (누계)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.25rem' }}>
                {totalPaid.toLocaleString()}원
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-light)', border: '1px solid #fee2e2', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)', fontWeight: 600 }}>미납 금액</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: '0.25rem' }}>
                {totalUnpaid.toLocaleString()}원
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f0f7f3', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>수납 진행률</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '0.25rem' }}>
                {paymentRate}%
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
            <span>총 청구 건수: {billingCount}건</span>
            <span>수납 완료 건수: {paidCount}건</span>
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
            <button className="btn btn-primary" onClick={handleGenerateBatchBills}>
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
                    {students.filter(s => s.status === 'active').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.school} | {s.grade.split(' ')[1] || s.grade})
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
    </div>
  );
};
