import { describe, expect, it } from 'vitest';
import {
  MAX_DELAY_MINUTES,
  dayWord,
  defaultFinish,
  earliestFinish,
  epochMinute,
  finishError,
} from './finish';

const NOON = new Date(2026, 9, 17, 12, 0, 0).getTime();

describe('finish-by', () => {
  it('rounds the earliest finish up to the next quarter hour after the program length', () => {
    const now = epochMinute(NOON) + 7;
    expect(earliestFinish(now, 213) % 15).toBe(0);
    expect(earliestFinish(now, 213)).toBeGreaterThanOrEqual(now + 213);
    expect(earliestFinish(now, null)).toBeGreaterThanOrEqual(now + 15);
  });

  it('defaults to the next 07:00 that fits the program, across midnight', () => {
    const target = new Date(defaultFinish(NOON, 213) * 60_000);
    expect(target.getHours()).toBe(7);
    expect(target.getDate()).toBe(18);
  });

  it('rejects a finish sooner than the program takes', () => {
    const now = epochMinute(NOON);
    expect(finishError(now + 100, now, 213)).toBe('Too soon: this program takes 3 h 33 min.');
    expect(finishError(now + 213, now, 213)).toBeNull();
    expect(finishError(now + 100, now, null)).toBeNull();
  });

  it('rejects a time in the past and a wait beyond two days', () => {
    const now = epochMinute(NOON);
    expect(finishError(now, now, null)).toBe('Pick a time in the future.');
    expect(finishError(now + MAX_DELAY_MINUTES + 1, now, null)).toBe(
      'The machine can wait at most 2 days.',
    );
  });

  it('names the day of the finish', () => {
    const now = NOON;
    const at = (hours: number): number => epochMinute(now + hours * 3_600_000);
    expect(dayWord(at(3), now)).toBe('Today');
    expect(dayWord(at(20), now)).toBe('Tomorrow');
    expect(dayWord(at(60), now)).toBe('In 3 days');
  });
});
