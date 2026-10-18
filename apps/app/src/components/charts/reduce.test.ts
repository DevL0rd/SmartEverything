import { describe, expect, it } from 'vitest';
import { reduced } from './reduce';
import type { ChartPoint } from './scale';

function wave(count: number): ChartPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    t: index * 1000,
    v: Math.sin(index / 40) * 10 + (index === 777 ? 50 : 0),
  }));
}

describe('reduced', () => {
  it('returns small series untouched', () => {
    const points = wave(100);
    expect(reduced(points, 100)).toBe(points);
  });

  it('keeps at most four points per pixel column, in time order', () => {
    const out = reduced(wave(5000), 100);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.every((point, index) => index === 0 || point.t > (out[index - 1]?.t ?? -1))).toBe(
      true,
    );
  });

  it('keeps first, last and the extremes', () => {
    const points = wave(5000);
    const out = reduced(points, 100);
    expect(out[0]).toBe(points[0]);
    expect(out[out.length - 1]).toBe(points[4999]);
    expect(Math.max(...out.map((point) => point.v))).toBe(Math.max(...points.map((p) => p.v)));
    expect(Math.min(...out.map((point) => point.v))).toBe(Math.min(...points.map((p) => p.v)));
  });
});
