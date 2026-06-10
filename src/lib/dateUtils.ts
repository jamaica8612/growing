/** 로컬(KST) 기준 오늘 날짜 YYYY-MM-DD */
export function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** 로컬(KST) 기준 이번 달 YYYY-MM */
export function localMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
