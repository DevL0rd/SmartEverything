import type {
  PlannerCollectionRow,
  PlannerStats,
  PlannerStatsRange,
} from '@smarteverything/domain';
import type { Bar, DonutSlice, HeatDay } from '../../../components/charts';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import { rounded } from '../../../format/number';
import { clockOfMinutes, shortDate, startOfDayKey, weekdayShort } from '../../../format/time';

const TOP_LEVEL = 4;
const WEEK = 7;
const HEAT_CELL_STEP = 10;
const HEAT_WEEKDAY_WIDTH = 30;
const HOUR_MARKS: ReadonlySet<number> = new Set([0, 6, 12, 18]);

export function hasInsights(stats: PlannerStats): boolean {
  return stats.completion.due > 0 || stats.time_by_calendar.length > 0 || stats.alarms.length > 0;
}

export function shareOf(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

export function doneByDayOf(stats: PlannerStats): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const trend of stats.list_trends) {
    for (const point of trend.points) {
      counts.set(point.day, (counts.get(point.day) ?? 0) + point.done);
    }
  }
  return counts;
}

export function rangeDaysOf(stats: PlannerStats): readonly string[] {
  return stats.weekly_load.map((entry) => entry.day);
}

export function heatLevelOf(value: number, most: number): number {
  if (value <= 0 || most <= 0) return 0;
  return Math.max(1, Math.min(TOP_LEVEL, Math.ceil((value / most) * TOP_LEVEL)));
}

export function heatDaysOf(
  days: readonly string[],
  counts: ReadonlyMap<string, number>,
  since: string | null,
): readonly HeatDay[] {
  const most = Math.max(0, ...days.map((day) => counts.get(day) ?? 0));
  return days.map((day) => {
    const value = counts.get(day) ?? 0;
    return {
      day,
      pages: value,
      level: heatLevelOf(value, most),
      covered: since === null || day >= since,
    };
  });
}

export function heatSplitOf(days: number, width: number): number {
  const columns = Math.ceil(days / WEEK) + 1;
  const needed = columns * HEAT_CELL_STEP + HEAT_WEEKDAY_WIDTH;
  return width <= 0 ? 1 : Math.max(1, Math.ceil(needed / width));
}

export function bestDayOf(days: readonly HeatDay[]): HeatDay | null {
  return days.reduce<HeatDay | null>(
    (best, entry) => (entry.pages > (best?.pages ?? 0) ? entry : best),
    null,
  );
}

export function dayBarsOf(days: readonly HeatDay[]): readonly Bar[] {
  return days.map((entry) => ({
    key: entry.day,
    value: entry.pages,
    label: weekdayShort(startOfDayKey(entry.day)),
  }));
}

export function hourBarsOf(stats: PlannerStats): readonly Bar[] {
  return stats.best_hours.map(({ hour, done }) => ({
    key: String(hour),
    value: done,
    ...(HOUR_MARKS.has(hour) ? { label: String(hour).padStart(2, '0') } : {}),
  }));
}

export function peakHourOf(stats: PlannerStats): number | null {
  const peak = stats.best_hours.reduce<PlannerStats['best_hours'][number] | null>(
    (best, entry) => (entry.done > (best?.done ?? 0) ? entry : best),
    null,
  );
  return peak?.hour ?? null;
}

export function hourWindowOf(hour: number): string {
  return `${clockOfMinutes(hour * 60)} to ${clockOfMinutes((hour + 1) * 60)}`;
}

const OTHER_CALENDAR = 'Other calendar';

export function calendarSlicesOf(
  stats: PlannerStats,
  collections: readonly PlannerCollectionRow[],
): readonly DonutSlice[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  return stats.time_by_calendar.map(({ collection_id: id, minutes }) => {
    const collection = byId.get(id);
    return {
      key: id,
      value: minutes,
      label: collection?.name ?? OTHER_CALENDAR,
      colour: collection === undefined ? 'on-surface-variant' : CALENDAR_COLOUR[collection.colour],
    };
  });
}

export function hoursOf(minutes: number): string {
  return `${rounded(minutes / 60, 1)} h`;
}

export interface LoadBucket {
  readonly key: string;
  readonly label: string;
  readonly minutes: number;
  readonly done: number;
}

export function loadStepOf(range: PlannerStatsRange): number {
  return range === 'week' ? 1 : WEEK;
}

export function chunksFromEnd<T>(entries: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let end = entries.length; end > 0; end -= size) {
    chunks.unshift(entries.slice(Math.max(0, end - size), end));
  }
  return chunks;
}

export function bucketLabel(first: string, step: number): string {
  const at = startOfDayKey(first);
  return step === 1 ? weekdayShort(at) : shortDate(at);
}

export function loadBucketsOf(stats: PlannerStats): readonly LoadBucket[] {
  const step = loadStepOf(stats.range);
  const done = doneByDayOf(stats);
  return chunksFromEnd(stats.weekly_load, step).flatMap((chunk) => {
    const [first] = chunk;
    if (first === undefined) return [];
    return [
      {
        key: first.day,
        label: bucketLabel(first.day, step),
        minutes: chunk.reduce((sum, entry) => sum + entry.scheduled_minutes, 0),
        done: chunk.reduce((sum, entry) => sum + (done.get(entry.day) ?? 0), 0),
      },
    ];
  });
}

export function loadBarsOf(buckets: readonly LoadBucket[]): readonly Bar[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    value: bucket.minutes / 60,
    label: bucket.label,
  }));
}

function yearOf(day: string): string {
  return day.slice(0, 4);
}

export function rangeLabelOf(stats: PlannerStats): string {
  const from = shortDate(startOfDayKey(stats.from));
  const to = shortDate(startOfDayKey(stats.to));
  if (yearOf(stats.from) === yearOf(stats.to)) return `${from} to ${to}`;
  return `${from} ${yearOf(stats.from)} to ${to} ${yearOf(stats.to)}`;
}
