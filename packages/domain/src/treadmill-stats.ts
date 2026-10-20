import { z } from 'zod';
import {
  LOCAL_DAY,
  STATS_RANGES,
  addDays,
  bucketKeyOf,
  bucketKeysOf,
  dayNumber,
  daysIn,
  sessionDayOf,
  previousWindowOf,
  windowOf,
  type StatsRange,
} from './treadmill-days';
import { SESSION_ZONE_SECONDS, type TreadmillSession } from './treadmill-sessions';

export const AVERAGE_SHORT_DAYS = 7;

export const AVERAGE_LONG_DAYS = 30;

export const HEATMAP_DAYS = 365;

const FASTEST_MIN_SECONDS = 600;

const METRES_PER_KM = 1000;

export const STATS_TOTALS = z.strictObject({
  sessions: z.number().int().nonnegative(),
  activeSeconds: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  kcal: z.number().nonnegative(),
  climbM: z.number().nonnegative().default(0),
  activeDays: z.number().int().nonnegative(),
});

export type StatsTotals = z.infer<typeof STATS_TOTALS>;

export const STATS_BUCKET = z.strictObject({
  key: z.string(),
  sessions: z.number().int().nonnegative(),
  activeSeconds: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  kcal: z.number().nonnegative(),
  climbM: z.number().nonnegative().default(0),
});

export type StatsBucket = z.infer<typeof STATS_BUCKET>;

const BEST = z.strictObject({
  value: z.number().nonnegative(),
  sessionId: z.string(),
  at: z.iso.datetime({ offset: true }),
});

export const STATS_BESTS = z.strictObject({
  longestDistanceM: BEST.nullable(),
  longestSeconds: BEST.nullable(),
  fastestAvgKmh: BEST.nullable(),
  topSpeedKmh: BEST.nullable(),
  mostSteps: BEST.nullable(),
  mostClimbM: BEST.nullable().default(null),
});

export type StatsBests = z.infer<typeof STATS_BESTS>;

const DELTA = z.number().nullable();

export const STATS_DELTA = z.strictObject({
  sessions: DELTA,
  activeSeconds: DELTA,
  distanceM: DELTA,
  steps: DELTA,
  kcal: DELTA,
  climbM: DELTA.default(null),
});

export const HEAT_LEVELS = 4;

export const STATS_HEAT_DAY = z.strictObject({
  day: LOCAL_DAY,
  distanceM: z.number().nonnegative(),
  level: z.number().int().min(0).max(HEAT_LEVELS),
});

export const STATS_EFFICIENCY = z.strictObject({
  sessionId: z.string(),
  at: z.iso.datetime({ offset: true }),
  avgKmh: z.number().nonnegative(),
  cadence: z.number().nullable(),
  strideM: z.number().nullable(),
});

export const STATS_INCLINE = z.strictObject({
  avg: z.number().nullable(),
  max: z.number().nullable(),
  seconds: z.record(z.string(), z.number().nonnegative()),
});

export const TREADMILL_STATS = z.strictObject({
  range: z.enum(STATS_RANGES),
  from: LOCAL_DAY,
  to: LOCAL_DAY,
  buckets: z.array(STATS_BUCKET),
  previousBuckets: z.array(STATS_BUCKET),
  totals: STATS_TOTALS,
  previous: STATS_TOTALS,
  delta: STATS_DELTA,
  average7: z.array(z.number().nonnegative()),
  average30: z.array(z.number().nonnegative()),
  perSession: z.strictObject({
    distanceM: z.number().nonnegative(),
    activeSeconds: z.number().nonnegative(),
    avgKmh: z.number().nonnegative(),
    steps: z.number().nonnegative(),
    kcal: z.number().nonnegative(),
    climbM: z.number().nonnegative().default(0),
  }),
  incline: STATS_INCLINE.default({ avg: null, max: null, seconds: {} }),
  bests: STATS_BESTS,
  streak: z.strictObject({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
  }),
  heatmap: z.array(STATS_HEAT_DAY),
  zones: SESSION_ZONE_SECONDS,
  efficiency: z.array(STATS_EFFICIENCY),
});

export type TreadmillStats = z.infer<typeof TREADMILL_STATS>;

export interface StatsRequest {
  readonly sessions: readonly TreadmillSession[];
  readonly range: StatsRange;
  readonly anchor: string;
  readonly today: string;
}

function emptyBucket(key: string): StatsBucket {
  return { key, sessions: 0, activeSeconds: 0, distanceM: 0, steps: 0, kcal: 0, climbM: 0 };
}

