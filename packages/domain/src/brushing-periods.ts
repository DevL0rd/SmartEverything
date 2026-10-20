import type { z } from 'zod';
import {
  countsForGoal,
  dayPartOf,
  goalDayOf,
  localHourOf,
  type BrushingGoal,
  type BrushingSession,
} from './brushing-session';
import {
  BRUSHING_HEATMAP_DAYS,
  SCORE_WEIGHTS,
  SCORE_WEIGHT_TOTAL,
  type BRUSHING_CONSISTENCY,
  type HEAT_KINDS,
  type BRUSHING_DELTA,
  type BRUSHING_HEAT_DAY,
  type BrushingBucket,
  type BrushingTotals,
  type Best,
} from './brushing-stats-schema';
import {
  addDays,
  bucketKeyOf,
  dayNumber,
  daysIn,
  windowOf,
  type DayWindow,
  type StatsRange,
} from './treadmill-days';

export function dayShiftedOffset(goal: BrushingGoal, session: BrushingSession): number {
  return session.zoneOffsetSeconds - goal.eveningToHour * 3600;
}

export function bucketKey(range: StatsRange, goal: BrushingGoal, session: BrushingSession): string {
  if (range === 'day') {
    const hour = String(localHourOf(session)).padStart(2, '0');
    return `${goalDayOf(goal, session)}T${hour}`;
  }
  return bucketKeyOf(range, session.startedAt, dayShiftedOffset(goal, session));
}

export function inWindow(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  window: DayWindow,
): BrushingSession[] {
  return sessions.filter((session) => {
    const day = goalDayOf(goal, session);
    return day >= window.from && day <= window.to;
  });
}

export function emptyBucket(key: string): BrushingBucket {
  return {
    key,
    sessions: 0,
    seconds: 0,
    complete: 0,
    morning: 0,
    evening: 0,
    pressureSeconds: 0,
    excessSeconds: 0,
  };
}

export function bucketsOf(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  range: StatsRange,
  keys: readonly string[],
): BrushingBucket[] {
  const buckets = new Map(keys.map((key) => [key, emptyBucket(key)]));
  for (const session of sessions) {
    const key = bucketKey(range, goal, session);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      continue;
    }
    const part = dayPartOf(goal, localHourOf(session));
    buckets.set(key, {
      key,
      sessions: bucket.sessions + 1,
      seconds: bucket.seconds + session.durationS,
      complete: bucket.complete + (session.complete ? 1 : 0),
      morning: bucket.morning + (part === 'morning' ? 1 : 0),
      evening: bucket.evening + (part === 'evening' ? 1 : 0),
      pressureSeconds: bucket.pressureSeconds + (session.pressure?.strip.length ?? 0),
      excessSeconds: bucket.excessSeconds + (session.pressure?.excessS ?? 0),
    });
  }
  return [...buckets.values()];
}

export function countedPerDay(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
): Map<string, number> {
  const days = new Map<string, number>();
  for (const session of sessions) {
    const day = goalDayOf(goal, session);
    days.set(day, (days.get(day) ?? 0) + (countsForGoal(goal, session) ? 1 : 0));
  }
  return days;
}

export function goalDaySet(counted: ReadonlyMap<string, number>, goal: BrushingGoal): Set<string> {
  return new Set(
    [...counted].flatMap(([day, count]) => (count >= goal.sessionsPerDay ? [day] : [])),
  );
}

export function totalsOf(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  window: DayWindow,
): BrushingTotals {
  const inside = inWindow(sessions, goal, window);
  const counted = countedPerDay(inside, goal);
  const pressure = inside.flatMap((session) =>
    session.pressure === null ? [] : [session.pressure],
  );
  return {
    sessions: inside.length,
    seconds: inside.reduce((sum, session) => sum + session.durationS, 0),
    complete: inside.filter((session) => session.complete).length,
    activeDays: counted.size,
    goalDays: goalDaySet(counted, goal).size,
    pressureSeconds: pressure.reduce((sum, item) => sum + item.strip.length, 0),
    excessSeconds: pressure.reduce((sum, item) => sum + item.excessS, 0),
  };
}

export function percentChange(now: number, before: number): number | null {
  return before === 0 ? null : ((now - before) / before) * 100;
}

export function averageOf(totals: BrushingTotals): number {
  return totals.sessions === 0 ? 0 : totals.seconds / totals.sessions;
}

export function completionOf(totals: BrushingTotals): number {
  return totals.sessions === 0 ? 0 : totals.complete / totals.sessions;
}

