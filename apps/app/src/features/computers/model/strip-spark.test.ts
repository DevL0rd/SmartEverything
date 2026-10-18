import { describe, expect, it } from 'vitest';
import { sparkOf } from './strip-spark';

function run(
  count: number,
  value: (index: number) => number,
  from = 0,
  step = 1000,
): { t: number; v: number }[] {
  return Array.from({ length: count }, (_, index) => ({ t: from + index * step, v: value(index) }));
}

describe('sparkOf', () => {
  it('averages a noisy minute into a short smooth line', () => {
    const spark = sparkOf(run(60, (index) => (index % 2 === 0 ? 20 : 60) + index));
    expect(spark).not.toBeNull();
    expect(spark?.length).toBeLessThanOrEqual(19);
    expect(spark?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps only the points after the last gap', () => {
    const before = run(30, (index) => index, 0);
    const after = run(10, (index) => 100 + index, 120_000);
    const spark = sparkOf([...before, ...after]);
    expect(Math.min(...(spark ?? []).map((point) => point.t))).toBeGreaterThanOrEqual(120_000);
  });

  it('hides a flat series and one that is too short', () => {
    expect(sparkOf(run(60, () => 80))).toBeNull();
    expect(sparkOf(run(3, (index) => index * 10))).toBeNull();
    expect(sparkOf([])).toBeNull();
  });

  it('shows a series that really moves', () => {
    expect(sparkOf(run(40, (index) => index * 2))).not.toBeNull();
  });
});
