import { describe, expect, it } from 'vitest';
import { memoryAge, memoryClock, memorySaved } from '../src/ai-memory';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function after(duration: number): string {
  return memoryAge(new Date(NOW.getTime() - duration).toISOString(), NOW);
}

describe('memoryAge', () => {
  it.each([
    [0, 'just now'],
    [59 * SECOND, 'just now'],
    [60 * SECOND, '1 minute ago'],
    [2 * MINUTE, '2 minutes ago'],
    [59 * MINUTE, '59 minutes ago'],
    [60 * MINUTE, '1 hr ago'],
    [23 * HOUR, '23 hr ago'],
    [24 * HOUR, '1 day ago'],
    [6 * DAY, '6 days ago'],
    [7 * DAY, '1 week ago'],
    [10 * DAY, '1 week and 3 days ago'],
    [13 * DAY, '1 week and 6 days ago'],
    [14 * DAY, '2 weeks ago'],
    [29 * DAY, '4 weeks and 1 day ago'],
    [30 * DAY, '1 month ago'],
    [44 * DAY, '1 month and 2 weeks ago'],
    [59 * DAY, '1 month and 4 weeks ago'],
    [60 * DAY, '2 months ago'],
    [364 * DAY, '12 months ago'],
    [365 * DAY, '1 year ago'],
    [400 * DAY, '1 year and 1 month ago'],
    [730 * DAY, '2 years ago'],
  ])('reads %i ms as %s', (duration, expected) => {
    expect(after(duration)).toBe(expected);
  });

  it('reads a moment in the future as just now', () => {
    expect(memoryAge('2026-11-07T12:05:00.000Z', NOW)).toBe('just now');
  });
});

describe('memoryClock and memorySaved', () => {
  it('writes the date and time in the given zone', () => {
    expect(memoryClock('2026-11-05T07:30:00.000Z', 'UTC')).toBe('2026-11-05 07:30');
    expect(memoryClock('2026-11-05T07:30:00.000Z', 'Asia/Bangkok')).toBe('2026-11-05 14:30');
    expect(memoryClock('2026-11-05T17:30:00.000Z', 'Asia/Bangkok')).toBe('2026-11-06 00:30');
  });

  it('joins the clock and the age', () => {
    expect(memorySaved('2026-11-05T07:30:00.000Z', NOW, 'Asia/Bangkok')).toBe(
      'saved 2026-11-05 14:30, 2 days ago',
    );
  });
});
