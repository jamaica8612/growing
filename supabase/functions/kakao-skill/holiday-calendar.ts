export const HOLIDAY_API_URL = 'https://holidays.hyunbin.page/basic.json';
export const HOLIDAY_VERIFICATION_URL =
  'https://raw.githubusercontent.com/hyunbinseo/holidays-kr/main/public/basic.json';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_RETRY_TTL_MS = 10 * 60 * 1000;
// Kakao skills must answer within 5 seconds. Leave room for Edge cold starts
// and the academy settings query, then fall back to bundled dates quickly.
const FETCH_TIMEOUT_MS = 1_500;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_YEARS = 100;
const MAX_DATES_PER_YEAR = 50;
const MAX_NAMES_PER_DATE = 5;
const MAX_NAME_LENGTH = 80;
const MAX_QUERY_DAYS = 370;
const MAX_CALENDAR_EXCEPTIONS = 500;
const MAX_KAKAO_TEXT_LENGTH = 950;
const MAX_SCHEDULE_LIST_ITEMS = 7;
const MAX_FORMATTED_TITLE_LENGTH = 60;

export type HolidayCalendar = Record<string, Record<string, string[]>>;

export interface CalendarException {
  date: string;
  kind: 'closed' | 'open';
  title: string;
}

export interface HolidayCalendarSettings {
  holiday_auto_close?: boolean | null;
  calendar_exceptions?: unknown;
}

export type CalendarDaySource =
  | 'exception_closed'
  | 'exception_open'
  | 'public_holiday'
  | 'unknown'
  | 'regular';

export interface CalendarDayStatus {
  date: string;
  isClosed: boolean;
  title: string;
  holidayNames: string[];
  source: CalendarDaySource;
}

export interface SchedulePeriod {
  startDate: string;
  endDate: string;
  kind: 'single' | 'week' | 'month' | 'upcoming' | 'invalid';
}

export interface HolidayForDate {
  isClosed: boolean;
  name: string;
  source?: CalendarDaySource;
}

