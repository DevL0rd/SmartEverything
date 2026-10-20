import { describe, expect, it } from 'vitest';
import {
  AVERAGE_LONG_DAYS,
  HEATMAP_DAYS,
  TREADMILL_SESSION,
  TREADMILL_STATS,
  addDays,
  bucketKeyOf,
  bucketKeysOf,
  computeStats,
  daysIn,
  previousWindowOf,
  windowOf,
  type TreadmillSession,
} from '../src';

function session(
  id: string,
  startedAt: string,
  values: Partial<TreadmillSession> = {},
): TreadmillSession {
  return {
    id,
    deviceId: 'device',
    walkerProfileId: 'walker',
    startedAt,
    endedAt: startedAt,
    zoneOffsetSeconds: 0,
    activeSeconds: 1800,
    pausedSeconds: 0,
    distanceM: 3000,
    steps: 4000,
    kcal: 150,
    kcalNet: 100,
    avgKmh: 6,
    maxKmh: 6.5,
    mode: 'manual',
    kind: 'walk',
    zones: { walk: 1800, jog: 0, run: 0 },
    splits: [600, 600, 600],
    source: 'live',
    climbM: null,
    inclineAvg: null,
    inclineMax: null,
    inclineSeconds: {},
    kcalSource: null,
    kcalEstimate: null,
    heartRateSource: null,
    ...values,
  };
}

const TODAY = '2026-10-18';

