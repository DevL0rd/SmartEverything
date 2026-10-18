import { describe, expect, it } from 'vitest';
import { birthIso, daysInMonth, isPast, withPart, ymdOf } from './birth-date';

const TODAY = new Date(2026, 9, 17);

describe('birth date parts', () => {
  it('reads a stored date', () => {
    expect(ymdOf('1990-05-01', TODAY)).toEqual({ year: 1990, month: 5, day: 1 });
  });

  it('starts an unset date at a typical age instead of today', () => {
    expect(ymdOf(null, TODAY)).toEqual({ year: 1996, month: 1, day: 1 });
  });

  it('knows how long a month is, leap years included', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
  });

  it('keeps the day inside a shorter month', () => {
    const march = { year: 2024, month: 3, day: 31 };
    expect(withPart(march, 'month', 2)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(withPart({ year: 2024, month: 2, day: 29 }, 'year', 2025)).toEqual({
      year: 2025,
      month: 2,
      day: 28,
    });
  });

  it('writes the day the way the hub stores it', () => {
    expect(birthIso({ year: 1990, month: 5, day: 1 })).toBe('1990-05-01');
  });

  it('refuses a day that has not happened yet', () => {
    expect(isPast({ year: 2026, month: 10, day: 17 }, TODAY)).toBe(true);
    expect(isPast({ year: 2026, month: 10, day: 18 }, TODAY)).toBe(false);
  });
});
