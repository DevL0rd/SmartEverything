import type { BrushActivity } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  TRACE_WINDOW_S,
  appendSample,
  pathOf,
  sharePath,
  stripShares,
  stripWindow,
  tracePoints,
  type TraceSample,
} from './trace-model';

function frame(
  second: number,
  force: number | null,
  activity: BrushActivity = 'brushing',
): { readonly at: string; readonly force: number | null; readonly activity: BrushActivity } {
  return { at: new Date(Date.UTC(2026, 9, 18, 7, 0, second)).toISOString(), force, activity };
}

describe('the 60 second trace', () => {
  it('keeps only the last sixty seconds', () => {
    let trace: readonly TraceSample[] = [];
    for (let second = 0; second <= 90; second += 1) {
      trace = appendSample(trace, frame(second, 1));
    }
    expect(trace[0]?.atMs).toBe(Date.UTC(2026, 9, 18, 7, 0, 90 - TRACE_WINDOW_S));
    expect(trace).toHaveLength(TRACE_WINDOW_S + 1);
  });

  it('ignores repeats, older frames, missing force and a paused or idle brush', () => {
    const base = appendSample([], frame(10, 1));
    expect(appendSample(base, frame(10, 2))).toBe(base);
    expect(appendSample(base, frame(5, 2))).toBe(base);
    expect(appendSample(base, frame(11, null))).toBe(base);
    expect(appendSample(base, frame(11, 1, 'paused'))).toBe(base);
  });

  it('puts now at the right edge and older samples to the left', () => {
    const trace = [
      { atMs: 0, force: 0 },
      { atMs: 30_000, force: 3.5 },
      { atMs: 60_000, force: 1.75 },
    ];
    const points = tracePoints(trace, 3.5, { width: 100, height: 40 });
    expect(points.map((point) => Math.round(point.x))).toEqual([0, 50, 100]);
    expect(points.map((point) => Math.round(point.y))).toEqual([40, 0, 20]);
    expect(pathOf(points)).toBe('M0.0 40.0 L50.0 0.0 L100.0 20.0');
  });

  it('draws nothing without samples', () => {
    expect(tracePoints([], 3.5, { width: 100, height: 40 })).toEqual([]);
    expect(pathOf([])).toBe('');
    expect(sharePath([], { width: 100, height: 40 })).toBe('');
  });
});

describe('the state strip', () => {
  it('shows the last sixty seconds of the session strip as a step line', () => {
    const codes = [0, 1, 2] as const;
    const strip = Array.from({ length: 80 }, (_, index) => codes[index % 3] ?? 0);
    expect(stripWindow(strip)).toHaveLength(60);
    const shares = stripShares([0, 1, 2]);
    expect(shares[0]).toBeLessThan(shares[1] ?? 0);
    expect(shares[1]).toBeLessThan(shares[2] ?? 0);
    const path = sharePath(shares, { width: 59, height: 100 });
    expect(path).toBe('M57.0 83.0 L58.0 50.0 L59.0 17.0');
  });
});
