import { describe, expect, it } from 'vitest';
import { mouthZones, sectorPath } from './mouth-model';

describe('the mouth map', () => {
  it('lays out six zones, three above and three below, numbered in the brushing order', () => {
    const zones = mouthZones(6, 200);
    expect(zones.map((zone) => zone.zone)).toEqual([1, 2, 3, 4, 5, 6]);
    const upper = zones.slice(0, 3).map((zone) => zone.label.y);
    const lower = zones.slice(3).map((zone) => zone.label.y);
    expect(Math.max(...upper)).toBeLessThan(Math.min(...lower));
  });

  it('lays out four quadrants and none for a handle without zones', () => {
    expect(mouthZones(4, 200)).toHaveLength(4);
    expect(mouthZones(0, 200)).toEqual([]);
  });

  it('runs the upper zones left to right and the lower ones right to left', () => {
    const zones = mouthZones(6, 200);
    const x = (zone: number): number => zones[zone - 1]?.label.x ?? 0;
    expect(x(1)).toBeLessThan(x(2));
    expect(x(2)).toBeLessThan(x(3));
    expect(x(4)).toBeGreaterThan(x(5));
    expect(x(5)).toBeGreaterThan(x(6));
  });

  it('draws every zone as a closed ring segment', () => {
    for (const zone of mouthZones(6, 120)) {
      expect(zone.path.startsWith('M')).toBe(true);
      expect(zone.path.endsWith('Z')).toBe(true);
    }
  });

  it('draws a segment between two radii and two angles', () => {
    const path = sectorPath({ cx: 50, cy: 50, inner: 10, outer: 40, from: 90, to: 0 });
    expect(path).toBe(
      'M50.00 10.00 A40.00 40.00 0 0 1 90.00 50.00 L60.00 50.00 A10.00 10.00 0 0 0 50.00 40.00 Z',
    );
  });
});
