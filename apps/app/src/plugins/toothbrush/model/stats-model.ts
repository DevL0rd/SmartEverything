import {
  BRUSH_INTENSITIES,
  BRUSH_MODES,
  dayNumber,
  zoneNamesOf,
  type BrushIntensity,
  type BrushMode,
  type BrushingBucket,
  type BrushingStats,
  type StatsRange,
  type ZoneCount,
} from '@smarteverything/domain';
import { percent } from '../../../format/number';
import type { BadgeTone } from '../../../components/badge';
import type { ColourRole } from '../../../design/tokens';
import { INTENSITY_RAMP, clockText } from './brush-model';

export const RANGE_OPTIONS: readonly { readonly value: StatsRange; readonly label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

const MONTH_LABEL_EVERY = 5;

const HOUR_LABEL_EVERY = 6;

const MINUTE = 60;

export function bucketLabel(range: StatsRange, key: string): string {
  switch (range) {
    case 'day': {
      const hour = Number(key.slice(11, 13));
      return hour % HOUR_LABEL_EVERY === 0 ? String(hour) : '';
    }
    case 'week':
      return WEEKDAYS[(dayNumber(key) + 3) % 7] ?? '';
    case 'month': {
      const day = Number(key.slice(8, 10));
      return day === 1 || day % MONTH_LABEL_EVERY === 0 ? String(day) : '';
    }
    case 'year':
      return MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
  }
}

export function deltaText(delta: number | null): string {
  if (delta === null) {
    return 'New';
  }
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return 'Same';
  }
  return `${rounded > 0 ? '+' : '−'}${String(Math.abs(rounded))}%`;
}

export function deltaTone(delta: number | null): BadgeTone {
  if (delta === null || Math.round(delta) === 0) {
    return 'neutral';
  }
  return delta > 0 ? 'positive' : 'warning';
}

export interface SessionBar {
  readonly key: string;
  readonly label: string;
  readonly morning: number;
  readonly evening: number;
  readonly other: number;
  readonly ghost: number;
}

export interface SessionBars {
  readonly bars: readonly SessionBar[];
  readonly peak: number;
  readonly goal: number;
  readonly average: readonly number[];
}

export function sessionBars(stats: BrushingStats): SessionBars {
  const bars = stats.buckets.map((bucket, index): SessionBar => ({
    key: bucket.key,
    label: bucketLabel(stats.range, bucket.key),
    morning: bucket.morning,
    evening: bucket.evening,
    other: Math.max(0, bucket.sessions - bucket.morning - bucket.evening),
    ghost: stats.previousBuckets[index]?.sessions ?? 0,
  }));
  const goal = stats.range === 'day' || stats.range === 'year' ? 0 : stats.goal.sessionsPerDay;
  const average = stats.range === 'week' || stats.range === 'month' ? stats.average7 : [];
  const peak = Math.max(
    goal,
    1,
    ...bars.map((bar) => bar.morning + bar.evening + bar.other),
    ...bars.map((bar) => bar.ghost),
  );
  return { bars, peak, goal, average };
}

export interface TrendPoint {
  readonly key: string;
  readonly label: string;
  readonly seconds: number | null;
  readonly before: number | null;
}