describe('calendar windows', () => {
  it('starts weeks on Monday and covers whole months and years', () => {
    expect(windowOf('day', TODAY)).toStrictEqual({ from: TODAY, to: TODAY });
    expect(windowOf('week', TODAY)).toStrictEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(windowOf('week', '2026-10-12')).toStrictEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(windowOf('month', TODAY)).toStrictEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(windowOf('month', '2028-02-10')).toStrictEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(windowOf('year', TODAY)).toStrictEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('steps back one period of the same kind', () => {
    expect(previousWindowOf('day', TODAY).from).toBe('2026-10-17');
    expect(previousWindowOf('week', TODAY)).toStrictEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(previousWindowOf('month', '2026-01-15')).toStrictEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(previousWindowOf('year', TODAY)).toStrictEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('keys buckets by hour, day or month', () => {
    expect(bucketKeysOf('day', windowOf('day', TODAY))).toHaveLength(24);
    expect(bucketKeysOf('week', windowOf('week', TODAY))).toHaveLength(7);
    expect(bucketKeysOf('year', windowOf('year', TODAY))).toHaveLength(12);
    expect(bucketKeyOf('day', '2026-10-18T07:30:00.000Z', 3600)).toBe('2026-10-18T08');
    expect(bucketKeyOf('week', '2026-10-18T23:30:00.000Z', 3600)).toBe('2026-10-19');
    expect(bucketKeyOf('year', '2026-10-18T07:30:00.000Z', 0)).toBe('2026-10');
    expect(daysIn({ from: '2026-02-27', to: '2026-03-01' })).toStrictEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });
});

describe('treadmill statistics', () => {
  const sessions = [
    session('a', '2026-10-12T07:00:00.000Z'),
    session('b', '2026-10-13T07:00:00.000Z', {
      distanceM: 5000,
      activeSeconds: 2400,
      avgKmh: 7.5,
      maxKmh: 9,
      steps: 6000,
      kcal: 300,
    }),
    session('c', '2026-10-17T18:00:00.000Z', { kcal: null, steps: null }),
    session('d', '2026-10-18T06:00:00.000Z', { distanceM: 1000, activeSeconds: 300 }),
    session('old', '2026-10-05T07:00:00.000Z', { distanceM: 2000 }),
  ];

  const stats = computeStats({ sessions, range: 'week', anchor: TODAY, today: TODAY });

  it('totals the range and compares it with the period before', () => {
    expect(stats.totals).toMatchObject({
      sessions: 4,
      distanceM: 12_000,
      activeSeconds: 6300,
      steps: 14_000,
      kcal: 600,
      activeDays: 4,
    });
    expect(stats.previous).toMatchObject({ sessions: 1, distanceM: 2000 });
    expect(stats.delta.distanceM).toBe(500);
    expect(stats.delta.sessions).toBe(300);
  });

  it('has no change figure when the period before was empty', () => {
    const lonely = computeStats({
      sessions: [session('x', '2026-10-18T06:00:00.000Z')],
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(lonely.delta.distanceM).toBeNull();
  });

  it('fills one bucket per day with the previous week behind it', () => {
    expect(stats.buckets.map((bucket) => bucket.distanceM)).toStrictEqual([
      3000, 5000, 0, 0, 0, 3000, 1000,
    ]);
    expect(stats.previousBuckets.map((bucket) => bucket.distanceM)).toStrictEqual([
      2000, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('averages per session and over moving windows', () => {
    expect(stats.perSession.distanceM).toBe(3000);
    expect(stats.perSession.avgKmh).toBeCloseTo(6.857, 2);
    expect(stats.average7).toHaveLength(7);
    expect(stats.average7[6]).toBeCloseTo(12_000 / 7, 5);
    expect(stats.average30[6]).toBeCloseTo(14_000 / AVERAGE_LONG_DAYS, 5);
  });

  it('keeps the best of everything ever, not only of the range', () => {
    expect(stats.bests.longestDistanceM).toMatchObject({ value: 5000, sessionId: 'b' });
    expect(stats.bests.longestSeconds).toMatchObject({ value: 2400, sessionId: 'b' });
    expect(stats.bests.fastestAvgKmh).toMatchObject({ value: 7.5 });
    expect(stats.bests.topSpeedKmh).toMatchObject({ value: 9 });
    expect(stats.bests.mostSteps).toMatchObject({ value: 6000 });
  });

  it('ignores sessions shorter than ten minutes for the fastest average', () => {
    const quick = computeStats({
      sessions: [session('q', '2026-10-18T06:00:00.000Z', { activeSeconds: 120, avgKmh: 12 })],
      range: 'day',
      anchor: TODAY,
      today: TODAY,
    });
    expect(quick.bests.fastestAvgKmh).toBeNull();
    expect(quick.bests.longestSeconds).toMatchObject({ value: 120 });
  });

  it('counts a streak of days in a row, alive until the day after the last session', () => {
    expect(stats.streak).toStrictEqual({ current: 2, longest: 2 });
    const gap = computeStats({
      sessions: [
        session('1', '2026-10-01T07:00:00.000Z'),
        session('2', '2026-10-02T07:00:00.000Z'),
        session('3', '2026-10-03T07:00:00.000Z'),
        session('4', '2026-10-10T07:00:00.000Z'),
      ],
      range: 'month',
      anchor: TODAY,
      today: TODAY,
    });
    expect(gap.streak).toStrictEqual({ current: 0, longest: 3 });
    const yesterday = computeStats({
      sessions: [session('1', '2026-10-17T07:00:00.000Z')],
      range: 'day',
      anchor: TODAY,
      today: TODAY,
    });
    expect(yesterday.streak.current).toBe(1);
  });

  it('draws a year of days with levels from the busiest day', () => {
    expect(stats.heatmap).toHaveLength(HEATMAP_DAYS);
    expect(stats.heatmap.at(-1)).toStrictEqual({ day: TODAY, distanceM: 1000, level: 1 });
    expect(stats.heatmap.find((entry) => entry.day === '2026-10-13')?.level).toBe(4);
    expect(stats.heatmap[0]?.day).toBe(addDays(TODAY, 1 - HEATMAP_DAYS));
    expect(stats.heatmap[0]?.level).toBe(0);
  });

  it('adds up the time in each speed zone and the stride and cadence of each session', () => {
    expect(stats.zones).toStrictEqual({ walk: 7200, jog: 0, run: 0 });
    expect(stats.efficiency).toHaveLength(4);
    expect(stats.efficiency[0]).toMatchObject({
      sessionId: 'a',
      cadence: 4000 / 30,
      strideM: 0.75,
    });
    expect(stats.efficiency[2]).toMatchObject({ sessionId: 'c', cadence: null, strideM: null });
  });

  it('answers a range with nothing in it with zeros', () => {
    const empty = computeStats({ sessions: [], range: 'year', anchor: TODAY, today: TODAY });
    expect(empty.totals.sessions).toBe(0);
    expect(empty.perSession).toStrictEqual({
      climbM: 0,
      distanceM: 0,
      activeSeconds: 0,
      avgKmh: 0,
      steps: 0,
      kcal: 0,
    });
    expect(empty.bests.longestDistanceM).toBeNull();
    expect(empty.heatmap.every((entry) => entry.level === 0)).toBe(true);
    expect(empty.buckets).toHaveLength(12);
    expect(empty.average7).toHaveLength(12);
  });

  it('is accepted by its own schema', () => {
    expect(TREADMILL_STATS.parse(stats)).toStrictEqual(stats);
    expect(TREADMILL_SESSION.parse(sessions[0])).toStrictEqual(sessions[0]);
    for (const range of ['day', 'month', 'year'] as const) {
      expect(() =>
        TREADMILL_STATS.parse(computeStats({ sessions, range, anchor: TODAY, today: TODAY })),
      ).not.toThrow();
    }
  });
});

describe('climb and incline stats', () => {
  it('sums climb per bucket with the previous period and finds the best climb', () => {
    const stats = computeStats({
      sessions: [
        session('a', '2026-10-13T10:00:00Z', {
          climbM: 40,
          inclineAvg: 4,
          inclineMax: 8,
          inclineSeconds: { '4': 900, '8': 900 },
        }),
        session('b', '2026-10-15T10:00:00Z', {
          climbM: 90,
          inclineAvg: 2,
          inclineMax: 3,
          inclineSeconds: { '2': 1800 },
        }),
        session('c', '2026-10-06T10:00:00Z', { climbM: 30 }),
      ],
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(stats.totals.climbM).toBe(130);
    expect(stats.previous.climbM).toBe(30);
    expect(stats.delta.climbM).toBeCloseTo(333.33, 1);
    expect(stats.previousBuckets.reduce((sum, bucket) => sum + bucket.climbM, 0)).toBe(30);
    expect(stats.bests.mostClimbM?.sessionId).toBe('b');
    expect(stats.incline).toStrictEqual({
      avg: 3,
      max: 8,
      seconds: { '4': 900, '8': 900, '2': 1800 },
    });
    expect(TREADMILL_STATS.parse(stats)).toStrictEqual(stats);
  });
});
