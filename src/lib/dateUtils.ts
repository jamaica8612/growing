const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function kstDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = KST_DATE_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** 한국 표준시 기준 날짜 YYYY-MM-DD */
export function localToday(date = new Date()): string {
  const { year, month, day } = kstDateParts(date);
  return `${year}-${month}-${day}`;
}

/** 한국 표준시 기준 월 YYYY-MM */
export function localMonth(date = new Date()): string {
  const { year, month } = kstDateParts(date);
  return `${year}-${month}`;
}
