import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  appendPoint,
  LIVE_WINDOW_MS,
  mergePoints,
  needsRefresh,
  newerFrame,
  pointOf,
  seedPoints,
  seriesOf,
  steppedSeries,
  heartZoneSeconds,
  heartZoneLabel,
  type LivePoint,
} from './speed-history';

function frame(at: string, belt: Partial<TreadmillLiveFrame['belt']> = {}): TreadmillLiveFrame {
  return {
    at,
    belt: {
      state: 'running',
      mode: 'manual',
      speedKmh: 3,
      targetSpeedKmh: null,
      timeS: 10,
      distanceM: 8,
      steps: 20,
      cadence: 90,
      inclinePercent: null,
      inclineTarget: null,
      inclineGrade: null,
      inclineScale: 'unconfirmed',
      button: null,
      childLock: false,
      controlLost: false,
      link: 'linked',
      ...belt,
    },
    session: null,
    body: {
      kcal: 5,
      kcalNet: 3,
      met: 3,
      weightKg: 70,
      heartRate: null,
      kcalSource: null,
      heartRateSource: null,
    },
  };
}

function point(t: number, over: Partial<LivePoint> = {}): LivePoint {
  return {
    t,
    speed: 3,
    distanceM: t,
    steps: null,
    cadence: null,
    kcal: null,
    incline: null,
    heartRate: null,
    climbM: null,
    ...over,
  };
}

describe('the live history of the last five minutes', () => {
  it('reads a point from a frame, with kilocalories only when body data came with it', () => {
    expect(pointOf(frame('2026-10-18T10:00:00.000Z'))).toEqual({
      t: Date.parse('2026-10-18T10:00:00.000Z'),
      speed: 3,
      distanceM: 8,
      steps: 20,
      cadence: 90,
      kcal: 5,
      incline: null,
      heartRate: null,
      climbM: null,
    });
    expect(pointOf({ ...frame('2026-10-18T10:00:00.000Z'), body: null }).kcal).toBeNull();
  });

  it('keeps points in order and ignores one that is not newer', () => {
    const second = appendPoint(appendPoint([], point(1000)), point(2000));
    expect(second.map((entry) => entry.t)).toEqual([1000, 2000]);
    expect(appendPoint(second, point(2000))).toBe(second);
    expect(appendPoint(second, point(1500))).toBe(second);
  });

  it('drops what fell out of the window', () => {
    const history = appendPoint(
      [point(0, { distanceM: 0 })],
      point(LIVE_WINDOW_MS + 1, { distanceM: 5 }),
    );
    expect(history.map((entry) => entry.t)).toEqual([LIVE_WINDOW_MS + 1]);
    expect(
      appendPoint([point(0, { distanceM: 0 })], point(LIVE_WINDOW_MS, { distanceM: 5 })),
    ).toHaveLength(2);
  });

  it('starts again when the distance counter goes back to a new session', () => {
    const history = appendPoint(
      [point(1000, { distanceM: 400 }), point(2000, { distanceM: 410 })],
      point(3000, { distanceM: 0 }),
    );
    expect(history).toEqual([point(3000, { distanceM: 0 })]);
  });

  it('seeds a history from the hub’s recent speeds', () => {
    const seeded = seedPoints([
      { at: '2026-10-18T10:00:00.000Z', kmh: 3 },
      { at: '2026-10-18T10:00:01.000Z', kmh: 3.2 },
    ]);
    expect(seeded.map((entry) => entry.speed)).toEqual([3, 3.2]);
    expect(seeded[0]?.kcal).toBeNull();
  });

  it('integrates the distance of the seeded speeds so the distance trend has a shape', () => {
    const seeded = seedPoints([
      { at: '2026-10-18T10:00:00.000Z', kmh: 3.6 },
      { at: '2026-10-18T10:00:10.000Z', kmh: 7.2 },
      { at: '2026-10-18T10:00:20.000Z', kmh: 7.2 },
    ]);
    expect(seeded.map((entry) => entry.distanceM)).toEqual([0, 10, 30]);
  });

  it('keeps the loaded history behind the first live points instead of starting over', () => {
    const seeded = [
      point(1, { distanceM: 0 }),
      point(2, { distanceM: 5 }),
      point(3, { distanceM: 9 }),
    ];
    const live = [point(3, { distanceM: 100 }), point(4, { distanceM: 104 })];
    expect(mergePoints(seeded, []).map((entry) => entry.t)).toEqual([1, 2, 3]);
    expect(mergePoints(seeded, live).map((entry) => [entry.t, entry.distanceM])).toEqual([
      [1, 95],
      [2, 100],
      [3, 100],
      [4, 104],
    ]);
    expect(mergePoints([], live)).toBe(live);
  });

  it('draws one measure and skips the points without it', () => {
    const history = [point(1, { cadence: 90 }), point(2), point(3, { cadence: 95 })];
    expect(seriesOf(history, (entry) => entry.cadence)).toEqual([
      { t: 1, v: 90 },
      { t: 3, v: 95 },
    ]);
  });
});

