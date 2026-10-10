import { describe, expect, it } from 'vitest';
import { clock, dayLabel, localDayKey } from './time';

const MOMENT = '2026-10-10T21:17:51.403Z';
const NOW = Date.parse('2026-10-12T12:00:00.000Z');

describe('cached formatters', () => {
  it('match the locale methods they replace', () => {
    expect(clock(MOMENT, 'America/Edmonton')).toBe(
      new Date(MOMENT).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Edmonton',
      }),
    );
    expect(dayLabel(MOMENT, NOW, 'America/Edmonton')).toBe(
      new Date(MOMENT).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Edmonton',
      }),
    );
  });

  it('keeps zones apart and repeats the same answer', () => {
    expect(localDayKey(MOMENT, 'America/Edmonton')).toBe('2026-10-10');
    expect(localDayKey(MOMENT, 'Asia/Tokyo')).toBe('2026-10-11');
    expect(localDayKey(MOMENT, 'Asia/Tokyo')).toBe('2026-10-11');
  });
});