export const FALLBACK_HOLIDAYS: HolidayCalendar = {
  '2026': {
    '2026-01-01': ['1월 1일'],
    '2026-02-16': ['설날 전날'],
    '2026-02-17': ['설날'],
    '2026-02-18': ['설날 다음 날'],
    '2026-03-01': ['3ㆍ1절'],
    '2026-03-02': ['대체공휴일(3ㆍ1절)'],
    '2026-05-01': ['노동절'],
    '2026-05-05': ['어린이날'],
    '2026-05-24': ['부처님 오신 날'],
    '2026-05-25': ['대체공휴일(부처님 오신 날)'],
    '2026-06-03': ['전국동시지방선거'],
    '2026-06-06': ['현충일'],
    '2026-07-17': ['제헌절'],
    '2026-08-15': ['광복절'],
    '2026-08-17': ['대체공휴일(광복절)'],
    '2026-09-24': ['추석 전날'],
    '2026-09-25': ['추석'],
    '2026-09-26': ['추석 다음 날'],
    '2026-10-03': ['개천절'],
    '2026-10-05': ['대체공휴일(개천절)'],
    '2026-10-09': ['한글날'],
    '2026-12-25': ['기독탄신일'],
  },
  '2027': {
    '2027-01-01': ['1월 1일'],
    '2027-02-06': ['설날 전날'],
    '2027-02-07': ['설날'],
    '2027-02-08': ['설날 다음 날'],
    '2027-02-09': ['대체공휴일(설날)'],
    '2027-03-01': ['3ㆍ1절'],
    '2027-05-01': ['노동절'],
    '2027-05-03': ['대체공휴일(노동절)'],
    '2027-05-05': ['어린이날'],
    '2027-05-13': ['부처님 오신 날'],
    '2027-06-06': ['현충일'],
    '2027-07-17': ['제헌절'],
    '2027-07-19': ['대체공휴일(제헌절)'],
    '2027-08-15': ['광복절'],
    '2027-08-16': ['대체공휴일(광복절)'],
    '2027-09-14': ['추석 전날'],
    '2027-09-15': ['추석'],
    '2027-09-16': ['추석 다음 날'],
    '2027-10-03': ['개천절'],
    '2027-10-04': ['대체공휴일(개천절)'],
    '2027-10-09': ['한글날'],
    '2027-10-11': ['대체공휴일(한글날)'],
    '2027-12-25': ['기독탄신일'],
    '2027-12-27': ['대체공휴일(기독탄신일)'],
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function cloneCalendar(calendar: HolidayCalendar): HolidayCalendar {
  return Object.fromEntries(
    Object.entries(calendar).map(([year, dates]) => [
      year,
      Object.fromEntries(Object.entries(dates).map(([date, names]) => [date, [...names]])),
    ]),
  );
}

export function parseHolidayCalendar(value: unknown): HolidayCalendar {
  if (!isPlainObject(value)) throw new Error('Holiday payload must be an object');
  const years = Object.entries(value);
  if (years.length === 0 || years.length > MAX_YEARS) {
    throw new Error('Holiday payload has an invalid year count');
  }

  const result: HolidayCalendar = {};
  for (const [year, rawDates] of years) {
    if (!/^\d{4}$/.test(year) || !isPlainObject(rawDates)) {
      throw new Error('Holiday payload has an invalid year');
    }
    const dates = Object.entries(rawDates);
    if (dates.length === 0 || dates.length > MAX_DATES_PER_YEAR) {
      throw new Error('Holiday payload has an invalid date count');
    }
    result[year] = {};
    for (const [date, rawNames] of dates) {
      const rawNameList = typeof rawNames === 'string' ? [rawNames] : rawNames;
      if (!isValidIsoDate(date) || !date.startsWith(`${year}-`) ||
        !Array.isArray(rawNameList) || rawNameList.length === 0 || rawNameList.length > MAX_NAMES_PER_DATE) {
        throw new Error('Holiday payload has an invalid date entry');
      }
      const names = rawNameList.map(name => {
        if (typeof name !== 'string') throw new Error('Holiday name must be a string');
        if (/\p{Cc}/u.test(name)) {
          throw new Error('Holiday name contains control characters');
        }
        const trimmed = name.trim().replace(/\s+/g, ' ');
        if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
          throw new Error('Holiday name has an invalid length');
        }
        return trimmed;
      });
      result[year][date] = names;
    }
  }
  return result;
}

function mergeWithFallback(remote: HolidayCalendar): HolidayCalendar {
  const merged = cloneCalendar(FALLBACK_HOLIDAYS);
  for (const [year, dates] of Object.entries(remote)) {
    merged[year] = { ...(merged[year] ?? {}), ...dates };
  }
  return merged;
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Holiday response is too large');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Holiday response is too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

interface HolidayLoaderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  url?: string;
  verificationUrl?: string | null;
  cacheTtlMs?: number;
  fallbackRetryTtlMs?: number;
  timeoutMs?: number;
}

export function createHolidayCalendarLoader(options: HolidayLoaderOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const url = options.url ?? HOLIDAY_API_URL;
  const verificationUrl = options.verificationUrl !== undefined
    ? options.verificationUrl
    : (options.fetcher || options.url ? null : HOLIDAY_VERIFICATION_URL);
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const fallbackRetryTtlMs = options.fallbackRetryTtlMs ?? FALLBACK_RETRY_TTL_MS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let cache: { calendar: HolidayCalendar; expiresAt: number } | null = null;
  let inFlight: Promise<HolidayCalendar> | null = null;

  return async (): Promise<HolidayCalendar> => {
    if (cache && cache.expiresAt > now()) return cache.calendar;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const fetchCalendar = async (targetUrl: string, allowPlainText: boolean) => {
          const response = await fetcher(targetUrl, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`Holiday response failed: ${response.status}`);
          const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
          if (!contentType.includes('application/json') && !(allowPlainText && contentType.includes('text/plain'))) {
            throw new Error('Holiday response is not JSON');
          }
          const text = await readLimitedText(response);
          return parseHolidayCalendar(JSON.parse(text) as unknown);
        };
        const [parsed, verification] = await Promise.all([
          fetchCalendar(url, false),
          verificationUrl ? fetchCalendar(verificationUrl, true) : Promise.resolve(null),
        ]);
        if (verification && JSON.stringify(parsed) !== JSON.stringify(verification)) {
          throw new Error('Holiday sources do not match');
        }
        const calendar = mergeWithFallback(parsed);
        cache = { calendar, expiresAt: now() + cacheTtlMs };
        return calendar;
      } catch {
        const calendar = cloneCalendar(FALLBACK_HOLIDAYS);
        cache = { calendar, expiresAt: now() + fallbackRetryTtlMs };
        return calendar;
      } finally {
        clearTimeout(timeout);
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

export const loadHolidayCalendar = createHolidayCalendarLoader();

export function normalizeCalendarExceptions(value: unknown): CalendarException[] {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, CalendarException>();
  for (const item of value.slice(-MAX_CALENDAR_EXCEPTIONS)) {
    if (!isPlainObject(item) || typeof item.date !== 'string' ||
      (item.kind !== 'closed' && item.kind !== 'open') || typeof item.title !== 'string') continue;
    const title = item.title
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, MAX_NAME_LENGTH);
    if (!isValidIsoDate(item.date) || !title) continue;
    byDate.set(item.date, { date: item.date, kind: item.kind, title });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveCalendarDay(
  date: string,
  calendar: HolidayCalendar,
  settings: HolidayCalendarSettings = {},
): CalendarDayStatus {
  if (!isValidIsoDate(date)) throw new RangeError('Invalid ISO date');
  const holidayNames = [...(calendar[date.slice(0, 4)]?.[date] ?? [])];
  const exception = normalizeCalendarExceptions(settings.calendar_exceptions)
    .find(item => item.date === date);

  if (exception) {
    return {
      date,
      isClosed: exception.kind === 'closed',
      title: exception.title,
      holidayNames,
      source: exception.kind === 'closed' ? 'exception_closed' : 'exception_open',
    };
  }
  if (!calendar[date.slice(0, 4)]) {
    return {
      date,
      isClosed: false,
      title: '공휴일 정보 확인 필요',
      holidayNames,
      source: 'unknown',
    };
  }
  if (holidayNames.length > 0) {
    return {
      date,
      isClosed: settings.holiday_auto_close !== false,
      title: holidayNames.join(', '),
      holidayNames,
      source: 'public_holiday',
    };
  }
  return { date, isClosed: false, title: '정상 수업일', holidayNames, source: 'regular' };
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day + amount));
  return parsed.toISOString().slice(0, 10);
}

export function queryCalendarPeriod(
  startDate: string,
  endDate: string,
  calendar: HolidayCalendar,
  settings: HolidayCalendarSettings = {},
): CalendarDayStatus[] {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
    throw new RangeError('Invalid calendar period');
  }
  const days: CalendarDayStatus[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (days.length >= MAX_QUERY_DAYS) throw new RangeError('Calendar period is too long');
    days.push(resolveCalendarDay(date, calendar, settings));
  }
  return days;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function fitKakaoSimpleText(value: string): string {
  return truncateText(value, MAX_KAKAO_TEXT_LENGTH);
}

export function formatKoreanDate(date: string): string {
  if (!isValidIsoDate(date)) throw new RangeError('Invalid ISO date');
  const [year, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}년 ${month}월 ${day}일(${weekday})`;
}

function formatSingleDay(day: CalendarDayStatus): string {
  const label = formatKoreanDate(day.date);
  const title = truncateText(day.title, MAX_FORMATTED_TITLE_LENGTH);
  if (day.isClosed) return `${label}은 ${title}로 학원 전체 휴강입니다.`;
  if (day.source === 'unknown') {
    return `${label}의 공휴일 정보는 아직 준비되지 않았습니다. 정확한 수업 여부는 학원에 문의해 주세요.`;
  }
  if (day.source === 'exception_open') {
    const holiday = day.holidayNames.length > 0
      ? `${truncateText(day.holidayNames.join(', '), MAX_FORMATTED_TITLE_LENGTH)}이지만 `
      : '';
    return `${label}은 ${holiday}정상 수업합니다. (${title})`;
  }
  if (day.source === 'public_holiday') {
    return `${label}은 ${title}이지만 학원 설정에 따라 정상 수업합니다.`;
  }
  return `${label}은 등록된 학원 전체 휴강일은 아닙니다. 반별 수업 여부는 학원 시간표를 확인해 주세요.`;
}

export function formatCalendarAnswer(days: CalendarDayStatus[]): string {
  if (days.length === 0) return '확인할 일정이 없습니다.';
  if (days.length === 1) return fitKakaoSimpleText(formatSingleDay(days[0]));

  const period = `${formatKoreanDate(days[0].date)}부터 ${formatKoreanDate(days.at(-1)!.date)}까지`;
  const unknown = days.filter(day => day.source === 'unknown');
  const closed = days.filter(day => day.isClosed);
  const specialOpen = days.filter(day =>
    !day.isClosed && day.source !== 'regular' && day.source !== 'unknown'
  );
  const lines: string[] = [];
  let remainingItems = MAX_SCHEDULE_LIST_ITEMS;
  const appendItems = (items: CalendarDayStatus[]) => {
    const shown = items.slice(0, remainingItems);
    lines.push(...shown.map(day =>
      `- ${formatKoreanDate(day.date)}: ${truncateText(day.title, MAX_FORMATTED_TITLE_LENGTH)}`
    ));
    remainingItems -= shown.length;
    const omitted = items.length - shown.length;
    if (omitted > 0) lines.push(`- 외 ${omitted}일`);
  };
  if (closed.length === 0) {
    lines.push(unknown.length > 0
      ? `${period} 확인 가능한 날짜에는 등록된 휴강 일정이 없습니다.`
      : `${period} 등록된 휴강 일정이 없습니다.`);
  } else {
    lines.push(`${period} 휴강 일정입니다.`);
    appendItems(closed);
  }
  if (specialOpen.length > 0) {
    lines.push('정상 수업 안내:');
    appendItems(specialOpen);
  }
  if (unknown.length > 0) {
    const years = [...new Set(unknown.map(day => `${day.date.slice(0, 4)}년`))].join(', ');
    lines.push(`${years} 공휴일 정보는 아직 준비되지 않았습니다. 정확한 수업 여부는 학원에 문의해 주세요.`);
  }
  return fitKakaoSimpleText(lines.join('\n'));
}

function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeDate(year: number, month: number, day: number): string | null {
  const value = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return isValidIsoDate(value) ? value : null;
}

function endOfMonth(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return makeDate(year, month, day)!;
}

function singleDayPeriod(date: string): SchedulePeriod {
  return { startDate: date, endDate: date, kind: 'single' };
}

function inferMonthDay(month: number, day: number, today: string, explicitYear?: number): string | null {
  let year = explicitYear ?? Number(today.slice(0, 4));
  let date = makeDate(year, month, day);
  if (date && explicitYear === undefined && date < today) {
    year += 1;
    date = makeDate(year, month, day);
  }
  return date;
}

interface FixedHolidayRule {
  pattern: RegExp;
  calendarName: string;
  month: number;
  day: number;
}

const FIXED_HOLIDAY_RULES: FixedHolidayRule[] = [
  { pattern: /(신정|새해첫날)/, calendarName: '1월 1일', month: 1, day: 1 },
  { pattern: /(삼일절|3[ㆍ·]1절)/, calendarName: '3ㆍ1절', month: 3, day: 1 },
  { pattern: /(근로자의날|노동절)/, calendarName: '노동절', month: 5, day: 1 },
  { pattern: /어린이날/, calendarName: '어린이날', month: 5, day: 5 },
  { pattern: /현충일/, calendarName: '현충일', month: 6, day: 6 },
  { pattern: /제헌절/, calendarName: '제헌절', month: 7, day: 17 },
  { pattern: /광복절/, calendarName: '광복절', month: 8, day: 15 },
  { pattern: /개천절/, calendarName: '개천절', month: 10, day: 3 },
  { pattern: /한글날/, calendarName: '한글날', month: 10, day: 9 },
  { pattern: /(성탄절|크리스마스)/, calendarName: '기독탄신일', month: 12, day: 25 },
];

interface FloatingHolidayRule {
  pattern: RegExp;
  calendarName: string;
}

const FLOATING_HOLIDAY_RULES: FloatingHolidayRule[] = [
  { pattern: /(설날|설연휴|설에|설은|구정)/, calendarName: '설날' },
  { pattern: /(추석|한가위)/, calendarName: '추석' },
  { pattern: /(부처님오신날|석가탄신일)/, calendarName: '부처님 오신 날' },
];

function requestedHolidayYear(compact: string, today: string): { year: number; fixed: boolean } {
  const currentYear = Number(today.slice(0, 4));
  const explicit = compact.match(/(?:^|[^0-9])(\d{4})(?:년)?(?=[^0-9]|$)/);
  if (explicit) return { year: Number(explicit[1]), fixed: true };
  if (compact.includes('내년')) return { year: currentYear + 1, fixed: true };
  if (compact.includes('올해') || compact.includes('금년')) return { year: currentYear, fixed: true };
  return { year: currentYear, fixed: false };
}

function fallbackHolidayDates(year: number, calendarName: string): string[] {
  return Object.entries(FALLBACK_HOLIDAYS[String(year)] ?? {})
    .filter(([, names]) => names.some(name => name.includes(calendarName)))
    .map(([date]) => date)
    .sort();
}

function parseNamedHolidayPeriod(compact: string, today: string): SchedulePeriod | null {
  const requestedYear = requestedHolidayYear(compact, today);
  const floatingRule = FLOATING_HOLIDAY_RULES.find(rule => rule.pattern.test(compact));
  if (floatingRule) {
    const candidateYears = requestedYear.fixed
      ? [requestedYear.year]
      : [requestedYear.year, requestedYear.year + 1];
    for (const year of candidateYears) {
      const dates = fallbackHolidayDates(year, floatingRule.calendarName);
      if (dates.length === 0) continue;
      const mainDate = dates.find(date =>
        FALLBACK_HOLIDAYS[String(year)]?.[date]?.includes(floatingRule.calendarName)
      ) ?? dates[0];
      if (!requestedYear.fixed && mainDate < today) continue;
      if (compact.includes('연휴') && dates.length > 1) {
        return { startDate: dates[0], endDate: dates.at(-1)!, kind: 'week' };
      }
      return singleDayPeriod(mainDate);
    }
    return { startDate: today, endDate: today, kind: 'invalid' };
  }

  const fixedRule = FIXED_HOLIDAY_RULES.find(rule => rule.pattern.test(compact));
  if (!fixedRule) return null;
  if (/(대체공휴일|대체휴일)/.test(compact)) {
    const candidateYears = requestedYear.fixed
      ? [requestedYear.year]
      : [requestedYear.year, requestedYear.year + 1];
    for (const year of candidateYears) {
      const substituteDate = Object.entries(FALLBACK_HOLIDAYS[String(year)] ?? {})
        .find(([date, names]) =>
          (requestedYear.fixed || date >= today) &&
          names.some(name => name.includes('대체공휴일') && name.includes(fixedRule.calendarName))
        )?.[0];
      if (substituteDate) return singleDayPeriod(substituteDate);
    }
    return { startDate: today, endDate: today, kind: 'invalid' };
  }
  const date = inferMonthDay(
    fixedRule.month,
    fixedRule.day,
    today,
    requestedYear.fixed ? requestedYear.year : undefined,
  );
  return date ? singleDayPeriod(date) : { startDate: today, endDate: today, kind: 'invalid' };
}

function looksLikeUnsupportedDate(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return /\d{4}년(?:\d{1,2}월)?(?!\d{1,2}일)/.test(compact) ||
    /(?:^|[^0-9])\d{4}[-./]\d{1,2}(?![-./]\d)/.test(compact) ||
    /\d{1,2}월\d{1,2}(?!일)/.test(compact) ||
    /(?:^|[^0-9월])\d{1,2}일(?:$|[^0-9])/.test(compact);
}

export function parseSchedulePeriod(utterance: string, today: string): SchedulePeriod {
  if (!isValidIsoDate(today)) throw new RangeError('Invalid today date');
  const compact = utterance.toLowerCase().replace(/\s+/g, '');
  const fullDateMatch = utterance.match(/(?:^|[^0-9])(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?![0-9])/);
  if (fullDateMatch) {
    const date = makeDate(Number(fullDateMatch[1]), Number(fullDateMatch[2]), Number(fullDateMatch[3]));
    if (date) return { startDate: date, endDate: date, kind: 'single' };
    return { startDate: today, endDate: today, kind: 'invalid' };
  }
  const koreanMatch = utterance.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (koreanMatch) {
    const date = inferMonthDay(
      Number(koreanMatch[2]),
      Number(koreanMatch[3]),
      today,
      koreanMatch[1] ? Number(koreanMatch[1]) : undefined,
    );
    if (date) return { startDate: date, endDate: date, kind: 'single' };
    return { startDate: today, endDate: today, kind: 'invalid' };
  }
  const shortDateMatch = utterance.match(/(?:^|[^0-9])(\d{1,2})\s*[-./]\s*(\d{1,2})(?![0-9])/);
  if (shortDateMatch) {
    const date = inferMonthDay(Number(shortDateMatch[1]), Number(shortDateMatch[2]), today);
    if (date) return singleDayPeriod(date);
    return { startDate: today, endDate: today, kind: 'invalid' };
  }

  const namedHoliday = parseNamedHolidayPeriod(compact, today);
  if (namedHoliday) return namedHoliday;
  if (looksLikeUnsupportedDate(utterance)) {
    return { startDate: today, endDate: today, kind: 'invalid' };
  }
  if (compact.includes('글피')) {
    const date = addDays(today, 3);
    return { startDate: date, endDate: date, kind: 'single' };
  }
  if (compact.includes('모레')) {
    const date = addDays(today, 2);
    return { startDate: date, endDate: date, kind: 'single' };
  }
  if (compact.includes('내일') || compact.includes('낼')) {
    const date = addDays(today, 1);
    return { startDate: date, endDate: date, kind: 'single' };
  }
  if (compact.includes('오늘')) return { startDate: today, endDate: today, kind: 'single' };

  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const todayWeekday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay)).getUTCDay();
  const weekdayMatch = compact.match(/(이번주|금주|다음주|담주|차주|다음)?([일월화수목금토])요일/);
  if (weekdayMatch) {
    const targetWeekday = WEEKDAYS.indexOf(weekdayMatch[2]);
    const modifier = weekdayMatch[1] ?? '';
    let delta: number;
    if (modifier === '이번주' || modifier === '금주') {
      const mondayDelta = todayWeekday === 0 ? -6 : 1 - todayWeekday;
      const targetOffset = targetWeekday === 0 ? 6 : targetWeekday - 1;
      delta = mondayDelta + targetOffset;
    } else if (modifier === '다음주' || modifier === '담주' || modifier === '차주') {
      const nextMondayDelta = todayWeekday === 0 ? 1 : 8 - todayWeekday;
      const targetOffset = targetWeekday === 0 ? 6 : targetWeekday - 1;
      delta = nextMondayDelta + targetOffset;
    } else {
      delta = (targetWeekday - todayWeekday + 7) % 7;
      if (modifier === '다음' && delta === 0) delta = 7;
    }
    const date = addDays(today, delta);
    return { startDate: date, endDate: date, kind: 'single' };
  }
  if (compact.includes('이번주') || compact.includes('금주')) {
    return { startDate: today, endDate: addDays(today, todayWeekday === 0 ? 0 : 7 - todayWeekday), kind: 'week' };
  }
  if (compact.includes('다음주') || compact.includes('담주') || compact.includes('차주')) {
    const nextMondayDelta = todayWeekday === 0 ? 1 : 8 - todayWeekday;
    const startDate = addDays(today, nextMondayDelta);
    return { startDate, endDate: addDays(startDate, 6), kind: 'week' };
  }
  if (compact.includes('이번달')) {
    return { startDate: today, endDate: endOfMonth(todayYear, todayMonth), kind: 'month' };
  }
  if (compact.includes('다음달')) {
    const nextMonthDate = new Date(Date.UTC(todayYear, todayMonth, 1));
    const year = nextMonthDate.getUTCFullYear();
    const month = nextMonthDate.getUTCMonth() + 1;
    const startDate = makeDate(year, month, 1)!;
    return { startDate, endDate: endOfMonth(year, month), kind: 'month' };
  }

  const isCalendarList = ['휴강일안내', '휴강·수업일정', '휴강수업일정', '휴강일알려줘', '공휴일알려줘']
    .some(keyword => compact.includes(keyword)) || compact.includes('공휴일');
  const asksSingleDayByDefault =
    /(수업).*(하나요|하냐|하니|하나|해요|해|있나요|있냐|있니|있나|있어요|있어|없나요|없어|쉬나요|쉬어)/.test(compact) ||
    /(학원).*(쉬나요|쉬어요|쉬어|가나요|가요|가야|가는날|여나요|열어요|문여나요)/.test(compact);
  if (!isCalendarList && asksSingleDayByDefault) {
    return { startDate: today, endDate: today, kind: 'single' };
  }
  return { startDate: today, endDate: addDays(today, 29), kind: 'upcoming' };
}

interface SettingsQueryResult {
  data: HolidayCalendarSettings | null;
  error: { message?: string } | null;
}

interface SettingsClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<SettingsQueryResult>;
      };
    };
  };
}

async function loadSettings(supabase: unknown, ownerId: string): Promise<HolidayCalendarSettings> {
  const client = supabase as SettingsClient;
  const { data, error } = await client
    .from('growing_settings')
    .select('holiday_auto_close, calendar_exceptions')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new Error('휴강 설정을 불러오지 못했습니다.');
  return data ?? { holiday_auto_close: true, calendar_exceptions: [] };
}

export async function getHolidayForDate(
  supabase: unknown,
  ownerId: string,
  isoDate: string,
): Promise<HolidayForDate> {
  const [calendar, settings] = await Promise.all([
    loadHolidayCalendar(),
    loadSettings(supabase, ownerId),
  ]);
  const day = resolveCalendarDay(isoDate, calendar, settings);
  return { isClosed: day.isClosed, name: day.title, source: day.source };
}

export async function getScheduleInfo(
  supabase: unknown,
  ownerId: string,
  utterance: string,
): Promise<{ message: string }> {
  const period = parseSchedulePeriod(utterance, kstToday());
  if (period.kind === 'invalid') {
    return { message: '날짜를 확인하지 못했습니다. 예: 8월 17일 또는 2026-08-17처럼 입력해 주세요.' };
  }
  const [calendar, settings] = await Promise.all([
    loadHolidayCalendar(),
    loadSettings(supabase, ownerId),
  ]);
  const days = queryCalendarPeriod(period.startDate, period.endDate, calendar, settings);
  let message = formatCalendarAnswer(days);
  if (utterance.replace(/\s+/g, '').includes('공휴일')) {
    const policy = settings.holiday_auto_close === false
      ? '공휴일은 자동 휴강하지 않으며, 등록한 학원 예외 일정만 휴강으로 안내합니다.'
      : '대한민국 공휴일·대체공휴일은 학원 전체 휴강으로 안내합니다.';
    message = `${policy}\n${message}`;
  }
  return { message: fitKakaoSimpleText(message) };
}
