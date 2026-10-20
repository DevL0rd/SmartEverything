import { describe, expect, it } from 'vitest';
import { HOME, bad, good } from './support';

const NEW_YORK = { ...HOME, timeZone: 'America/New_York' };
const SUNDAY_EVENING = '2026-10-18T12:00:00Z';

describe('date.parse', () => {
  it('reads ISO text with an offset', () => {
    expect(good('date.parse', { text: '2026-10-18T19:00:00+07:00' })).toEqual({
      instant: '2026-10-18T12:00:00.000Z',
      ok: true,
    });
  });

  it('reads local ISO text in the home zone or a given zone', () => {
    expect(good('date.parse', { text: '2026-10-18T19:00' })).toEqual({
      instant: '2026-10-18T12:00:00.000Z',
      ok: true,
    });
    expect(good('date.parse', { text: '2026-10-18T19:00:30' })).toEqual({
      instant: '2026-10-18T12:00:30.000Z',
      ok: true,
    });
    expect(good('date.parse', { text: '2026-10-18' })).toEqual({
      instant: '2026-10-17T17:00:00.000Z',
      ok: true,
    });
    expect(good('date.parse', { text: '2026-10-18T19:00', zone: 'America/New_York' })).toEqual({
      instant: '2026-10-18T23:00:00.000Z',
      ok: true,
    });
  });

  it('reads a pattern', () => {
    expect(good('date.parse', { text: '18/10/2026 19:30', format: 'dd/MM/yyyy HH:mm' })).toEqual({
      instant: '2026-10-18T12:30:00.000Z',
      ok: true,
    });
    expect(good('date.parse', { text: '(2026)', format: '(yyyy)' })).toMatchObject({
      instant: '2025-12-31T17:00:00.000Z',
    });
    expect(good('date.parse', { text: '19:30', format: 'HH:mm' })).toMatchObject({
      instant: '1970-01-01T12:30:00.000Z',
    });
  });

  it('raises Invalid for text that is not a date', () => {
    bad('date.parse', { text: 'tomorrow' }, 'Invalid');
    bad('date.parse', { text: '2026-02-30' }, 'Invalid');
    bad('date.parse', { text: '2026-10-18T25:00' }, 'Invalid');
    bad('date.parse', { text: '2026-10-18T10:61' }, 'Invalid');
    bad('date.parse', { text: '2026-10-18T10:00:61' }, 'Invalid');
    bad('date.parse', { text: '18.10.2026', format: 'dd/MM/yyyy' }, 'Invalid');
    bad('date.parse', { text: '2026-10-18', zone: 'Mars/Base' }, 'Invalid');
  });
});

describe('date.format', () => {
  it('writes the presets in the home zone', () => {
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'time' })).toEqual({
      text: '19:00',
    });
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'date' })).toEqual({
      text: '18 Oct 2026',
    });
    expect(good('date.format', { instant: SUNDAY_EVENING })).toEqual({ text: '18 Oct, 19:00' });
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'long' })).toEqual({
      text: 'Sunday, 18 October 2026 at 19:00',
    });
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'speakable' })).toEqual({
      text: 'Sunday 18 October at 7:00 pm',
    });
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'time' }, NEW_YORK)).toEqual({
      text: '08:00',
    });
    expect(
      good('date.format', { instant: SUNDAY_EVENING, preset: 'date', locale: 'de-DE' }),
    ).toEqual({
      text: '18. Okt. 2026',
    });
  });

  it('writes relative text from the injected clock', () => {
    expect(good('date.format', { instant: '2026-10-18T12:05:00Z', preset: 'relative' })).toEqual({
      text: 'in 5 minutes',
    });
    expect(good('date.format', { instant: '2026-10-18T10:00:00Z', preset: 'relative' })).toEqual({
      text: '2 hours ago',
    });
    expect(good('date.format', { instant: SUNDAY_EVENING, preset: 'relative' })).toEqual({
      text: 'now',
    });
    expect(good('date.format', { instant: '2026-10-18T12:00:20Z', preset: 'relative' })).toEqual({
      text: 'in 20 seconds',
    });
    expect(good('date.format', { instant: '2026-10-20T12:00:00Z', preset: 'relative' })).toEqual({
      text: 'in 2 days',
    });
  });

  it('writes a pattern', () => {
    expect(
      good('date.format', {
        instant: '2026-03-05T04:07:09Z',
        preset: 'pattern',
        pattern: 'yyyy-MM-dd HH:mm:ss EEE MMM',
      }),
    ).toEqual({
      text: '2026-03-05 11:07:09 Thu Mar',
    });
    bad('date.format', { instant: SUNDAY_EVENING, preset: 'pattern' }, 'Invalid');
  });

  it('refuses a bad moment, preset, locale or zone', () => {
    bad('date.format', { instant: 'later' }, 'TypeError');
    bad('date.format', { instant: SUNDAY_EVENING, preset: 'verbose' }, 'Invalid');
    bad('date.format', { instant: SUNDAY_EVENING, locale: 'not a locale!' }, 'Invalid');
    bad(
      'date.format',
      { instant: SUNDAY_EVENING, preset: 'relative', locale: 'not a locale!' },
      'Invalid',
    );
    bad('date.format', { instant: SUNDAY_EVENING }, 'Invalid', { ...HOME, timeZone: 'Mars/Base' });
  });
});