export interface Trend {
  readonly points: readonly TrendPoint[];
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

function averageOf(bucket: BrushingBucket | undefined): number | null {
  return bucket === undefined || bucket.sessions === 0 ? null : bucket.seconds / bucket.sessions;
}

export function niceMinutes(
  low: number,
  high: number,
): { readonly min: number; readonly max: number; readonly ticks: readonly number[] } {
  const floor = Math.max(0, Math.floor(low / MINUTE));
  const ceil = Math.max(floor + 1, Math.ceil(high / MINUTE));
  const step = Math.max(1, Math.ceil((ceil - floor) / 4));
  const ticks: number[] = [];
  for (let minute = floor; minute < ceil; minute += step) {
    ticks.push(minute * MINUTE);
  }
  ticks.push(ceil * MINUTE);
  return { min: floor * MINUTE, max: ceil * MINUTE, ticks };
}

export function durationTrend(stats: BrushingStats): Trend {
  const points = stats.buckets.map((bucket, index): TrendPoint => ({
    key: bucket.key,
    label: bucketLabel(stats.range, bucket.key),
    seconds: averageOf(bucket),
    before: averageOf(stats.previousBuckets[index]),
  }));
  const values = points
    .flatMap((point) => [point.seconds, point.before])
    .flatMap((value) => (value === null ? [] : [value]));
  const target = stats.goal.minimumSeconds ?? 120;
  const nice = niceMinutes(Math.min(target, ...values), Math.max(target, ...values));
  return { points, ...nice };
}

export interface Donut {
  readonly share: number;
  readonly label: string;
  readonly detail: string;
}

export function completion(stats: BrushingStats): Donut {
  const { totals } = stats;
  return {
    share: stats.completionRate,
    label: totals.sessions === 0 ? 'No sessions' : percent(stats.completionRate),
    detail: `${String(totals.complete)} of ${String(totals.sessions)} brushed the whole routine`,
  };
}

export interface RadialBin {
  readonly hour: number;
  readonly value: number;
  readonly part: 'morning' | 'evening' | 'other';
}

export function radialBins(stats: BrushingStats): readonly RadialBin[] {
  const { goal } = stats;
  const inside = (hour: number, from: number, to: number): boolean =>
    from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  return stats.timeOfDay.map((value, hour): RadialBin => ({
    hour,
    value,
    part: inside(hour, goal.morningFromHour, goal.morningToHour)
      ? 'morning'
      : inside(hour, goal.eveningFromHour, goal.eveningToHour)
        ? 'evening'
        : 'other',
  }));
}

export interface MixSegment {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly share: number;
  readonly colour: ColourRole;
  readonly opacity: number;
}

export function modeMix(
  stats: BrushingStats,
  labels: Readonly<Record<BrushMode, string>>,
  colourOf: (mode: BrushMode) => ColourRole,
): readonly MixSegment[] {
  const total = BRUSH_MODES.reduce((sum, mode) => sum + stats.modeMix[mode], 0);
  return BRUSH_MODES.flatMap((mode) =>
    stats.modeMix[mode] === 0
      ? []
      : [
          {
            key: mode,
            label: labels[mode],
            count: stats.modeMix[mode],
            share: stats.modeMix[mode] / total,
            colour: colourOf(mode),
            opacity: 1,
          },
        ],
  );
}

export function intensityMix(
  stats: BrushingStats,
  labels: Readonly<Record<BrushIntensity, string>>,
): readonly MixSegment[] {
  const total = BRUSH_INTENSITIES.reduce((sum, level) => sum + stats.intensityMix[level], 0);
  return BRUSH_INTENSITIES.flatMap((level) =>
    stats.intensityMix[level] === 0
      ? []
      : [
          {
            key: level,
            label: labels[level],
            count: stats.intensityMix[level],
            share: stats.intensityMix[level] / total,
            colour: 'primary',
            opacity: INTENSITY_RAMP[level],
          },
        ],
  );
}

export interface ZoneBar {
  readonly zone: number;
  readonly name: string;
  readonly seconds: number;
  readonly share: number;
}

export interface ZoneBars {
  readonly bars: readonly ZoneBar[];
  readonly least: string | null;
}

export function zoneBars(stats: BrushingStats, zones: ZoneCount): ZoneBars {
  const names = zoneNamesOf(zones);
  const peak = Math.max(1, ...stats.zoneSeconds);
  const bars = names.map((name, index): ZoneBar => {
    const seconds = stats.zoneSeconds[index] ?? 0;
    return { zone: index + 1, name, seconds, share: seconds / peak };
  });
  const total = bars.reduce((sum, bar) => sum + bar.seconds, 0);
  const least =
    total === 0 ? null : ([...bars].sort((a, b) => a.seconds - b.seconds)[0]?.name ?? null);
  return { bars, least };
}

export interface ExcessPoint {
  readonly key: string;
  readonly label: string;
  readonly share: number | null;
}

export function excessTrend(stats: BrushingStats): readonly ExcessPoint[] {
  return stats.buckets.map((bucket) => ({
    key: bucket.key,
    label: bucketLabel(stats.range, bucket.key),
    share: bucket.pressureSeconds === 0 ? null : bucket.excessSeconds / bucket.pressureSeconds,
  }));
}

export interface RecordLine {
  readonly label: string;
  readonly value: string;
  readonly when: string | null;
}

export function recordsOf(stats: BrushingStats): readonly RecordLine[] {
  const { bests, streak } = stats;
  const found: RecordLine[] = [];
  if (bests.longestSession !== null) {
    found.push({
      label: 'Longest session',
      value: clockText(bests.longestSession.value),
      when: bests.longestSession.at?.slice(0, 10) ?? null,
    });
  }
  if (bests.bestWeek !== null) {
    found.push({
      label: 'Best week',
      value: `${String(bests.bestWeek.value)} brushes`,
      when: bests.bestWeek.day,
    });
  }
  found.push({
    label: 'Best streak',
    value: `${String(bests.longestStreak)} ${bests.longestStreak === 1 ? 'day' : 'days'}`,
    when: null,
  });
  found.push({
    label: 'Streak now',
    value: `${String(streak.current)} ${streak.current === 1 ? 'day' : 'days'}`,
    when: null,
  });
  return found;
}

export interface Kpi {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly delta: number | null;
}

export function kpisOf(stats: BrushingStats): readonly Kpi[] {
  const { totals, delta } = stats;
  return [
    { key: 'sessions', label: 'Brushes', value: String(totals.sessions), delta: delta.sessions },
    {
      key: 'average',
      label: 'Average',
      value: totals.sessions === 0 ? '–' : clockText(stats.averageSeconds),
      delta: delta.averageSeconds,
    },
    {
      key: 'completion',
      label: 'Whole routine',
      value: totals.sessions === 0 ? '–' : percent(stats.completionRate),
      delta: delta.completion,
    },
    { key: 'goal', label: 'Goal days', value: String(totals.goalDays), delta: null },
  ];
}

export function goalDots(stats: BrushingStats): readonly boolean[] {
  return stats.heatmap.slice(-7).map((day) => day.kind === 'goal');
}

export function barsLabel(stats: BrushingStats): string {
  const { totals, goal } = stats;
  const goalText =
    stats.range === 'day' || stats.range === 'year'
      ? ''
      : `, goal ${String(goal.sessionsPerDay)} a day`;
  return `Brushes in this ${stats.range}: ${String(totals.sessions)} in total${goalText}. Morning, evening and other brushes are stacked.`;
}

export function trendLabel(stats: BrushingStats): string {
  const target = stats.goal.minimumSeconds ?? 120;
  return `Average brushing time per brush, target ${clockText(target)}. This period is a line, the period before is faint.`;
}

export function excessLabel(points: readonly ExcessPoint[]): string {
  const known = points.flatMap((point) => (point.share === null ? [] : [point.share]));
  if (known.length === 0) {
    return 'No pressure readings yet';
  }
  const average = known.reduce((sum, share) => sum + share, 0) / known.length;
  return `Time pressing too hard: ${percent(average)} on average over ${String(known.length)} ${known.length === 1 ? 'period' : 'periods'}`;
}
