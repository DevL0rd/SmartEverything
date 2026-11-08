import { area, line } from 'd3-shape';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('d3-shape contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'd3-shape')).toBe(installedVersion('d3-shape'));
  });

  it('generates line and filled chart paths from projected points', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const stroke = line<(typeof points)[number]>()
      .x((point) => point.x)
      .y((point) => point.y);
    const fill = area<(typeof points)[number]>()
      .x((point) => point.x)
      .y0(0)
      .y1((point) => point.y);

    expect(stroke(points)).toBe('M1,2L3,4');
    expect(fill(points)).toBe('M1,2L3,4L3,0L1,0Z');
    expect(stroke([])).toBeNull();
  });
});
