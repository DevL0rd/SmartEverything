import { describe, expect, it } from 'vitest';
import { acceptedWeights, isOutlier, outlierFlags } from '../src';

const LIVE_SERIES = [88.8, 88.9, 89.2, 87.8, 89.4, 204.7, 10.1, 87.9];

describe('weigh-ins that are not the person', () => {
  it('flags the 204.7 and 10.1 kg readings of the live scale and nothing else', () => {
    const flags = outlierFlags(LIVE_SERIES.map((weightKg) => ({ weightKg, confirmed: false })));
    expect(LIVE_SERIES.filter((_, index) => flags[index] === true)).toEqual([204.7, 10.1]);
  });

  it('keeps the flagged readings out of the weights the trend uses', () => {
    expect(
      acceptedWeights(LIVE_SERIES.map((weightKg) => ({ weightKg, confirmed: false }))),
    ).toEqual([88.8, 88.9, 89.2, 87.8, 89.4, 87.9]);
  });

  it('trusts a reading the person confirmed even when it is far from the rest', () => {
    const flags = outlierFlags([
      { weightKg: 88, confirmed: false },
      { weightKg: 89, confirmed: false },
      { weightKg: 204.7, confirmed: true },
    ]);
    expect(flags).toEqual([false, false, false]);
  });

  it('judges a new weigh-in against the median of the latest five accepted ones', () => {
    expect(isOutlier(97, [88, 89, 90, 89, 88])).toBe(true);
    expect(isOutlier(81, [88, 89, 90, 89, 88])).toBe(true);
    expect(isOutlier(96, [88, 89, 90, 89, 88])).toBe(false);
    expect(isOutlier(82, [88, 89, 90, 89, 88])).toBe(false);
    expect(isOutlier(60, [88, 89, 90, 89, 88, 40, 40, 40, 40, 40])).toBe(true);
  });

  it('has no opinion about the first weigh-in', () => {
    expect(isOutlier(204.7, [])).toBe(false);
  });
});
