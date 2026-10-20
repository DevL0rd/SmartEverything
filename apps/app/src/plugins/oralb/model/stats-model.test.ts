import {
  DEFAULT_GOAL,
  computeBrushingStats,
  type BrushingSession,
  type BrushingStats,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { oralbSessionOf } from '../../toothbrush/model/fixtures';
import {
  STRIP_SESSIONS,
  bestRun,
  faceBars,
  facesLabel,
  facesSummary,
  forceBuckets,
  forceLine,
  pressureShares,
  pressureSharesLabel,
} from './stats-model';

function statsOf(patch: Partial<BrushingStats>): BrushingStats {
  const base = computeBrushingStats({
    sessions: [],
    goal: DEFAULT_GOAL,
    range: 'week',
    anchor: '2026-10-18',
    today: '2026-10-18',
  });
  return { ...base, ...patch };
}

function sessionWithFace(index: number, face: number | null): BrushingSession {
  return oralbSessionOf({
    id: `s${String(index)}`,
    startedAt: new Date(Date.UTC(2026, 9, 1 + index, 7)).toISOString(),
    details: { zoneSource: 'pacer', face, batteryEnd: null, handleUser: null, sectors: 4 },
  });
}

describe('the face strip', () => {
  it('keeps the newest thirty sessions oldest first', () => {
    const sessions = Array.from({ length: 40 }, (_, index) => sessionWithFace(index, 5));
    const bars = faceBars([...sessions].reverse());
    expect(bars).toHaveLength(STRIP_SESSIONS);
    expect(bars[0]?.key).toBe('s10');
    expect(bars.at(-1)?.key).toBe('s39');
  });

  it('counts a special face from level two and a missing face as none', () => {
    const bars = faceBars([sessionWithFace(1, 1), sessionWithFace(2, 6), sessionWithFace(3, null)]);
    expect(bars.map((bar) => bar.special)).toEqual([false, true, false]);
    expect(bars.map((bar) => bar.level)).toEqual([1, 6, null]);
  });

  it('finds the longest run of special faces', () => {
    const bars = faceBars(
      [2, 5, 1, 7, 8, 9, null, 3].map((face, index) => sessionWithFace(index, face)),
    );
    expect(bestRun(bars)).toBe(3);
    expect(bestRun([])).toBe(0);
  });

  it('describes the strip without meaning for the levels', () => {
    const bars = faceBars([sessionWithFace(1, 4), sessionWithFace(2, null)]);
    expect(facesLabel(bars)).toContain('last 2 brushes, 1 with a face');
  });

  it('sums the special faces of the period', () => {
    const stats = statsOf({
      faces: [
        { key: '2026-10-12', sessions: 2, special: 1 },
        { key: '2026-10-13', sessions: 2, special: 2 },
      ],
    });
    expect(facesSummary(stats)).toBe('3 of 4 brushes ended on a special face');
    expect(facesSummary(statsOf({ faces: [] }))).toBeNull();
    expect(facesSummary(statsOf({}))).toBeNull();
  });
});

describe('the pressure shares', () => {
  it('splits light, good and too hard when light is known', () => {
    const shares = pressureShares(statsOf({ excessShare: 0.1, lowPressureShare: 0.3 }));
    expect(shares.map((part) => part.key)).toEqual(['light', 'good', 'hard']);
    expect(shares[1]?.share).toBeCloseTo(0.6);
    expect(pressureSharesLabel(shares)).toBe(
      'Pressure shares: Light 30 percent, Good 60 percent, Too hard 10 percent',
    );
  });

  it('shows only too hard against the rest when light is unknown', () => {
    const shares = pressureShares(statsOf({ excessShare: 0.25, lowPressureShare: null }));
    expect(shares.map((part) => part.label)).toEqual(['Too hard', 'Good or light']);
    expect(shares[1]?.share).toBeCloseTo(0.75);
  });

  it('shows nothing without a pressure reading and never goes negative', () => {
    expect(pressureShares(statsOf({}))).toEqual([]);
    const crossed = pressureShares(statsOf({ excessShare: 0.8, lowPressureShare: 0.9 }));
    expect(crossed[1]?.share).toBe(0);
  });
});

describe('the force chart', () => {
  it('draws a bar from the average to the peak of each period', () => {
    const stats = statsOf({
      force: [
        { key: '2026-10-12', averageN: 1.2, peakN: 2.4 },
        { key: '2026-10-13', averageN: null, peakN: null },
      ],
    });
    expect(forceBuckets(stats).map((bucket) => [bucket.min, bucket.max])).toEqual([
      [1.2, 2.4],
      [null, null],
    ]);
    expect(forceLine(stats)).toBe('Average 1.2 N, strongest 2.4 N');
  });

  it('says nothing without force readings', () => {
    expect(forceLine(statsOf({}))).toBeNull();
    expect(forceLine(statsOf({ force: [{ key: 'a', averageN: null, peakN: null }] }))).toBeNull();
    expect(forceBuckets(statsOf({}))).toEqual([]);
  });
});
