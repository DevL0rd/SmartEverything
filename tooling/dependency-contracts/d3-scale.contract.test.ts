import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('d3-scale contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'd3-scale')).toBe(installedVersion('d3-scale'));
  });

  it('positions values and bar bands and returns ticks inside the time domain', () => {
    const bars = scaleBand().domain(['left', 'right']).range([0, 100]);
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-10-01T01:00:00Z');
    const ticks = scaleTime().domain([start, end]).ticks(4);

    expect(scaleLinear().domain([0, 10]).range([100, 0])(2)).toBe(80);
    expect(bars('right')).toBe(50);
    expect(bars.bandwidth()).toBe(50);
    expect(ticks).toHaveLength(5);
    expect(ticks.at(0)).toEqual(start);
    expect(ticks.at(-1)).toEqual(end);
  });
});