function bucketsOf(
  sessions: readonly TreadmillSession[],
  range: StatsRange,
  keys: readonly string[],
): StatsBucket[] {
  const buckets = new Map(keys.map((key) => [key, emptyBucket(key)]));
  for (const session of sessions) {
    const key = bucketKeyOf(range, session.startedAt, session.zoneOffsetSeconds);
    const bucket = buckets.get(key);
    if (bucket !== undefined) {
      buckets.set(key, {
        key,
        sessions: bucket.sessions + 1,
        activeSeconds: bucket.activeSeconds + session.activeSeconds,
        distanceM: bucket.distanceM + session.distanceM,
        steps: bucket.steps + (session.steps ?? 0),
        kcal: bucket.kcal + (session.kcal ?? 0),
        climbM: bucket.climbM + (session.climbM ?? 0),
      });
    }
  }
  return [...buckets.values()];
}

function inWindow(
  sessions: readonly TreadmillSession[],
  window: { readonly from: string; readonly to: string },
): TreadmillSession[] {
  return sessions.filter((session) => {
    const day = sessionDayOf(session.startedAt, session.zoneOffsetSeconds);
    return day >= window.from && day <= window.to;
  });
}

function totalsOf(sessions: readonly TreadmillSession[]): StatsTotals {
  const days = new Set(
    sessions.map((session) => sessionDayOf(session.startedAt, session.zoneOffsetSeconds)),
  );
  return {
    sessions: sessions.length,
    activeSeconds: sessions.reduce((sum, session) => sum + session.activeSeconds, 0),
    distanceM: sessions.reduce((sum, session) => sum + session.distanceM, 0),
    steps: sessions.reduce((sum, session) => sum + (session.steps ?? 0), 0),
    kcal: sessions.reduce((sum, session) => sum + (session.kcal ?? 0), 0),
    climbM: sessions.reduce((sum, session) => sum + (session.climbM ?? 0), 0),
    activeDays: days.size,
  };
}

function percentChange(now: number, before: number): number | null {
  return before === 0 ? null : ((now - before) / before) * 100;
}

function deltaOf(now: StatsTotals, before: StatsTotals): z.infer<typeof STATS_DELTA> {
  return {
    sessions: percentChange(now.sessions, before.sessions),
    activeSeconds: percentChange(now.activeSeconds, before.activeSeconds),
    distanceM: percentChange(now.distanceM, before.distanceM),
    steps: percentChange(now.steps, before.steps),
    kcal: percentChange(now.kcal, before.kcal),
    climbM: percentChange(now.climbM, before.climbM),
  };
}

function dailyDistance(sessions: readonly TreadmillSession[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const session of sessions) {
    const day = sessionDayOf(session.startedAt, session.zoneOffsetSeconds);
    days.set(day, (days.get(day) ?? 0) + session.distanceM);
  }
  return days;
}

function movingAverage(daily: ReadonlyMap<string, number>, endDay: string, length: number): number {
  let sum = 0;
  for (let back = 0; back < length; back += 1) {
    sum += daily.get(addDays(endDay, -back)) ?? 0;
  }
  return sum / length;
}

function lastDayOfBucket(range: StatsRange, key: string, window: { readonly to: string }): string {
  if (range === 'day') {
    return key.slice(0, 10);
  }
  if (range === 'year') {
    const days = daysIn({ from: `${key}-01`, to: window.to }).filter((day) => day.startsWith(key));
    return days.at(-1) ?? window.to;
  }
  return key;
}

function bestOf(
  sessions: readonly TreadmillSession[],
  value: (session: TreadmillSession) => number | null,
): z.infer<typeof BEST> | null {
  let found: z.infer<typeof BEST> | null = null;
  for (const session of sessions) {
    const candidate = value(session);
    if (candidate !== null && candidate > (found?.value ?? 0)) {
      found = { value: candidate, sessionId: session.id, at: session.startedAt };
    }
  }
  return found;
}

function bestsOf(sessions: readonly TreadmillSession[]): StatsBests {
  return {
    longestDistanceM: bestOf(sessions, (session) => session.distanceM),
    longestSeconds: bestOf(sessions, (session) => session.activeSeconds),
    fastestAvgKmh: bestOf(sessions, (session) =>
      session.activeSeconds >= FASTEST_MIN_SECONDS ? session.avgKmh : null,
    ),
    topSpeedKmh: bestOf(sessions, (session) => session.maxKmh),
    mostSteps: bestOf(sessions, (session) => session.steps),
    mostClimbM: bestOf(sessions, (session) => session.climbM),
  };
}

