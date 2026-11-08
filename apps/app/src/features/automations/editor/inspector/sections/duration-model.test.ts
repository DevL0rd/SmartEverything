import { describe, expect, it } from 'vitest';
import {
  DURATION_UNITS,
  UNIT_SIZE,
  atLeast,
  inUnit,
  joinDuration,
  splitDuration,
} from './duration-model';

describe('splitDuration', () => {
  it('uses the largest unit that divides the value evenly', () => {
    expect(splitDuration(172_800_000)).toEqual({ amount: 2, unit: 'd' });
    expect(splitDuration(3_600_000)).toEqual({ amount: 1, unit: 'h' });
    expect(splitDuration(5_400_000)).toEqual({ amount: 90, unit: 'min' });
    expect(splitDuration(90_000)).toEqual({ amount: 90, unit: 's' });
  });

  it('shows parts of a second as seconds, never as milliseconds', () => {
    expect(splitDuration(1500)).toEqual({ amount: 1.5, unit: 's' });
    expect(splitDuration(0)).toEqual({ amount: 0, unit: 's' });
    expect(DURATION_UNITS.map((unit) => unit.value)).not.toContain('ms');
  });

  it('keeps very long durations without a cap', () => {
    const year = 365 * UNIT_SIZE.d;
    expect(joinDuration(splitDuration(year * 50))).toBe(year * 50);
  });
});

describe('inUnit', () => {
  it('shows a value in the unit the person picked', () => {
    expect(inUnit(90_000, 'min')).toEqual({ amount: 1.5, unit: 'min' });
    expect(inUnit(3_600_000, 's')).toEqual({ amount: 3600, unit: 's' });
  });
});

describe('joinDuration', () => {
  it('turns an amount and a unit back into milliseconds', () => {
    expect(joinDuration({ amount: 2, unit: 'min' })).toBe(120_000);
    expect(joinDuration({ amount: 1.5, unit: 's' })).toBe(1500);
    expect(joinDuration({ amount: 0, unit: 'h' })).toBe(0);
  });

  it('round-trips every unit', () => {
    for (const unit of DURATION_UNITS) {
      const milliseconds = 7 * UNIT_SIZE[unit.value];
      expect(joinDuration(splitDuration(milliseconds))).toBe(milliseconds);
    }
  });
});

describe('atLeast', () => {
  it('keeps policy times at the 1 ms the policy schema needs and lets ports reach zero', () => {
    expect(atLeast(joinDuration({ amount: 0, unit: 's' }), 1)).toBe(1);
    expect(atLeast(joinDuration({ amount: 0, unit: 's' }), 0)).toBe(0);
    expect(atLeast(joinDuration({ amount: 3, unit: 'h' }), 1)).toBe(10_800_000);
  });
});
