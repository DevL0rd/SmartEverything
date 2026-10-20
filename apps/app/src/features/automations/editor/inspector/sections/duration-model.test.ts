import { describe, expect, it } from 'vitest';
import { DURATION_UNITS, UNIT_SIZE, joinDuration, splitDuration } from './duration-model';

describe('splitDuration', () => {
  it('uses the largest unit that divides the value evenly', () => {
    expect(splitDuration(3_600_000)).toEqual({ amount: 1, unit: 'h' });
    expect(splitDuration(5_400_000)).toEqual({ amount: 90, unit: 'min' });
    expect(splitDuration(90_000)).toEqual({ amount: 90, unit: 's' });
    expect(splitDuration(1500)).toEqual({ amount: 1500, unit: 'ms' });
  });

  it('shows zero in milliseconds', () => {
    expect(splitDuration(0)).toEqual({ amount: 0, unit: 'ms' });
  });
});

describe('joinDuration', () => {
  it('turns an amount and a unit back into milliseconds', () => {
    expect(joinDuration({ amount: 2, unit: 'min' })).toBe(120_000);
    expect(joinDuration({ amount: 1.5, unit: 's' })).toBe(1500);
  });

  it('round-trips every unit', () => {
    for (const unit of DURATION_UNITS) {
      const milliseconds = 7 * UNIT_SIZE[unit.value];
      expect(joinDuration(splitDuration(milliseconds))).toBe(milliseconds);
    }
  });
});
