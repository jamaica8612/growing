import type { Payment, Class } from '../types';

export interface StudentPaymentStats {
  totalBilled: number;
  totalPaid: number;
  unpaidAmount: number;
  rate: number;
}

export interface ClassPaymentStats {
  className: string;
  totalBilled: number;
  totalPaid: number;
  unpaidAmount: number;
  rate: number;
  studentCount: number;
}

export interface UnpaidMonthsClassification {
  monthsOverdue: number;
  severity: 'current' | 'warning' | 'danger';
  label: string;
}

export interface PaymentMethodStat {
  method: string;
  label: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface PaymentState {
  state: 'paid' | 'partial' | 'unpaid';
  label: string;
  color: string;
}

/**
 * 학생별 누적 수납 통계 (모든 달 합산, 월 필터 미적용)
 */
export function getStudentPaymentStats(
  studentId: string,
  payments: Payment[]
): StudentPaymentStats {
  const studentPayments = payments.filter(p => p.studentId === studentId);

  const totalBilled = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = studentPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const unpaidAmount = totalBilled - totalPaid;
  const rate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  return {
    totalBilled,
    totalPaid,
    unpaidAmount,
    rate,
  };
}

/**
 * 반별 수납 현황 (Class별 학생들의 청구/완납 합계)
 */
export function getClassPaymentStats(
  classId: string,
  payments: Payment[],
  classes: Class[]
): ClassPaymentStats {
  const cls = classes.find(c => c.id === classId);
  if (!cls) {
    return {
      className: '알 수 없음',
      totalBilled: 0,
      totalPaid: 0,
      unpaidAmount: 0,
      rate: 0,
      studentCount: 0,
    };
  }

  const classStudentIds = cls.studentIds || [];
  const classPayments = payments.filter(p => classStudentIds.includes(p.studentId));

  const totalBilled = classPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = classPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const unpaidAmount = totalBilled - totalPaid;
  const rate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const studentCount = classStudentIds.length;

  return {
    className: cls.name,
    totalBilled,
    totalPaid,
    unpaidAmount,
    rate,
    studentCount,
  };
}

/**
 * 미납 기간 분류 (실제 오늘 월 기준)
 * 예: currentMonth='2026-06', payment.billingMonth='2026-05' → 1개월 연체
 * 주의: 비교 기준은 화면에서 선택한 월이 아니라 "오늘 날짜의 월"이어야 한다.
 *       (선택 월로 비교하면 청구월===선택월이라 항상 0개월이 되어 연체가 안 보임)
 */
export function classifyUnpaidMonths(
  payment: Payment,
  currentMonth: string
): UnpaidMonthsClassification {
  if (payment.status === 'paid') {
    return {
      monthsOverdue: 0,
      severity: 'current',
      label: '완납',
    };
  }

  const [curYear, curMonth] = currentMonth.split('-').map(Number);
  const [payYear, payMonth] = payment.billingMonth.split('-').map(Number);

  const monthsDiff = (curYear - payYear) * 12 + (curMonth - payMonth);

  if (monthsDiff <= 0) {
    return {
      monthsOverdue: 0,
      severity: 'current',
      label: '당월 미납',
    };
  } else if (monthsDiff === 1) {
    return {
      monthsOverdue: 1,
      severity: 'warning',
      label: '1개월 연체',
    };
  } else if (monthsDiff === 2) {
    return {
      monthsOverdue: 2,
      severity: 'warning',
      label: '2개월 연체',
    };
  } else {
    return {
      monthsOverdue: Math.min(monthsDiff, 3),
      severity: 'danger',
      label: `${monthsDiff}개월 연체`,
    };
  }
}

/**
 * 결제 방법별 통계
 */
export function getPaymentMethodStats(payments: Payment[]): PaymentMethodStat[] {
  const methods: Record<string, PaymentMethodStat> = {
    card: { method: 'card', label: '카드', count: 0, amount: 0, percentage: 0 },
    cash: { method: 'cash', label: '현금', count: 0, amount: 0, percentage: 0 },
    transfer: { method: 'transfer', label: '계좌이체', count: 0, amount: 0, percentage: 0 },
  };

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  payments.forEach(p => {
    if (p.paymentMethod && methods[p.paymentMethod]) {
      methods[p.paymentMethod].count += 1;
      methods[p.paymentMethod].amount += p.amount || 0;
    }
  });

  Object.keys(methods).forEach(key => {
    methods[key].percentage =
      totalAmount > 0 ? Math.round((methods[key].amount / totalAmount) * 100) : 0;
  });

  return Object.values(methods).filter(m => m.count > 0);
}

/**
 * 부분납부 분류 (향후 확장용)
 */
export function classifyPaymentState(
  payment: Payment,
  expectedAmount: number
): PaymentState {
  if (payment.status === 'paid') {
    return {
      state: 'paid',
      label: '완납',
      color: 'var(--color-accent-mint)',
    };
  }

  if (expectedAmount === 0) {
    return {
      state: 'unpaid',
      label: '미납',
      color: 'var(--color-danger)',
    };
  }

  // payment.status는 여기서 반드시 'unpaid'
  const paid = payment.amount || 0;
  const rate = expectedAmount > 0 ? paid / expectedAmount : 0;

  if (rate === 0) {
    return {
      state: 'unpaid',
      label: '미납',
      color: 'var(--color-danger)',
    };
  } else if (rate >= 1) {
    return {
      state: 'paid',
      label: '완납',
      color: 'var(--color-accent-mint)',
    };
  } else {
    return {
      state: 'partial',
      label: '부분납부',
      color: 'var(--color-warning)',
    };
  }
}
