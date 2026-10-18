import { describe, expect, it } from 'vitest';
import { insideClockWindow } from '../src';

const DAYTIME = { from: '09:00', to: '17:00' };

const OVERNIGHT = { from: '22:00', to: '07:00' };

describe('insideClockWindow', () => {
  it('includes the start and excludes the end of a same-day window', () => {
    expect(insideClockWindow(DAYTIME, 9 * 60)).toBe(true);
    expect(insideClockWindow(DAYTIME, 12 * 60)).toBe(true);
    expect(insideClockWindow(DAYTIME, 17 * 60)).toBe(false);
    expect(insideClockWindow(DAYTIME, 8 * 60 + 59)).toBe(false);
  });

  it('wraps past midnight when the end is earlier than the start', () => {
    expect(insideClockWindow(OVERNIGHT, 23 * 60)).toBe(true);
    expect(insideClockWindow(OVERNIGHT, 0)).toBe(true);
    expect(insideClockWindow(OVERNIGHT, 6 * 60 + 59)).toBe(true);
    expect(insideClockWindow(OVERNIGHT, 7 * 60)).toBe(false);
    expect(insideClockWindow(OVERNIGHT, 12 * 60)).toBe(false);
  });

  it('is empty when the start equals the end', () => {
    expect(insideClockWindow({ from: '08:00', to: '08:00' }, 8 * 60)).toBe(false);
  });
});
