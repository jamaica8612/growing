import type { CalendarException, HolidaySettings } from '../types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXCEPTION_TITLE_LENGTH = 80;
export const MAX_CALENDAR_EXCEPTIONS = 500;

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function normalizeCalendarExceptions(value: unknown): CalendarException[] {
  if (!Array.isArray(value)) return [];

  const byDate = new Map<string, CalendarException>();
  for (const item of value.slice(-MAX_CALENDAR_EXCEPTIONS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const date = typeof row.date === 'string' ? row.date.trim() : '';
    const kind = row.kind === 'closed' || row.kind === 'open' ? row.kind : null;
    const title = typeof row.title === 'string'
      ? row.title
        .replace(/\p{Cc}/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_EXCEPTION_TITLE_LENGTH)
      : '';

    if (!isValidIsoDate(date) || !kind || !title) continue;
    // One academy policy per date. A later entry intentionally replaces an
    // earlier one so editing an existing date has predictable semantics.
    byDate.set(date, { date, kind, title });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeHolidaySettings(
  holidayAutoClose: unknown,
  calendarExceptions: unknown,
): HolidaySettings {
  return {
    holidayAutoClose: typeof holidayAutoClose === 'boolean' ? holidayAutoClose : true,
    calendarExceptions: normalizeCalendarExceptions(calendarExceptions),
  };
}

export function isNormalizedHolidaySettings(value: unknown): value is HolidaySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.holidayAutoClose !== 'boolean' || !Array.isArray(row.calendarExceptions)) return false;

  const normalized = normalizeHolidaySettings(row.holidayAutoClose, row.calendarExceptions);
  if (normalized.calendarExceptions.length !== row.calendarExceptions.length) return false;
  return row.calendarExceptions.every((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const raw = item as Record<string, unknown>;
    const expected = normalized.calendarExceptions[index];
    return raw.date === expected.date && raw.kind === expected.kind && raw.title === expected.title;
  });
}
