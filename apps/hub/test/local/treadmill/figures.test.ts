import type { SessionSample } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { FigureAccumulator } from '../../../src/local/treadmill/figures';

const CONTEXT = {
  scale: 'unconfirmed',
  weightKg: 70,
  runSwitchKmh: 8,
  fixedGradePercent: null,
} as const;

function sample(t: number): SessionSample {
  return { t, kmh: 4, distanceM: t * 1.1, steps: null, incline: null, state: 'running' };
}

function walked(weightKg: number | null): FigureAccumulator {
  const accumulator = new FigureAccumulator({ ...CONTEXT, weightKg });
  for (let t = 0; t <= 600; t += 10) {
    accumulator.add(sample(t));
  }
  return accumulator;
}

describe('session energy figures', () => {
  it('keeps the estimate next to the belt figure', () => {
    const figures = walked(70).figures(182);
    expect(figures.kcal).toBe(182);
    expect(figures.kcalSource).toBe('belt');
    expect(figures.kcalEstimate).toBeGreaterThan(0);
    expect(figures.kcalEstimate).not.toBe(182);
  });

  it('uses the estimate as the figure when the belt reports none', () => {
    const figures = walked(70).figures(null);
    expect(figures.kcalSource).toBe('estimate');
    expect(figures.kcalEstimate).toBe(figures.kcal);
  });

  it('has no estimate without a body weight', () => {
    const figures = walked(null).figures(120);
    expect(figures.kcalEstimate).toBeNull();
    expect(figures.kcalSource).toBe('belt');
  });
});
