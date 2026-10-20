import { describe, expect, it } from 'vitest';
import { HYSTERESIS_MEMORY, hysteresis } from '../../../src/nodes/state/hysteresis';

const BAND = { high: 20, low: 10 };

describe('hysteresis', () => {
  it('rises at the high threshold and reports it once', () => {
    const first = hysteresis(undefined, { ...BAND, value: 20 });
    expect(first).toStrictEqual({ state: true, rose: true, fell: false, memory: { high: true } });
    const again = hysteresis(first.memory, { ...BAND, value: 25 });
    expect(again).toStrictEqual({ state: true, rose: false, fell: false, memory: { high: true } });
  });

  it('falls at the low threshold and reports it once', () => {
    const fell = hysteresis({ high: true }, { ...BAND, value: 10 });
    expect(fell).toStrictEqual({ state: false, rose: false, fell: true, memory: { high: false } });
    expect(hysteresis(fell.memory, { ...BAND, value: 3 }).fell).toBe(false);
  });

  it('keeps the state between the thresholds', () => {
    expect(hysteresis({ high: true }, { ...BAND, value: 15 }).state).toBe(true);
    expect(hysteresis({ high: false }, { ...BAND, value: 15 }).state).toBe(false);
  });

  it('starts from the initial state and treats a first low reading as no change', () => {
    expect(hysteresis(undefined, { ...BAND, value: 15, initial: true })).toMatchObject({
      state: true,
      rose: false,
      fell: false,
    });
    expect(hysteresis(undefined, { ...BAND, value: 5, initial: true }).fell).toBe(true);
    expect(hysteresis(undefined, { ...BAND, value: 5 }).fell).toBe(false);
  });

  it('prefers high when both thresholds are equal', () => {
    expect(hysteresis({ high: false }, { value: 5, high: 5, low: 5 }).state).toBe(true);
  });

  it('rejects an inverted band and bad memory', () => {
    expect(() => hysteresis(undefined, { value: 1, high: 5, low: 10 })).toThrow(/low threshold/);
    expect(() => HYSTERESIS_MEMORY.parse({ high: 1 })).toThrow();
  });
});
