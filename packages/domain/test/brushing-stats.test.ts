import { describe, expect, it } from 'vitest';
import {
  BRUSHING_SESSION,
  BRUSHING_STATS,
  DEFAULT_GOAL,
  batteryRun,
  brushGoalOf,
  brushSettingsOf,
  computeBrushingStats,
  countsForGoal,
  dayPartOf,
  goalDayOf,
  headForecast,
  mayWriteHandle,
  sonicareProfileOf,
  SONICARE_IDENTITY,
  sensorMaskOf,
  sessionsLeftOf,
  todayOf,
  wearPercentOf,
  type BrushingSession,
} from '../src';

const TODAY = '2026-10-18';

function session(
  id: string,
  startedAt: string,
  values: Partial<BrushingSession> = {},
): BrushingSession {
  return BRUSHING_SESSION.parse({
    id,
    deviceId: 'device',
    personId: 'sam',
    handleSessionId: null,
    startedAt,
    zoneOffsetSeconds: 0,
    durationS: 120,
    routineS: 120,
    mode: 'clean',
    intensity: 'medium',
    source: 'retained',
    complete: true,
    pressure: null,
    zones: [20, 20, 20, 20, 20, 20],
    headSerial: null,
    ...values,
  });
}

function twiceADay(day: string): BrushingSession[] {
  return [session(`${day}-am`, `${day}T07:00:00Z`), session(`${day}-pm`, `${day}T21:00:00Z`)];
}

describe('which day a session counts for', () => {
  it('moves a session brushed before three in the morning to the evening before', () => {
    const late = session('late', '2026-10-18T01:30:00Z');
    expect(goalDayOf(DEFAULT_GOAL, late)).toBe('2026-10-17');
    expect(goalDayOf(DEFAULT_GOAL, session('noon', '2026-10-18T03:00:00Z'))).toBe('2026-10-18');
  });

  it('uses the zone of the person, not of the hub', () => {
    const away = session('away', '2026-10-18T22:00:00Z', { zoneOffsetSeconds: 7 * 3600 });
    expect(goalDayOf(DEFAULT_GOAL, away)).toBe('2026-10-19');
  });

  it('names the morning, the evening that wraps midnight, and the gap between', () => {
    expect(dayPartOf(DEFAULT_GOAL, 7)).toBe('morning');
    expect(dayPartOf(DEFAULT_GOAL, 21)).toBe('evening');
    expect(dayPartOf(DEFAULT_GOAL, 1)).toBe('evening');
    expect(dayPartOf(DEFAULT_GOAL, 14)).toBe('other');
  });

  it('counts a session towards the goal only when it reaches the minimum', () => {
    expect(countsForGoal(DEFAULT_GOAL, { durationS: 120, routineS: 120 })).toBe(true);
    expect(countsForGoal(DEFAULT_GOAL, { durationS: 90, routineS: 120 })).toBe(false);
    expect(
      countsForGoal({ ...DEFAULT_GOAL, minimumSeconds: 60 }, { durationS: 90, routineS: 120 }),
    ).toBe(true);
  });
});

describe('the day so far', () => {
  it('shows the morning done and the evening still to do', () => {
    const today = todayOf([session('am', `${TODAY}T07:00:00Z`)], DEFAULT_GOAL, TODAY);
    expect(today).toMatchObject({
      sessions: 1,
      counted: 1,
      morning: true,
      evening: false,
      percent: 50,
    });
    expect(today.goalSeconds).toBe(240);
  });

  it('does not count a short session as done', () => {
    const today = todayOf(
      [session('short', `${TODAY}T07:00:00Z`, { durationS: 40, complete: false })],
      DEFAULT_GOAL,
      TODAY,
    );
    expect(today).toMatchObject({
      sessions: 1,
      counted: 0,
      morning: false,
      percent: 0,
      seconds: 40,
    });
  });
});

