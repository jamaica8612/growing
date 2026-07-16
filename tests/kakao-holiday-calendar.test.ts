import { describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_HOLIDAYS,
  createHolidayCalendarLoader,
  formatCalendarAnswer,
  getScheduleInfo,
  normalizeCalendarExceptions,
  parseHolidayCalendar,
  parseSchedulePeriod,
  queryCalendarPeriod,
  resolveCalendarDay,
} from '../supabase/functions/kakao-skill/holiday-calendar.ts';

describe('Kakao holiday calendar', () => {
  it('treats public and substitute holidays as closed by default', () => {
    expect(resolveCalendarDay('2026-07-17', FALLBACK_HOLIDAYS).isClosed).toBe(true);
    const substitute = resolveCalendarDay('2026-08-17', FALLBACK_HOLIDAYS);
    expect(substitute).toMatchObject({
      isClosed: true,
      title: '대체공휴일(광복절)',
      source: 'public_holiday',
    });
  });

  it('honors automatic-close off and per-date overrides', () => {
    const settings = {
      holiday_auto_close: false,
      calendar_exceptions: [
        { date: '2026-07-17', kind: 'open', title: '정상 보강 수업' },
        { date: '2026-07-20', kind: 'closed', title: '여름방학' },
      ],
    };
    expect(resolveCalendarDay('2026-07-17', FALLBACK_HOLIDAYS, settings)).toMatchObject({
      isClosed: false,
      source: 'exception_open',
      title: '정상 보강 수업',
    });
    expect(resolveCalendarDay('2026-07-20', FALLBACK_HOLIDAYS, settings)).toMatchObject({
      isClosed: true,
      source: 'exception_closed',
      title: '여름방학',
    });
    expect(resolveCalendarDay('2028-01-01', FALLBACK_HOLIDAYS)).toMatchObject({
      isClosed: false,
      source: 'unknown',
    });
    expect(resolveCalendarDay('2028-01-01', FALLBACK_HOLIDAYS, {
      calendar_exceptions: [{ date: '2028-01-01', kind: 'closed', title: '학원 방학' }],
    })).toMatchObject({ isClosed: true, source: 'exception_closed', title: '학원 방학' });
  });

  it('normalizes exceptions, discards invalid values, and lets the last date override win', () => {
    expect(normalizeCalendarExceptions([
      { date: '2026-07-17', kind: 'closed', title: '휴강' },
      { date: 'bad', kind: 'closed', title: '무시' },
      { date: '2026-07-17', kind: 'open', title: ' 정상 수업 ' },
    ])).toEqual([{ date: '2026-07-17', kind: 'open', title: '정상 수업' }]);
  });

  it('queries an inclusive period and formats Korean single/range answers', () => {
    const single = queryCalendarPeriod('2026-07-17', '2026-07-17', FALLBACK_HOLIDAYS);
    expect(formatCalendarAnswer(single)).toBe('2026년 7월 17일(금)은 제헌절로 학원 전체 휴강입니다.');

    const range = queryCalendarPeriod('2026-07-16', '2026-07-18', FALLBACK_HOLIDAYS);
    expect(range).toHaveLength(3);
    expect(formatCalendarAnswer(range)).toContain('- 2026년 7월 17일(금): 제헌절');

    const regular = queryCalendarPeriod('2026-07-20', '2026-07-20', FALLBACK_HOLIDAYS);
    expect(formatCalendarAnswer(regular)).toContain('등록된 학원 전체 휴강일은 아닙니다');

    const unknown = queryCalendarPeriod('2028-01-01', '2028-01-01', FALLBACK_HOLIDAYS);
    expect(formatCalendarAnswer(unknown)).toContain('공휴일 정보는 아직 준비되지 않았습니다');
  });

  it('keeps Kakao simpleText below its limit and summarizes overflow dates', () => {
    const calendarExceptions = Array.from({ length: 30 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      kind: 'closed' as const,
      title: `휴강-${'가'.repeat(80)}`,
    }));
    const days = queryCalendarPeriod('2026-07-01', '2026-07-30', FALLBACK_HOLIDAYS, {
      calendar_exceptions: calendarExceptions,
    });
    const answer = formatCalendarAnswer(days);
    expect(answer.length).toBeLessThanOrEqual(950);
    expect(answer).toContain('외 23일');
  });

  it('parses relative, weekly, specific, generic-today, and menu periods', () => {
    const today = '2026-07-16';
    expect(parseSchedulePeriod('내일 수업하나요?', today)).toMatchObject({ startDate: '2026-07-17', kind: 'single' });
    expect(parseSchedulePeriod('모레 학원 쉬나요?', today)).toMatchObject({ startDate: '2026-07-18', kind: 'single' });
    expect(parseSchedulePeriod('이번 주 휴강일', today)).toEqual({
      startDate: '2026-07-16', endDate: '2026-07-19', kind: 'week',
    });
    expect(parseSchedulePeriod('이번 주 휴강일', '2026-07-19')).toEqual({
      startDate: '2026-07-19', endDate: '2026-07-19', kind: 'week',
    });
    expect(parseSchedulePeriod('다음 주 수업 있나요?', today)).toEqual({
      startDate: '2026-07-20', endDate: '2026-07-26', kind: 'week',
    });
    expect(parseSchedulePeriod('다음 달 휴강일', today)).toEqual({
      startDate: '2026-08-01', endDate: '2026-08-31', kind: 'month',
    });
    expect(parseSchedulePeriod('월요일 수업하나요?', today)).toMatchObject({
      startDate: '2026-07-20', kind: 'single',
    });
    expect(parseSchedulePeriod('2026년 8월 17일 수업', today)).toMatchObject({ startDate: '2026-08-17', kind: 'single' });
    expect(parseSchedulePeriod('2026-8-17 학원 가나요?', today)).toMatchObject({ startDate: '2026-08-17', kind: 'single' });
    expect(parseSchedulePeriod('2026-02-30 학원 가나요?', today).kind).toBe('invalid');
    expect(parseSchedulePeriod('2월 30일 수업하나요?', today).kind).toBe('invalid');
    expect(parseSchedulePeriod('5월 5일 수업하나요?', today)).toMatchObject({
      startDate: '2027-05-05', kind: 'single',
    });
    expect(parseSchedulePeriod('수업하나요?', today)).toMatchObject({ startDate: today, kind: 'single' });
    expect(parseSchedulePeriod('학원 가나요?', today)).toMatchObject({ startDate: today, kind: 'single' });
    expect(parseSchedulePeriod('📅 휴강일 안내', today)).toEqual({
      startDate: today, endDate: '2026-08-14', kind: 'upcoming',
    });
    expect(parseSchedulePeriod('대체공휴일에도 수업하나요?', today).kind).toBe('upcoming');
    expect(parseSchedulePeriod('공휴일에도 수업하나요?', today).kind).toBe('upcoming');
  });

  it('answers an invalid explicit date without querying external data or settings', async () => {
    await expect(getScheduleInfo({}, 'owner', '2026-02-30 학원 가나요?')).resolves.toEqual({
      message: '날짜를 확인하지 못했습니다. 예: 2026년 8월 17일 수업하나요?',
    });
  });

  it('strictly validates the remote payload', () => {
    expect(parseHolidayCalendar({ '2028': { '2028-01-01': ['새해'] } }))
      .toEqual({ '2028': { '2028-01-01': ['새해'] } });
    expect(parseHolidayCalendar({ '2029': { '2029-01-01': '새해' } }))
      .toEqual({ '2029': { '2029-01-01': ['새해'] } });
    expect(() => parseHolidayCalendar({ '2028': {} })).toThrow();
    expect(() => parseHolidayCalendar({ '2028': { 'not-a-date': ['새해'] } })).toThrow();
    expect(() => parseHolidayCalendar({ '2028': { '2028-01-01': ['x'.repeat(81)] } })).toThrow();
    expect(() => parseHolidayCalendar({ '2028': { '2028-01-01': ['새해\n휴일'] } })).toThrow();
  });

  it('caches a valid fetch and falls back for failed or oversized responses', async () => {
    let now = 1_000;
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ '2028': { '2028-01-01': ['새해'] } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const loader = createHolidayCalendarLoader({ fetcher, now: () => now });
    expect((await loader())['2028']['2028-01-01']).toEqual(['새해']);
    now += 1_000;
    await loader();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const failedLoader = createHolidayCalendarLoader({
      fetcher: async () => new Response('unavailable', { status: 503 }),
    });
    expect((await failedLoader())['2026']['2026-07-17']).toEqual(['제헌절']);

    const oversizedLoader = createHolidayCalendarLoader({
      fetcher: async () => new Response('{}', {
        status: 200,
        headers: { 'content-length': '1000001' },
      }),
    });
    expect((await oversizedLoader())['2027']['2027-10-11']).toEqual(['대체공휴일(한글날)']);

    const wrongContentTypeLoader = createHolidayCalendarLoader({
      fetcher: async () => new Response('{"2028":{}}', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    });
    expect((await wrongContentTypeLoader())['2026']['2026-08-17']).toEqual(['대체공휴일(광복절)']);

    const timedOutLoader = createHolidayCalendarLoader({
      timeoutMs: 5,
      fetcher: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    });
    expect((await timedOutLoader())['2026']['2026-08-17']).toEqual(['대체공휴일(광복절)']);

    const mismatchedSourcesLoader = createHolidayCalendarLoader({
      verificationUrl: 'https://verification.example/basic.json',
      fetcher: async input => new Response(JSON.stringify({
        '2028': { '2028-01-01': [String(input).includes('verification') ? '다른 이름' : '새해'] },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    expect((await mismatchedSourcesLoader())['2028']).toBeUndefined();
    expect((await mismatchedSourcesLoader())['2026']['2026-01-01']).toEqual(['1월 1일']);
  });
});
