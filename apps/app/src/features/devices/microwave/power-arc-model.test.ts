import { describe, expect, it } from 'vitest';
import { stepped, ticksOf } from './power-arc-model';

const LEVELS = ['100W', '300W', '600W', '900W'];

describe('power arc', () => {
  it('lights every level up to the chosen one', () => {
    expect(ticksOf(LEVELS, 2).map((tick) => tick.lit)).toEqual([true, true, true, false]);
    expect(ticksOf(LEVELS, 0).map((tick) => tick.lit)).toEqual([true, false, false, false]);
  });

  it('spreads the levels over a half circle, lowest on the left', () => {
    const [first, , , last] = ticksOf(LEVELS, 0);
    expect(first?.x2).toBeLessThan(110);
    expect(last?.x2).toBeGreaterThan(110);
    expect(first?.y2).toBeCloseTo(last?.y2 ?? 0, 5);
  });

  it('stays on the arc when stepping past an end', () => {
    expect(stepped(0, -1, 4)).toBe(0);
    expect(stepped(3, 1, 4)).toBe(3);
    expect(stepped(1, 1, 4)).toBe(2);
  });
});
