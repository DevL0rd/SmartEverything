import { describe, expect, it } from 'vitest';
import { modelOf, type ModelInput } from './chart-model';

const NOW = Date.UTC(2026, 9, 17, 12);

function input(count: number): ModelInput {
  return {
    series: [
      {
        points: Array.from({ length: count }, (_, index) => ({
          t: NOW - (count - index) * 1000,
          v: Math.sin(index / 5) * 10,
        })),
        colour: 'viz-1',
        label: 'Reading',
      },
    ],
    range: '24h',
    unit: undefined,
    formatValue: undefined,
    fit: true,
    marker: undefined,
    yDomain: undefined,
  };
}

describe('time series chart model', () => {
  it('thins drawn segments to the plot width and keeps every point for hit-testing', () => {
    const model = modelOf(input(20_000), 320, 200);
    const drawn = model?.drawn[0];
    expect(drawn?.points).toHaveLength(20_000);
    expect(drawn?.segments.flat().length).toBeLessThan(4 * 320);
  });

  it('keeps a fixed vertical range instead of fitting the readings', () => {
    const fitted = modelOf(input(50), 320, 200);
    const fixed = modelOf({ ...input(50), yDomain: [0, 100] }, 320, 200);
    expect(fixed?.yTicks[0]).toBe(0);
    expect(fixed?.yTicks.at(-1)).toBe(100);
    expect(fitted?.yTicks.at(-1)).toBeLessThan(100);
  });

  it('widens the label gutter for long axis labels only', () => {
    const plain = modelOf(input(50), 320, 200);
    const long = modelOf(
      { ...input(50), formatValue: (value) => `${String(value)} MB/s` },
      320,
      200,
    );
    expect(long?.box.left).toBeGreaterThan(plain?.box.left ?? 0);
    expect(plain?.box.left).toBe(40);
  });

  it('returns null without readings', () => {
    expect(modelOf({ ...input(0) }, 320, 200)).toBeNull();
  });
});
