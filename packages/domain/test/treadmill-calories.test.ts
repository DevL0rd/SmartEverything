import { describe, expect, it } from 'vitest';
import { calorieRate, energySourceOf, estimateEnergy, type EnergySample } from '../src';

const BASE = { scale: 'percent', weightKg: 80, runSwitchKmh: 8, fixedGradePercent: null } as const;

function sample(t: number, incline: number | null, state: 'running' | 'paused'): EnergySample {
  return { t, kmh: 5, incline, state };
}

describe('estimated energy with the live grade', () => {
  it('matches the rate at the sample grade', () => {
    const rate = calorieRate({ speedKmh: 5, gradePercent: 10, weightKg: 80, runSwitchKmh: 8 });
    const energy = estimateEnergy([sample(0, 10, 'running'), sample(600, 10, 'running')], BASE);
    expect(energy.kcal).toBeCloseTo(rate.grossPerMinute * 10, 6);
    expect(energy.kcalNet).toBeCloseTo(rate.netPerMinute * 10, 6);
  });

  it('burns more uphill and halves the grade on the levels scale', () => {
    const run = (scale: 'percent' | 'levels'): number =>
      estimateEnergy([sample(0, 10, 'running'), sample(600, 10, 'running')], { ...BASE, scale })
        .kcal;
    const flat = estimateEnergy([sample(0, 0, 'running'), sample(600, 0, 'running')], BASE).kcal;
    expect(run('percent')).toBeGreaterThan(run('levels'));
    expect(run('levels')).toBeGreaterThan(flat);
  });

  it('skips paused time and uses the fixed grade only without an incline reading', () => {
    const paused = estimateEnergy([sample(0, 10, 'paused'), sample(600, 10, 'running')], BASE);
    expect(paused.kcal).toBe(0);
    const fixed = estimateEnergy([sample(0, null, 'running'), sample(600, null, 'running')], {
      ...BASE,
      fixedGradePercent: 4,
    });
    const rate = calorieRate({ speedKmh: 5, gradePercent: 4, weightKg: 80, runSwitchKmh: 8 });
    expect(fixed.kcal).toBeCloseTo(rate.grossPerMinute * 10, 6);
  });
});

describe('energy source', () => {
  it('takes the belt energy when present and the estimate otherwise', () => {
    expect(energySourceOf(182, 171)).toStrictEqual({ kcal: 182, source: 'belt' });
    expect(energySourceOf(0, 171)).toStrictEqual({ kcal: 171, source: 'estimate' });
    expect(energySourceOf(null, 171)).toStrictEqual({ kcal: 171, source: 'estimate' });
  });
});
