import { describe, expect, it } from 'vitest';
import { donutArcs, donutSummary } from './donut-model';

const SLICES = [
  { key: 'colour', value: 30, colour: 'primary', label: 'Colour' },
  { key: 'mono', value: 70, colour: 'viz-2', label: 'Mono' },
] as const;

describe('donut arcs', () => {
  it('splits a circle by value and leaves a small gap between slices', () => {
    const arcs = donutArcs(SLICES);
    expect(arcs).toHaveLength(2);
    expect(arcs[0]?.share).toBeCloseTo(0.3, 6);
    expect(arcs[0]?.from).toBeCloseTo(1.5, 6);
    expect(arcs[0]?.to).toBeCloseTo(108 - 1.5, 6);
    expect(arcs[1]?.to).toBeCloseTo(358.5, 6);
  });

  it('draws one slice as a full circle without a gap and nothing for no data', () => {
    const [only] = donutArcs([SLICES[0]]);
    expect(only?.from).toBe(0);
    expect(only?.to).toBe(360);
    expect(donutArcs([{ ...SLICES[0], value: 0 }])).toEqual([]);
    expect(donutArcs([])).toEqual([]);
  });

  it('says every share in words, so colour is never the only carrier', () => {
    expect(donutSummary(donutArcs(SLICES))).toBe('Colour 30 percent, Mono 70 percent');
    expect(donutSummary([])).toBe('No data');
  });
});
