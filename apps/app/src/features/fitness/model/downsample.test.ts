import { describe, expect, it } from 'vitest';
import { downsample } from './downsample';

function series(count: number): { t: number; v: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    t: index,
    v: index === 777 ? 1000 : index === 1500 ? -1000 : index % 7,
  }));
}

describe('downsample', () => {
  it('leaves short series untouched', () => {
    const points = series(100);
    expect(downsample(points, 0, 100)).toBe(points);
  });

  it('bounds long series and keeps extremes, order and the last point', () => {
    const points = series(20_000);
    const out = downsample(points, 0, 20_000, 100);
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.some((point) => point.v === 1000)).toBe(true);
    expect(out.some((point) => point.v === -1000)).toBe(true);
    expect(out[out.length - 1]).toBe(points[points.length - 1]);
    expect(out.map((point) => point.t)).toEqual(
      [...out.map((point) => point.t)].sort((a, b) => a - b),
    );
  });
});