describe('statistics for a period', () => {
  const sessions = [
    ...twiceADay('2026-10-12'),
    ...twiceADay('2026-10-13'),
    session('short', '2026-10-14T07:00:00Z', {
      durationS: 50,
      complete: false,
      mode: 'white_plus',
      intensity: 'high',
    }),
    ...twiceADay('2026-10-16'),
    ...twiceADay('2026-10-17'),
    ...twiceADay('2026-10-05'),
  ];

  it('totals the week, compares it with the week before and validates against its schema', () => {
    const stats = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(BRUSHING_STATS.parse(stats)).toStrictEqual(stats);
    expect(stats.from).toBe('2026-10-12');
    expect(stats.totals).toMatchObject({ sessions: 9, complete: 8, activeDays: 5, goalDays: 4 });
    expect(stats.previous.sessions).toBe(2);
    expect(stats.delta.sessions).toBe(350);
    expect(stats.completionRate).toBeCloseTo(8 / 9);
    expect(stats.buckets).toHaveLength(7);
  });

  it('splits morning and evening, the hours and the modes', () => {
    const stats = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(stats.split).toStrictEqual({ morning: 5, evening: 4, other: 0 });
    expect(stats.timeOfDay[7]).toBe(5);
    expect(stats.timeOfDay[21]).toBe(4);
    expect(stats.modeMix.clean).toBe(8);
    expect(stats.modeMix.white_plus).toBe(1);
    expect(stats.intensityMix.high).toBe(1);
    expect(stats.zoneSeconds).toStrictEqual([180, 180, 180, 180, 180, 180]);
  });

  it('keeps a streak across the days that met the goal and ends it after a missed day', () => {
    const stats = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(stats.streak).toStrictEqual({ current: 2, longest: 2 });
    expect(stats.bests.longestStreak).toBe(2);
    expect(stats.bests.bestWeek).toMatchObject({ value: 9, day: '2026-10-12' });
    const broken = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: '2026-10-20',
    });
    expect(broken.streak.current).toBe(0);
  });

  it('draws a year of days with a clear difference between short, one and goal days', () => {
    const stats = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'month',
      anchor: TODAY,
      today: TODAY,
    });
    const kinds = new Map(stats.heatmap.map((day) => [day.day, day.kind]));
    expect(stats.heatmap).toHaveLength(365);
    expect(kinds.get('2026-10-14')).toBe('short');
    expect(kinds.get('2026-10-17')).toBe('goal');
    expect(kinds.get('2026-10-15')).toBe('none');
    expect(kinds.get(TODAY)).toBe('none');
  });

  it('scores consistency from goal days, completion and pressure and renormalises without pressure', () => {
    const stats = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(stats.consistency.pressureRate).toBeNull();
    expect(stats.consistency.score).toBe(Math.round((((4 / 7) * 50 + (8 / 9) * 30) / 80) * 100));
    const pressured = sessions.map((item) =>
      session(item.id, item.startedAt, {
        pressure: { excessS: 12, optimalS: 100, strip: new Array<0>(120).fill(0) },
      }),
    );
    const withPressure = computeBrushingStats({
      sessions: pressured,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });
    expect(withPressure.excessShare).toBeCloseTo(0.1);
    expect(withPressure.consistency.pressureRate).toBeCloseTo(0.9);
  });

  it('reports no score and zero rates for a period without sessions', () => {
    const stats = computeBrushingStats({
      sessions: [],
      goal: DEFAULT_GOAL,
      range: 'month',
      anchor: TODAY,
      today: TODAY,
    });
    expect(stats.consistency.score).toBeNull();
    expect(stats.completionRate).toBe(0);
    expect(stats.delta.sessions).toBeNull();
    expect(stats.bests.longestSession).toBeNull();
  });

  it('buckets a day by hour and a year by month', () => {
    const day = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'day',
      anchor: '2026-10-17',
      today: TODAY,
    });
    expect(day.buckets).toHaveLength(24);
    expect(day.buckets.find((bucket) => bucket.key === '2026-10-17T07')?.sessions).toBe(1);
    const year = computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'year',
      anchor: TODAY,
      today: TODAY,
    });
    expect(year.buckets.find((bucket) => bucket.key === '2026-10')?.sessions).toBe(11);
  });
});

describe('brush head and battery', () => {
  it('turns usage into wear, sessions left and a replace-by date', () => {
    expect(wearPercentOf(10_800)).toBe(50);
    expect(wearPercentOf(30_000)).toBe(100);
    expect(sessionsLeftOf(21_000, 120)).toBe(5);
    const forecast = headForecast(
      [
        { at: '2026-09-18T00:00:00.000Z', usageS: 0 },
        { at: '2026-10-18T00:00:00.000Z', usageS: 3600 },
      ],
      120,
    );
    expect(forecast?.perDayS).toBeCloseTo(120);
    expect(forecast?.replaceBy).toBe('2027-03-17T00:00:00.000Z');
    expect(headForecast([], 120)).toBeNull();
    expect(
      headForecast([{ at: '2026-10-18T00:00:00.000Z', usageS: 100 }], 120)?.replaceBy,
    ).toBeNull();
  });

  it('finds charges and days per charge in a discharge curve', () => {
    const run = batteryRun([
      { at: '2026-10-01T00:00:00.000Z', percent: 100 },
      { at: '2026-10-08T00:00:00.000Z', percent: 50 },
      { at: '2026-10-15T00:00:00.000Z', percent: 10 },
      { at: '2026-10-15T12:00:00.000Z', percent: 100 },
      { at: '2026-10-17T12:00:00.000Z', percent: 90 },
    ]);
    expect(run.charges).toStrictEqual(['2026-10-15T12:00:00.000Z']);
    expect(run.daysPerCharge).toStrictEqual([14]);
    expect(run.daysLeft).toBe(9 * 2);
    expect(batteryRun([]).daysLeft).toBeNull();
  });

  it('falls back to the typical run when a charge is too fresh to show a slope', () => {
    const run = batteryRun([
      { at: '2026-10-01T00:00:00.000Z', percent: 100 },
      { at: '2026-10-11T00:00:00.000Z', percent: 20 },
      { at: '2026-10-11T06:00:00.000Z', percent: 100 },
    ]);
    expect(run.daysLeft).toBe(10);
  });
});

