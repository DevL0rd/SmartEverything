import { describe, expect, it, vi } from 'vitest';

import type * as Locale from '../../../format/locale';

vi.mock('../../../format/locale', async (importOriginal) => {
  const original = await importOriginal<typeof Locale>();
  return {
    ...original,
    dateFormat: (options: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat =>
      original.dateFormat(options, locale ?? 'en-GB'),
    zonedDateFormat: (
      options: Intl.DateTimeFormatOptions,
      locale?: string,
    ): ReturnType<typeof Locale.zonedDateFormat> =>
      original.zonedDateFormat(options, locale ?? 'en-GB'),
  };
});

import { clock, dayKeyOf, dayLabel, shiftDay, startOfDayKey } from '../../../format/time';
import { daysIn, previousWindow, shiftAnchor, windowLabel, windowOf } from './window';

describe('fitness time windows', () => {
  it('day keys round-trip through local midnight', () => {
    const midnight = startOfDayKey('2026-10-08');
    expect(new Date(midnight).getHours()).toBe(0);
    expect(dayKeyOf(midnight)).toBe('2026-10-08');
    expect(dayKeyOf(midnight + 23 * 3_600_000)).toBe('2026-10-08');
  });

  it('startOfDayKey refuses something that is not a date', () => {
    expect(() => startOfDayKey('8 October')).toThrow();
  });

  it('shiftDay crosses month and year boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('a day window has 24 hourly buckets', () => {
    const window = windowOf('day', '2026-10-08');
    expect(window.buckets).toHaveLength(24);
    expect(window.buckets[0]?.label).toBe('00');
    expect(window.buckets[23]?.label).toBe('23');
    expect(window.firstDay).toBe('2026-10-08');
    expect(window.lastDay).toBe('2026-10-08');
  });

  it('a week window starts on Monday and holds seven days', () => {
    const window = windowOf('week', '2026-10-08');
    expect(window.firstDay).toBe('2026-10-05');
    expect(window.lastDay).toBe('2026-10-11');
    expect(window.buckets.map((bucket) => bucket.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(windowOf('week', '2026-10-11').firstDay).toBe('2026-10-05');
  });

  it('a month window holds every day of that month', () => {
    const window = windowOf('month', '2026-02-14');
    expect(window.buckets).toHaveLength(28);
    expect(window.firstDay).toBe('2026-02-01');
    expect(window.lastDay).toBe('2026-02-28');
    expect(daysIn(window)).toBe(28);
  });

  it('a year window has twelve monthly buckets', () => {
    const window = windowOf('year', '2026-10-08');
    expect(window.buckets.map((bucket) => bucket.label)[9]).toBe('Oct');
    expect(window.firstDay).toBe('2026-01-01');
    expect(window.lastDay).toBe('2026-12-31');
  });

  it('shiftAnchor moves by one whole range and clamps month ends', () => {
    expect(shiftAnchor('day', '2026-10-08', -1)).toBe('2026-10-07');
    expect(shiftAnchor('week', '2026-10-08', 1)).toBe('2026-10-15');
    expect(shiftAnchor('month', '2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftAnchor('year', '2026-10-08', -1)).toBe('2025-10-01');
  });

  it('previousWindow is the same range immediately before', () => {
    const previous = previousWindow(windowOf('week', '2026-10-08'));
    expect(previous.firstDay).toBe('2026-09-28');
    expect(previous.lastDay).toBe('2026-10-04');
  });

  it('labels name today, yesterday and longer ranges', () => {
    expect(windowLabel(windowOf('day', '2026-10-08'), '2026-10-08')).toBe('Today · Thu 8 Oct');
    expect(windowLabel(windowOf('day', '2026-10-07'), '2026-10-08')).toBe('Yesterday · Wed 7 Oct');
    expect(windowLabel(windowOf('day', '2026-10-01'), '2026-10-08')).toBe('Thu 1 Oct');
    expect(windowLabel(windowOf('week', '2026-10-08'), '2026-10-08')).toBe('5 Oct – 11 Oct');
    expect(windowLabel(windowOf('month', '2026-10-08'), '2026-10-08')).toBe('Oct 2026');
    expect(windowLabel(windowOf('year', '2026-10-08'), '2026-10-08')).toBe('2026');
  });

  it('clocks and relative days read naturally', () => {
    const moment = new Date(2026, 9, 8, 7, 5).getTime();
    expect(clock(moment)).toMatch(/^7:05/);
    expect(dayLabel(moment, startOfDayKey('2026-10-08'))).toBe('Today');
    expect(dayLabel(moment, startOfDayKey('2026-10-09'))).toBe('Yesterday');
    expect(dayLabel(moment, startOfDayKey('2026-10-20'))).toBe('Thu 8 Oct');
  });
});
