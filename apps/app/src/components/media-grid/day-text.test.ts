import { describe, expect, it } from 'vitest';
import { dayText, itemCount } from './day-text';

const TODAY = '2026-11-07';

function wall(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

const SHORT = { weekday: 'short', day: 'numeric', month: 'short' } as const;

describe('day head text', () => {
  it('names the recent days and keeps the date with the count beside them', () => {
    expect(dayText('2026-11-07', 23, TODAY)).toEqual({
      title: 'Today',
      detail: `${wall('2026-11-07', SHORT)} · 23 items`,
    });
    expect(dayText('2026-11-06', 1, TODAY).title).toBe('Yesterday');
    expect(dayText('2026-11-05', 9, TODAY)).toEqual({
      title: wall('2026-11-05', { weekday: 'long' }),
      detail: `${wall('2026-11-05', SHORT)} · 9 items`,
    });
  });

  it('dates older days, with the year only outside this year', () => {
    expect(dayText('2026-10-28', 31, TODAY)).toEqual({
      title: wall('2026-10-28', SHORT),
      detail: '31 items',
    });
    expect(dayText('2024-03-02', 2, TODAY).title).toBe(
      wall('2024-03-02', { ...SHORT, year: 'numeric' }),
    );
  });

  it('uses the wall-clock day of the photo, not the viewer zone', () => {
    expect(dayText('2026-11-01', 4, TODAY).title).toBe(wall('2026-11-01', { weekday: 'long' }));
  });

  it('counts items in words', () => {
    expect(itemCount(1)).toBe('1 item');
    expect(itemCount(1204)).toBe(`${new Intl.NumberFormat().format(1204)} items`);
  });
});