describe('when the loaded view must be read again', () => {
  const base = frame('2026-10-18T10:00:00.000Z');
  const later = '2026-10-18T10:00:01.000Z';

  it('reads again on the first frame and on a change of state, link, mode or lock', () => {
    expect(needsRefresh(null, base)).toBe(true);
    expect(needsRefresh(base, frame(later, { state: 'paused' }))).toBe(true);
    expect(needsRefresh(base, frame(later, { link: 'lost' }))).toBe(true);
    expect(needsRefresh(base, frame(later, { mode: 'auto' }))).toBe(true);
    expect(needsRefresh(base, frame(later, { childLock: true }))).toBe(true);
    expect(needsRefresh(base, frame(later, { controlLost: true }))).toBe(true);
  });

  it('stays quiet while only the numbers move', () => {
    expect(needsRefresh(base, frame(later, { speedKmh: 4, timeS: 11 }))).toBe(false);
  });

  it('prefers the newer of the live and the loaded frame', () => {
    const older = frame('2026-10-18T09:59:00.000Z');
    expect(newerFrame(null, base)).toBe(base);
    expect(newerFrame(older, base)).toBe(base);
    expect(newerFrame(base, older)).toBe(base);
  });
});

describe('incline and heart rate in the live history', () => {
  it('reads the raw incline and the heart rate from a frame', () => {
    const read = pointOf({
      ...frame('2026-10-18T10:00:00.000Z', { inclinePercent: 6 }),
      body: {
        kcal: 5,
        kcalNet: 3,
        met: 3,
        weightKg: 70,
        heartRate: 131,
        kcalSource: 'belt',
        heartRateSource: 'grips',
      },
    });
    expect(read.incline).toBe(6);
    expect(read.heartRate).toBe(131);
  });

  it('draws the incline as a step line that holds each level until it changes', () => {
    const history = [
      point(0, { incline: 2 }),
      point(1000, { incline: 2 }),
      point(2000, { incline: 5 }),
      point(3000, { incline: null }),
      point(4000, { incline: 5 }),
    ];
    expect(steppedSeries(history, (entry) => entry.incline)).toEqual([
      { t: 0, v: 2 },
      { t: 1000, v: 2 },
      { t: 1999, v: 2 },
      { t: 2000, v: 5 },
      { t: 4000, v: 5 },
    ]);
  });

  it('adds up the seconds spent in each heart rate zone', () => {
    const history = [
      point(0, { heartRate: 100 }),
      point(60_000, { heartRate: 130 }),
      point(90_000, { heartRate: null }),
      point(120_000, { heartRate: 150 }),
    ];
    expect(heartZoneSeconds(history, 200)).toEqual({
      warm: 60,
      easy: 30,
      aerobic: 0,
      hard: 0,
      peak: 0,
    });
  });

  it('names the zone of a heart rate and none below the first', () => {
    expect(heartZoneLabel(150, 200)).toBe('Cardio');
    expect(heartZoneLabel(80, 200)).toBeNull();
  });
});
