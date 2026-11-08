import { bisector, extent, greatest, least, max, min, range } from 'd3-array';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('d3-array contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'd3-array')).toBe(installedVersion('d3-array'));
  });

  it('finds chart bounds and nearest readings and enumerates bar slots', () => {
    const times = [5, 10, 20];
    const readings = [{ value: 12 }, { value: 3 }];

    expect(extent(times)).toEqual([5, 20]);
    expect(extent([])).toEqual([undefined, undefined]);
    expect(min(times)).toBe(5);
    expect(max(times)).toBe(20);
    expect(least(readings, (reading) => reading.value)).toEqual({ value: 3 });
    expect(greatest(readings, (reading) => reading.value)).toEqual({ value: 12 });
    expect(bisector<number, number>((time) => time).center(times, 17)).toBe(2);
    expect(range(3)).toEqual([0, 1, 2]);
  });
});
