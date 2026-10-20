import { describe, expect, it } from 'vitest';
import { historyWindow } from '../../../src/nodes/state/history-window';

const at = (minute: number): string => new Date(Date.UTC(2026, 9, 18, 10, minute)).toISOString();
const ms = (minute: number): number => Date.UTC(2026, 9, 18, 10, minute);
const MINUTE = 60_000;

const TEMPS = [
  { at: at(30), value: 22 },
  { at: at(0), value: 20 },
  { at: at(10), value: 24 },
];

describe('historyWindow', () => {
  it('keeps the points in range in time order with their statistics', () => {
    const result = historyWindow({ points: TEMPS, from: ms(0), to: ms(30) });
    expect(result.points.map((point) => point.value)).toStrictEqual([20, 24, 22]);
    expect(result).toMatchObject({ count: 3, min: 20, max: 24, change: 2, average: 22 });
    expect(result).not.toHaveProperty('timeInMs');
  });

  it('cuts to the range edges inclusively', () => {
    const result = historyWindow({ points: TEMPS, from: ms(10), to: ms(29) });
    expect(result.points.map((point) => point.value)).toStrictEqual([24]);
    expect(result).toMatchObject({ count: 1, change: 0, average: 24 });
  });

  it('gives only a count when nothing is numeric or in range', () => {
    expect(historyWindow({ points: [], from: 0, to: 1 })).toStrictEqual({ points: [], count: 0 });
    const words = [{ at: at(0), value: 'on' }];
    expect(historyWindow({ points: words, from: ms(0), to: ms(5) })).toStrictEqual({
      points: words,
      count: 1,
    });
  });

  it('measures the time a control held a value, carrying the value in force at the start', () => {
    const power = [
      { at: at(0), value: true },
      { at: at(10), value: false },
      { at: at(20), value: true },
    ];
    const result = historyWindow({ points: power, from: ms(5), to: ms(30), stateEquals: true });
    expect(result.timeInMs).toBe(5 * MINUTE + 10 * MINUTE);
    const off = historyWindow({ points: power, from: ms(5), to: ms(30), stateEquals: false });
    expect(off.timeInMs).toBe(10 * MINUTE);
  });

  it('counts zero time when the value never held, and compares structures', () => {
    const modes = [{ at: at(0), value: { mode: 'auto' } }];
    const held = historyWindow({
      points: modes,
      from: ms(0),
      to: ms(4),
      stateEquals: { mode: 'auto' },
    });
    expect(held.timeInMs).toBe(4 * MINUTE);
    const never = historyWindow({ points: modes, from: ms(0), to: ms(4), stateEquals: 'x' });
    expect(never.timeInMs).toBe(0);
  });

  it('ignores points after the end for time in state and rejects bad instants', () => {
    const power = [
      { at: at(0), value: true },
      { at: at(50), value: true },
    ];
    expect(
      historyWindow({ points: power, from: ms(0), to: ms(10), stateEquals: true }).timeInMs,
    ).toBe(10 * MINUTE);
    expect(() =>
      historyWindow({ points: [{ at: 'yesterday', value: 1 }], from: 0, to: 1 }),
    ).toThrow();
  });
});