describe('date.add', () => {
  it('shifts by clock units', () => {
    expect(good('date.add', { instant: SUNDAY_EVENING, amount: 90, unit: 'minutes' })).toEqual({
      instant: '2026-10-18T13:30:00.000Z',
    });
    expect(good('date.add', { instant: SUNDAY_EVENING, amount: 30, unit: 'seconds' })).toEqual({
      instant: '2026-10-18T12:00:30.000Z',
    });
    expect(
      good('date.add', { instant: SUNDAY_EVENING, amount: 2, unit: 'hours', subtract: true }),
    ).toEqual({ instant: '2026-10-18T10:00:00.000Z' });
  });

  it('shifts by calendar units', () => {
    expect(good('date.add', { instant: SUNDAY_EVENING, amount: 1 })).toEqual({
      instant: '2026-10-19T12:00:00.000Z',
    });
    expect(good('date.add', { instant: SUNDAY_EVENING, amount: 1, unit: 'weeks' })).toEqual({
      instant: '2026-10-25T12:00:00.000Z',
    });
    expect(
      good('date.add', { instant: '2026-01-31T05:00:00Z', amount: 1, unit: 'months' }),
    ).toEqual({ instant: '2026-02-28T05:00:00.000Z' });
    expect(
      good('date.add', {
        instant: '2026-01-15T05:00:00Z',
        amount: 2,
        unit: 'months',
        subtract: true,
      }),
    ).toEqual({ instant: '2025-11-15T05:00:00.000Z' });
    expect(good('date.add', { instant: '2028-02-29T05:00:00Z', amount: 1, unit: 'years' })).toEqual(
      { instant: '2029-02-28T05:00:00.000Z' },
    );
    expect(good('date.add', { instant: '2026-10-18T12:00:30Z', amount: 1 })).toEqual({
      instant: '2026-10-19T12:00:30.000Z',
    });
    bad('date.add', { instant: SUNDAY_EVENING, amount: 1.5 }, 'Invalid');
    bad('date.add', { instant: SUNDAY_EVENING, amount: 1, unit: 'fortnights' }, 'Invalid');
  });

  it('keeps the wall clock across a DST change', () => {
    const before = '2026-03-07T17:00:00Z';
    expect(good('date.add', { instant: before, amount: 1 }, NEW_YORK)).toEqual({
      instant: '2026-03-08T16:00:00.000Z',
    });
    expect(good('date.add', { instant: before, amount: 24, unit: 'hours' }, NEW_YORK)).toEqual({
      instant: '2026-03-08T17:00:00.000Z',
    });
  });

  it('refuses a result outside the range of dates', () => {
    bad('date.add', { instant: SUNDAY_EVENING, amount: 1e15, unit: 'hours' }, 'MathError');
  });
});

describe('date.difference', () => {
  it('measures the time between', () => {
    const span = { from: SUNDAY_EVENING, to: '2026-10-18T13:30:00Z' };
    expect(good('date.difference', span)).toEqual({ duration: 5_400_000, amount: 90 });
    expect(good('date.difference', { ...span, unit: 'hours' })).toEqual({
      duration: 5_400_000,
      amount: 1.5,
    });
    expect(good('date.difference', { ...span, unit: 'seconds' })).toEqual({
      duration: 5_400_000,
      amount: 5400,
    });
    expect(good('date.difference', { from: span.to, to: span.from, unit: 'days' })).toEqual({
      duration: -5_400_000,
      amount: -5_400_000 / 86_400_000,
    });
    expect(good('date.difference', { from: span.to, to: span.from, absolute: true })).toEqual({
      duration: 5_400_000,
      amount: 90,
    });
    bad('date.difference', { ...span, unit: 'years' }, 'Invalid');
  });
});

describe('date.part', () => {
  it('splits a moment in the home zone', () => {
    expect(good('date.part', { instant: SUNDAY_EVENING })).toEqual({
      year: 2026,
      month: 10,
      day: 18,
      weekday: 0,
      hour: 19,
      minute: 0,
      dayOfYear: 291,
      week: 42,
      isWeekend: true,
      clock: '19:00',
    });
  });

  it('follows the zone across midnight and across the year', () => {
    expect(good('date.part', { instant: '2026-10-17T17:30:00Z' })).toMatchObject({
      day: 18,
      hour: 0,
      minute: 30,
      weekday: 0,
    });
    expect(good('date.part', { instant: '2026-01-01T12:00:00Z' })).toMatchObject({
      week: 1,
      weekday: 4,
      isWeekend: false,
      dayOfYear: 1,
    });
    expect(good('date.part', { instant: '2027-01-01T12:00:00Z' })).toMatchObject({ week: 53 });
  });
});

describe('date.duration', () => {
  it('builds a duration from parts', () => {
    expect(good('date.duration', { hours: 1, minutes: 30 })).toEqual({
      duration: 5_400_000,
      hours: 1,
      minutes: 30,
      seconds: 0,
      totalSeconds: 5400,
    });
    expect(good('date.duration', {})).toMatchObject({ duration: 0 });
    expect(good('date.duration', { minutes: 90, seconds: 1.5 })).toMatchObject({
      hours: 1,
      minutes: 30,
      seconds: 1.5,
    });
  });

  it('splits a duration into parts', () => {
    expect(good('date.duration', { split: 3_725_000 })).toEqual({
      duration: 3_725_000,
      hours: 1,
      minutes: 2,
      seconds: 5,
      totalSeconds: 3725,
    });
  });

  it('refuses negative parts', () => {
    bad('date.duration', { minutes: -1 }, 'Invalid');
    bad('date.duration', { hours: -1 }, 'Invalid');
    bad('date.duration', { seconds: -1 }, 'Invalid');
    bad('date.duration', { split: -5 }, 'Invalid');
    bad('date.duration', { hours: 1e308 * 10 }, 'TypeError');
  });
});
