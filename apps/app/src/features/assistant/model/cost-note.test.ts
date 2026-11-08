import { describe, expect, it } from 'vitest';
import { costBarsOf, costPeakOf, noCostReported, replyCostOf, turnTime } from './cost-note';

describe('a reply with no cost', () => {
  it('is labelled when the provider answered and reported zero', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 0 })).toBe(true);
  });

  it('is not labelled when the provider cost is simply unavailable', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 0, cost_incomplete: true })).toBe(false);
  });

  it('is not labelled when something was charged', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 1200 })).toBe(false);
  });

  it('is not labelled for a message no model produced', () => {
    expect(noCostReported({ model: null, cost_micros: 0 })).toBe(false);
  });
});

describe('the meta line cost', () => {
  it('scales the bar against the most expensive turn in the loaded window', () => {
    const peak = costPeakOf([{ cost_micros: 1000 }, { cost_micros: 14_000 }, { cost_micros: 0 }]);
    expect(peak).toBe(14_000);
    expect(replyCostOf({ model: 'a/b', cost_micros: 7000 }, peak)).toEqual({
      kind: 'known',
      micros: 7000,
      share: 0.5,
      top: false,
    });
  });

  it('marks the most expensive turn as the top one', () => {
    expect(replyCostOf({ model: 'a/b', cost_micros: 14_000 }, 14_000)).toMatchObject({
      share: 1,
      top: true,
    });
  });

  it('rescales when an older, more expensive turn loads', () => {
    expect(replyCostOf({ model: 'a/b', cost_micros: 14_000 }, 28_000)).toMatchObject({
      share: 0.5,
      top: false,
    });
  });

  it('draws no bar without a loaded window to compare against', () => {
    expect(replyCostOf({ model: 'a/b', cost_micros: 900 }, null)).toMatchObject({
      share: null,
      top: false,
    });
  });

  it('says the cost was not reported instead of showing nothing or zero', () => {
    expect(replyCostOf({ model: 'a/b', cost_micros: 0 }, 100)).toEqual({ kind: 'unreported' });
    expect(replyCostOf({ model: 'a/b', cost_micros: 0, cost_incomplete: true }, 100)).toEqual({
      kind: 'unreported',
    });
  });

  it('keeps the known part of a partly reported cost', () => {
    expect(
      replyCostOf({ model: 'a/b', cost_micros: 500, cost_incomplete: true }, 1000),
    ).toMatchObject({ kind: 'partial', micros: 500, share: 0.5 });
  });

  it('shows nothing for a message no model produced', () => {
    expect(replyCostOf({ model: null, cost_micros: 0 }, 100)).toBeNull();
  });
});

describe('the cost per turn chart', () => {
  it('lists charged replies in time order', () => {
    const at = (minute: number): string => `2026-11-07T10:0${String(minute)}:00.000Z`;
    expect(
      costBarsOf([
        { id: 'b', role: 'responder', cost_micros: 30, created_at: at(2) },
        { id: 'me', role: 'person', cost_micros: 0, created_at: at(1) },
        { id: 'a', role: 'responder', cost_micros: 10, created_at: at(0) },
        { id: 'free', role: 'responder', cost_micros: 0, created_at: at(3) },
      ]),
    ).toEqual([
      { key: 'a', value: 10 },
      { key: 'b', value: 30 },
    ]);
  });
});

describe('turn time', () => {
  it('keeps a tenth of a second for short turns', () => {
    expect(turnTime(4100)).toBe('4.1 s');
    expect(turnTime(400)).toBe('0.4 s');
  });

  it('uses whole units for longer turns', () => {
    expect(turnTime(38_000)).toBe('38 s');
    expect(turnTime(72_000)).toBe('1 min 12 s');
  });
});
