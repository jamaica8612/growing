-- 월별 청구는 학생당 하나만 유지한다. 분할 납부는 청구 행을 늘리지 않고
-- 기존 청구의 납부 상태/수단을 갱신하는 현재 앱 계약을 따른다.
create unique index if not exists uq_growing_payments_owner_student_month
  on public.growing_payments (owner_id, student_id, billing_month);

-- 취소 이력은 여러 건 보존할 수 있지만, 한 결석일에 활성 예약은 하나만 둔다.
create unique index if not exists uq_growing_makeup_active_absence
  on public.growing_makeup_reservations (owner_id, student_id, source_absence_date)
  where source_absence_date is not null and status <> 'cancelled';
