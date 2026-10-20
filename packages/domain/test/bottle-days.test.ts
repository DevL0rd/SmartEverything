import { describe, expect, it } from 'vitest';
import {
  bottleDayAfter,
  bottleDayIndex,
  bottleDayOfIndex,
  bottleDayOfInstant,
  bottleDaysBetween,
  bottleDaysInMonth,
  bottleMinuteOfInstant,
  bottleMonthsBack,
  bottleWeekday,
} from '../src';

describe('calendar days for the bottle', () => {
  it('counts days since the epoch and turns the count back into a day', () => {
    expect(bottleDayIndex('1970-01-02')).toBe(1);
    expect(bottleDayOfIndex(bottleDayIndex('2026-10-18'))).toBe('2026-10-18');
  });

  it('moves a day forward and backward across month and year ends', () => {
    expect(bottleDayAfter('2026-10-18', 14)).toBe('2026-11-01');
    expect(bottleDayAfter('2026-01-01', -1)).toBe('2025-12-31');
    expect(bottleDayAfter('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('lists every day between two days, both included', () => {
    expect(bottleDaysBetween({ from: '2026-10-30', to: '2026-11-02' })).toStrictEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('finds the local day and minute of an instant in the home time zone', () => {
    expect(bottleDayOfInstant('2026-10-18T23:30:00Z', 3600)).toBe('2026-10-19');
    expect(bottleDayOfInstant('2026-10-18T23:30:00Z', -3600)).toBe('2026-10-18');
    expect(bottleMinuteOfInstant('2026-10-18T23:30:00Z', 3600)).toBe(30);
    expect(bottleMinuteOfInstant('2026-10-18T07:41:00Z', 0)).toBe(461);
  });

  it('knows the weekday, the length of a month and months back', () => {
    expect(bottleWeekday('2026-10-18')).toBe(0);
    expect(bottleWeekday('2026-10-19')).toBe(1);
    expect(bottleDaysInMonth('2024-02')).toBe(29);
    expect(bottleDaysInMonth('2026-02')).toBe(28);
    expect(bottleDaysInMonth('2026-10')).toBe(31);
    expect(bottleMonthsBack('2026-10-18', 0)).toBe('2026-10');
    expect(bottleMonthsBack('2026-10-18', 11)).toBe('2025-11');
    expect(bottleMonthsBack('2026-01-31', 1)).toBe('2025-12');
  });
});
