import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiSource = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const academyDataSource = readFileSync(new URL('../src/hooks/useAcademyData.ts', import.meta.url), 'utf8');
const uniquenessMigration = readFileSync(
  new URL('../supabase/migrations/20260804103658_enforce_billing_and_makeup_uniqueness.sql', import.meta.url),
  'utf8',
);
const kioskMigration = readFileSync(
  new URL('../supabase/migrations/20260804104004_record_kiosk_event_atomically.sql', import.meta.url),
  'utf8',
);

describe('P1 데이터 무결성 회귀 방지', () => {
  it('메시지 로그는 운영 스키마에 없는 sent_at을 요청하지 않는다', () => {
    const messageLogSection = apiSource.slice(
      apiSource.indexOf('// ---- Message logs ----'),
      apiSource.indexOf('// ---- Bulk:'),
    );
    expect(messageLogSection).not.toContain('sent_at');
    expect(messageLogSection).toContain("channel: 'copy'");
  });

  it('수동 월 청구 생성 전에 학생과 청구월 중복을 확인한다', () => {
    const manualPaymentSection = academyDataSource.slice(
      academyDataSource.indexOf('const handleAddManualPayment'),
      academyDataSource.indexOf('// 결제선생'),
    );
    expect(manualPaymentSection).toContain('payment.studentId === data.studentId');
    expect(manualPaymentSection).toContain('payment.billingMonth === data.billingMonth');
  });

  it('DB에서도 월 청구와 활성 보강 예약 중복을 차단한다', () => {
    expect(uniquenessMigration).toContain('(owner_id, student_id, billing_month)');
    expect(uniquenessMigration).toContain('(owner_id, student_id, source_absence_date)');
    expect(uniquenessMigration).toContain("status <> 'cancelled'");
  });

  it('키오스크 출석과 알림을 하나의 DB 함수에서 기록한다', () => {
    expect(kioskMigration).toContain('growing_record_kiosk_event');
    expect(kioskMigration).toContain('insert into public.growing_attendance');
    expect(kioskMigration).toContain('insert into public.growing_kiosk_alerts');
    expect(kioskMigration).toContain('security invoker');
  });
});
