import type { Student, Class, Payment } from '../types';
import { getStudentClassTuition } from './classTuition';

// 한 학생의 청구 미리보기 행.
export interface BillingPreviewRow {
  studentId: string;
  name: string;
  amount: number;
}

// 제외(청구 안 됨) 학생과 그 사유.
export interface BillingExcludedRow {
  studentId: string;
  name: string;
  reason: string;
}

export interface BillingPreview {
  toCreate: BillingPreviewRow[];        // 새로 생성될 청구
  alreadyBilled: BillingPreviewRow[];   // 이미 해당 월 청구 존재 → 건너뜀
  excluded: BillingExcludedRow[];       // 반 미배정·원비 0 등으로 제외
}

// 선택한 월의 일괄 청구 결과를 미리 계산한다.
// 미리보기 화면과 실제 생성 로직이 같은 함수를 공유해, 보이는 것과 만들어지는 것이
// 어긋나지 않도록 한다. (멱등성: 이미 청구가 있으면 항상 건너뜀)
export function buildMonthlyBillingPreview(
  students: Student[],
  classes: Class[],
  payments: Payment[],
  month: string,
): BillingPreview {
  const toCreate: BillingPreviewRow[] = [];
  const alreadyBilled: BillingPreviewRow[] = [];
  const excluded: BillingExcludedRow[] = [];

  students
    .filter(s => s.status === 'active')
    .forEach(student => {
      const existing = payments.find(p => p.studentId === student.id && p.billingMonth === month);
      if (existing) {
        alreadyBilled.push({ studentId: student.id, name: student.name, amount: existing.amount });
        return;
      }
      const studentClasses = classes.filter(c => c.studentIds.includes(student.id));
      if (studentClasses.length === 0) {
        excluded.push({ studentId: student.id, name: student.name, reason: '반 미배정' });
        return;
      }
      const totalTuition = studentClasses.reduce((sum, c) => sum + getStudentClassTuition(c, student.id), 0);
      if (totalTuition <= 0) {
        excluded.push({ studentId: student.id, name: student.name, reason: '원비 0원' });
        return;
      }
      toCreate.push({ studentId: student.id, name: student.name, amount: totalTuition });
    });

  return { toCreate, alreadyBilled, excluded };
}