export function deltaOf(
  now: BrushingTotals,
  before: BrushingTotals,
): z.infer<typeof BRUSHING_DELTA> {
  return {
    sessions: percentChange(now.sessions, before.sessions),
    seconds: percentChange(now.seconds, before.seconds),
    averageSeconds: percentChange(averageOf(now), averageOf(before)),
    completion: before.sessions === 0 ? null : (completionOf(now) - completionOf(before)) * 100,
  };
}

export function movingAverage(
  counted: ReadonlyMap<string, number>,
  endDay: string,
  length: number,
): number {
  let sum = 0;
  for (let back = 0; back < length; back += 1) {
    sum += counted.get(addDays(endDay, -back)) ?? 0;
  }
  return sum / length;
}

export function lastDayOfBucket(range: StatsRange, key: string, window: DayWindow): string {
  if (range === 'day') {
    return key.slice(0, 10);
  }
  if (range === 'year') {
    return (
      daysIn({ from: `${key}-01`, to: window.to })
        .filter((day) => day.startsWith(key))
        .at(-1) ?? window.to
    );
  }
  return key;
}

export function streakOf(
  days: ReadonlySet<string>,
  today: string,
): { readonly current: number; readonly longest: number } {
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

export function heatmapOf(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  today: string,
): z.infer<typeof BRUSHING_HEAT_DAY>[] {
  const all = new Map<string, number>();
  for (const session of sessions) {
    const day = goalDayOf(goal, session);
    all.set(day, (all.get(day) ?? 0) + 1);
  }
  const counted = countedPerDay(sessions, goal);
  return Array.from({ length: BRUSHING_HEATMAP_DAYS }, (_, index) => {
    const day = addDays(today, index + 1 - BRUSHING_HEATMAP_DAYS);
    const made = all.get(day) ?? 0;
    const full = counted.get(day) ?? 0;
    const kind = heatKindOf(made, full, goal);
    return { day, sessions: made, kind };
  });
}

export function heatKindOf(
  made: number,
  full: number,
  goal: BrushingGoal,
): (typeof HEAT_KINDS)[number] {
  if (made === 0) {
    return 'none';
  }
  if (full >= goal.sessionsPerDay) {
    return 'goal';
  }
  return full > 0 ? 'one' : 'short';
}

export function bestWeekOf(sessions: readonly BrushingSession[], goal: BrushingGoal): Best | null {
  const weeks = new Map<string, number>();
  for (const session of sessions) {
    const day = goalDayOf(goal, session);
    const start = windowOf('week', day).from;
    weeks.set(start, (weeks.get(start) ?? 0) + 1);
  }
  let best: Best | null = null;
  for (const [day, value] of weeks) {
    if (value > (best?.value ?? 0)) {
      best = { value, at: null, day };
    }
  }
  return best;
}

export function longestSessionOf(sessions: readonly BrushingSession[]): Best | null {
  let best: Best | null = null;
  for (const session of sessions) {
    if (session.durationS > (best?.value ?? 0)) {
      best = { value: session.durationS, at: session.startedAt, day: null };
    }
  }
  return best;
}

export function countsOf(
  keys: readonly string[],
  values: readonly (string | null)[],
): Record<string, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) {
    if (value !== null) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

export function zoneTotals(sessions: readonly BrushingSession[]): number[] {
  const width = Math.max(0, ...sessions.map((session) => session.zones.length));
  return Array.from({ length: width }, (_, index) =>
    sessions.reduce((sum, session) => sum + (session.zones[index] ?? 0), 0),
  );
}

export function consistencyOf(
  totals: BrushingTotals,
  window: DayWindow,
  today: string,
): z.infer<typeof BRUSHING_CONSISTENCY> {
  const elapsed = daysIn({ from: window.from, to: window.to < today ? window.to : today }).length;
  const goalRate = elapsed <= 0 ? 0 : Math.min(1, totals.goalDays / elapsed);
  const completionRate = completionOf(totals);
  const pressureRate =
    totals.pressureSeconds === 0 ? null : 1 - totals.excessSeconds / totals.pressureSeconds;
  if (totals.sessions === 0) {
    return { score: null, goalRate, completionRate, pressureRate };
  }
  const parts: [number, number][] = [
    [goalRate, SCORE_WEIGHTS.goal],
    [completionRate, SCORE_WEIGHTS.completion],
  ];
  if (pressureRate !== null) {
    parts.push([pressureRate, SCORE_WEIGHTS.pressure]);
  }
  const weight = parts.reduce((sum, [, share]) => sum + share, 0);
  const earned = parts.reduce((sum, [rate, share]) => sum + rate * share, 0);
  return {
    score: Math.round((earned / weight) * SCORE_WEIGHT_TOTAL),
    goalRate,
    completionRate,
    pressureRate,
  };
}