describe('brush settings', () => {
  const profile = (model: string): ReturnType<typeof sonicareProfileOf> =>
    sonicareProfileOf(
      SONICARE_IDENTITY.parse({
        model,
        serial: null,
        firmware: null,
        manufacturer: null,
        pnp: null,
        stack: 'classic',
        bonded: false,
        address: 'aa',
        gapName: null,
        services: [],
        ports: [],
        routineIds: null,
        clockIsUnix: null,
      }),
    );

  it('starts with safe defaults and a goal of two sessions a day', () => {
    const settings = brushSettingsOf(undefined);
    expect(settings).toMatchObject({ policy: 'on_demand', consent: false, personId: null });
    expect(settings.sensors).toStrictEqual({ pressure: true, temperature: true, motion: false });
    expect(brushGoalOf(settings, 'anyone').sessionsPerDay).toBe(2);
    expect(
      brushGoalOf({ ...settings, goals: { sam: { ...DEFAULT_GOAL, sessionsPerDay: 3 } } }, 'sam')
        .sessionsPerDay,
    ).toBe(3);
  });

  it('asks the handle for the sensors the profile has and the person wants', () => {
    const settings = brushSettingsOf({ sensors: { motion: true } });
    expect(sensorMaskOf(settings.sensors, profile('HX999X'))).toBe(7);
    expect(sensorMaskOf(settings.sensors, profile('HX6340'))).toBe(0);
    expect(
      sensorMaskOf({ pressure: false, temperature: true, motion: false }, profile('HX999X')),
    ).toBe(2);
  });

  it('allows handle writes only with a writable model and the owner consent', () => {
    const consented = brushSettingsOf({ consent: true });
    expect(mayWriteHandle(profile('HX999X'), consented)).toBe(true);
    expect(mayWriteHandle(profile('HX999X'), brushSettingsOf({}))).toBe(false);
    expect(mayWriteHandle(profile('HX992X'), consented)).toBe(false);
  });
});

describe('the extras an Oral-B session brings', () => {
  const details = (face: number | null): BrushingSession['details'] => ({
    zoneSource: 'pacer',
    face,
    batteryEnd: 80,
    handleUser: null,
    sectors: 4,
  });
  const pressure = (extra: Record<string, number>): BrushingSession['pressure'] => ({
    excessS: 4,
    optimalS: 90,
    strip: Array.from({ length: 100 }, () => 1),
    ...extra,
  });
  const range = (sessions: BrushingSession[]): ReturnType<typeof computeBrushingStats> =>
    computeBrushingStats({
      sessions,
      goal: DEFAULT_GOAL,
      range: 'week',
      anchor: TODAY,
      today: TODAY,
    });

  it('leaves the extras empty for sessions that do not have them', () => {
    const stats = range(twiceADay(TODAY));
    expect(stats.lowPressureShare).toBeNull();
    expect(stats.faces).toBeNull();
    expect(stats.force).toBeNull();
    expect(BRUSHING_STATS.parse(stats)).toStrictEqual(stats);
  });

  it('shares low-pressure seconds over the seconds measured', () => {
    const stats = range([
      session('a', `${TODAY}T07:00:00Z`, { pressure: pressure({ lowS: 10 }) }),
      session('b', `${TODAY}T21:00:00Z`, { pressure: pressure({ lowS: 30 }) }),
      session('c', '2026-10-17T21:00:00Z', { pressure: pressure({}) }),
    ]);
    expect(stats.lowPressureShare).toBeCloseTo(0.2);
  });

  it('counts faces and special faces per bucket and ignores a handle that showed none', () => {
    const stats = range([
      session('a', `${TODAY}T07:00:00Z`, { details: details(1) }),
      session('b', `${TODAY}T21:00:00Z`, { details: details(5) }),
      session('c', '2026-10-17T21:00:00Z', { details: details(0) }),
      session('d', '2026-10-16T21:00:00Z', { details: details(null) }),
    ]);
    const today = stats.faces?.find((bucket) => bucket.key === TODAY);
    expect(today).toStrictEqual({ key: TODAY, sessions: 2, special: 1 });
    expect(stats.faces?.reduce((sum, bucket) => sum + bucket.sessions, 0)).toBe(2);
  });

  it('averages force and keeps the peak per bucket', () => {
    const stats = range([
      session('a', `${TODAY}T07:00:00Z`, { pressure: pressure({ forceAvgN: 1, forceMaxN: 2 }) }),
      session('b', `${TODAY}T21:00:00Z`, { pressure: pressure({ forceAvgN: 2, forceMaxN: 4 }) }),
      session('c', '2026-10-17T21:00:00Z', { pressure: pressure({}) }),
    ]);
    expect(stats.force?.find((bucket) => bucket.key === TODAY)).toStrictEqual({
      key: TODAY,
      averageN: 1.5,
      peakN: 4,
    });
    expect(stats.force?.find((bucket) => bucket.key === '2026-10-17')).toStrictEqual({
      key: '2026-10-17',
      averageN: null,
      peakN: null,
    });
  });
});
