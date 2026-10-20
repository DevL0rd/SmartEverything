import {
  dayPartOf,
  localHourOf,
  todayOf,
  type BrushingGoal,
  type BrushingSession,
  type TodayFacts,
} from './brushing-session';
import {
  BRUSHING_AVERAGE_LONG,
  BRUSHING_AVERAGE_SHORT,
  INTENSITY_MIX,
  MODE_MIX,
  type BrushingFaceBucket,
  type BrushingForceBucket,
  type BrushingStats,
} from './brushing-stats-schema';
import {
  averageOf,
  bucketsOf,
  completionOf,
  consistencyOf,
  countedPerDay,
  countsOf,
  deltaOf,
  goalDaySet,
  heatmapOf,
  inWindow,
  lastDayOfBucket,
  longestSessionOf,
  bestWeekOf,
  bucketKey,
  movingAverage,
  streakOf,
  totalsOf,
  zoneTotals,
} from './brushing-periods';
import { BRUSH_INTENSITIES, BRUSH_MODES } from './toothbrush';
import { bucketKeysOf, previousWindowOf, windowOf, type StatsRange } from './treadmill-days';

const SPECIAL_FACE = 2;

export interface BrushingStatsRequest {
  readonly sessions: readonly BrushingSession[];
  readonly goal: BrushingGoal;
  readonly range: StatsRange;
  readonly anchor: string;
  readonly today: string;
}

type Habits = Pick<
  BrushingStats,
  | 'timeOfDay'
  | 'split'
  | 'modeMix'
  | 'intensityMix'
  | 'zoneSeconds'
  | 'excessShare'
  | 'lowPressureShare'
  | 'faces'
  | 'force'
>;

function lowShareOf(current: readonly BrushingSession[]): number | null {
  const measured = current.flatMap((session) =>
    session.pressure?.lowS === undefined ? [] : [session.pressure],
  );
  const seconds = measured.reduce((sum, item) => sum + item.strip.length, 0);
  const low = measured.reduce((sum, item) => sum + (item.lowS ?? 0), 0);
  return seconds === 0 ? null : Math.min(1, low / seconds);
}

function facesOf(
  current: readonly BrushingSession[],
  goal: BrushingGoal,
  range: StatsRange,
  keys: readonly string[],
): BrushingFaceBucket[] | null {
  const faced = current.filter((session) => (session.details?.face ?? 0) > 0);
  if (faced.length === 0) {
    return null;
  }
  return keys.map((key) => {
    const inside = faced.filter((session) => bucketKey(range, goal, session) === key);
    return {
      key,
      sessions: inside.length,
      special: inside.filter((session) => (session.details?.face ?? 0) >= SPECIAL_FACE).length,
    };
  });
}

function forceOf(
  current: readonly BrushingSession[],
  goal: BrushingGoal,
  range: StatsRange,
  keys: readonly string[],
): BrushingForceBucket[] | null {
  const measured = current.filter((session) => session.pressure?.forceAvgN !== undefined);
  if (measured.length === 0) {
    return null;
  }
  return keys.map((key) => {
    const forces = measured
      .filter((session) => bucketKey(range, goal, session) === key)
      .flatMap((session) => (session.pressure === null ? [] : [session.pressure]));
    return {
      key,
      averageN:
        forces.length === 0
          ? null
          : forces.reduce((sum, item) => sum + (item.forceAvgN ?? 0), 0) / forces.length,
      peakN: forces.length === 0 ? null : Math.max(...forces.map((item) => item.forceMaxN ?? 0)),
    };
  });
}

function habitsOf(
  current: readonly BrushingSession[],
  goal: BrushingGoal,
  range: StatsRange,
  keys: readonly string[],
): Habits {
  const parts = current.map((session) => dayPartOf(goal, localHourOf(session)));
  const recorded = current.flatMap((session) =>
    session.pressure === null ? [] : [session.pressure],
  );
  const recordedSeconds = recorded.reduce((sum, item) => sum + item.strip.length, 0);
  const excess = recorded.reduce((sum, item) => sum + item.excessS, 0);
  return {
    timeOfDay: Array.from(
      { length: 24 },
      (_, hour) => current.filter((session) => localHourOf(session) === hour).length,
    ),
    split: {
      morning: parts.filter((part) => part === 'morning').length,
      evening: parts.filter((part) => part === 'evening').length,
      other: parts.filter((part) => part === 'other').length,
    },
    modeMix: MODE_MIX.parse(
      countsOf(
        BRUSH_MODES,
        current.map((session) => session.mode),
      ),
    ),
    intensityMix: INTENSITY_MIX.parse(
      countsOf(
        BRUSH_INTENSITIES,
        current.map((session) => session.intensity),
      ),
    ),
    zoneSeconds: zoneTotals(current),
    excessShare: recordedSeconds === 0 ? null : excess / recordedSeconds,
    lowPressureShare: lowShareOf(current),
    faces: facesOf(current, goal, range, keys),
    force: forceOf(current, goal, range, keys),
  };
}

export function computeBrushingStats(request: BrushingStatsRequest): BrushingStats {
  const { sessions, goal, range, anchor, today } = request;
  const window = windowOf(range, anchor);
  const before = previousWindowOf(range, anchor);
  const current = inWindow(sessions, goal, window);
  const keys = bucketKeysOf(range, window);
  const totals = totalsOf(sessions, goal, window);
  const previous = totalsOf(sessions, goal, before);
  const counted = countedPerDay(sessions, goal);
  const ends = keys.map((key) => lastDayOfBucket(range, key, window));
  const streak = streakOf(goalDaySet(counted, goal), today);
  return {
    range,
    from: window.from,
    to: window.to,
    goal,
    buckets: bucketsOf(current, goal, range, keys),
    previousBuckets: bucketsOf(
      inWindow(sessions, goal, before),
      goal,
      range,
      bucketKeysOf(range, before),
    ),
    totals,
    previous,
    delta: deltaOf(totals, previous),
    average7: ends.map((day) => movingAverage(counted, day, BRUSHING_AVERAGE_SHORT)),
    average30: ends.map((day) => movingAverage(counted, day, BRUSHING_AVERAGE_LONG)),
    averageSeconds: averageOf(totals),
    completionRate: completionOf(totals),
    ...habitsOf(current, goal, range, keys),
    bests: {
      longestSession: longestSessionOf(sessions),
      bestWeek: bestWeekOf(sessions, goal),
      longestStreak: streak.longest,
    },
    streak,
    heatmap: heatmapOf(sessions, goal, today),
    consistency: consistencyOf(totals, window, today),
  };
}

export interface DailyFacts {
  readonly today: TodayFacts;
  readonly streak: { readonly current: number; readonly longest: number };
  readonly lastAt: string | null;
}

export function dailyFactsOf(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  today: string,
): DailyFacts {
  const counted = countedPerDay(sessions, goal);
  const last = sessions.reduce<BrushingSession | null>(
    (latest, session) =>
      latest === null || session.startedAt > latest.startedAt ? session : latest,
    null,
  );
  return {
    today: todayOf(sessions, goal, today),
    streak: streakOf(goalDaySet(counted, goal), today),
    lastAt: last?.startedAt ?? null,
  };
}