function streakOf(days: ReadonlySet<string>, today: string): { current: number; longest: number } {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    const number = dayNumber(day);
    run = previous !== null && number - previous === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = number;
  }
  const last = sorted.at(-1);
  const alive = last !== undefined && dayNumber(today) - dayNumber(last) <= 1;
  return { current: alive ? run : 0, longest };
}

function levelOf(distanceM: number, peakM: number): number {
  if (distanceM <= 0 || peakM <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((distanceM / peakM) * HEAT_LEVELS)));
}

function heatmapOf(
  daily: ReadonlyMap<string, number>,
  today: string,
): z.infer<typeof STATS_HEAT_DAY>[] {
  const days = Array.from({ length: HEATMAP_DAYS }, (_, index) =>
    addDays(today, index + 1 - HEATMAP_DAYS),
  );
  const peak = Math.max(0, ...days.map((day) => daily.get(day) ?? 0));
  return days.map((day) => {
    const distanceM = daily.get(day) ?? 0;
    return { day, distanceM, level: levelOf(distanceM, peak) };
  });
}

function efficiencyOf(sessions: readonly TreadmillSession[]): z.infer<typeof STATS_EFFICIENCY>[] {
  return sessions.map((session) => ({
    sessionId: session.id,
    at: session.startedAt,
    avgKmh: session.avgKmh,
    cadence:
      session.steps !== null && session.activeSeconds > 0
        ? session.steps / (session.activeSeconds / 60)
        : null,
    strideM: session.steps !== null && session.steps > 0 ? session.distanceM / session.steps : null,
  }));
}

function perSessionOf(
  sessions: readonly TreadmillSession[],
  totals: StatsTotals,
): TreadmillStats['perSession'] {
  const count = Math.max(sessions.length, 1);
  const hours = totals.activeSeconds / 3600;
  return {
    distanceM: totals.distanceM / count,
    activeSeconds: totals.activeSeconds / count,
    avgKmh: hours > 0 ? totals.distanceM / METRES_PER_KM / hours : 0,
    steps: totals.steps / count,
    kcal: totals.kcal / count,
    climbM: totals.climbM / count,
  };
}

function inclineOf(sessions: readonly TreadmillSession[]): z.infer<typeof STATS_INCLINE> {
  const seconds: Record<string, number> = {};
  let weighted = 0;
  let total = 0;
  let max: number | null = null;
  for (const session of sessions) {
    for (const [key, value] of Object.entries(session.inclineSeconds)) {
      seconds[key] = (seconds[key] ?? 0) + value;
    }
    if (session.inclineAvg !== null) {
      weighted += session.inclineAvg * session.activeSeconds;
      total += session.activeSeconds;
    }
    max = session.inclineMax === null ? max : Math.max(max ?? 0, session.inclineMax);
  }
  return { avg: total > 0 ? weighted / total : null, max, seconds };
}

function zonesOf(sessions: readonly TreadmillSession[]): TreadmillStats['zones'] {
  return {
    walk: sessions.reduce((sum, session) => sum + session.zones.walk, 0),
    jog: sessions.reduce((sum, session) => sum + session.zones.jog, 0),
    run: sessions.reduce((sum, session) => sum + session.zones.run, 0),
  };
}

export function periodTotals(
  sessions: readonly TreadmillSession[],
  range: StatsRange,
  anchor: string,
): StatsTotals {
  return totalsOf(inWindow(sessions, windowOf(range, anchor)));
}

export function computeStats(request: StatsRequest): TreadmillStats {
  const { sessions, range, anchor, today } = request;
  const window = windowOf(range, anchor);
  const before = previousWindowOf(range, anchor);
  const current = inWindow(sessions, window);
  const keys = bucketKeysOf(range, window);
  const buckets = bucketsOf(current, range, keys);
  const totals = totalsOf(current);
  const previous = totalsOf(inWindow(sessions, before));
  const daily = dailyDistance(sessions);
  const ends = keys.map((key) => lastDayOfBucket(range, key, window));
  return {
    range,
    from: window.from,
    to: window.to,
    buckets,
    previousBuckets: bucketsOf(inWindow(sessions, before), range, bucketKeysOf(range, before)),
    totals,
    previous,
    delta: deltaOf(totals, previous),
    average7: ends.map((day) => movingAverage(daily, day, AVERAGE_SHORT_DAYS)),
    average30: ends.map((day) => movingAverage(daily, day, AVERAGE_LONG_DAYS)),
    perSession: perSessionOf(current, totals),
    bests: bestsOf(sessions),
    streak: streakOf(new Set(daily.keys()), today),
    heatmap: heatmapOf(daily, today),
    zones: zonesOf(current),
    incline: inclineOf(current),
    efficiency: efficiencyOf(current),
  };
}
