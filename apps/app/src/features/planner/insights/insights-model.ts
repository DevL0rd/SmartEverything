import type {
  PlannerCollectionRow,
  PlannerStats,
  PlannerStatsRange,
} from '@smarteverything/domain';
import type { Bar, ChartPoint, DonutSlice, HeatDay } from '../../../components/charts';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import { rounded } from '../../../format/number';
import {
  clockOfMinutes,
  shiftDay,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';

const TOP_LEVEL = 4;
const WEEK = 7;
const HEAT_CELL_STEP = 10;
const HEAT_WEEKDAY_WIDTH = 30;
const QUIET_FIRST_HOUR = 6;
const QUIET_LAST_HOUR = 23;
const RANGE_DAYS: Readonly<Record<PlannerStatsRange, number>> = { week: 7, month: 30, year: 365 };

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

export const BAR_DAYS_MAX = 31;

export function dayBarsOf(days: readonly HeatDay[]): readonly Bar[] {
  const weekdays = days.length <= WEEK;
  return days.map((entry) => {
    const at = startOfDayKey(entry.day);
    return {
      key: entry.day,
      value: entry.pages,
      label: weekdays ? weekdayShort(at) : shortDate(at),
    };
  });
}

export function habitBarsOf(days: readonly HeatDay[]): readonly Bar[] {
  if (days.length <= WEEK) return dayBarsOf(days);
  return days.map((entry) => ({ key: entry.day, value: entry.pages }));
}

function hourSpanOf(stats: PlannerStats): readonly [number, number] {
  const active = stats.best_hours.filter((entry) => entry.done > 0).map((entry) => entry.hour);
  if (active.length === 0) return [QUIET_FIRST_HOUR, QUIET_LAST_HOUR];
  return [Math.min(...active), Math.max(...active)];
}

export function hourBarsOf(stats: PlannerStats): readonly Bar[] {
  const [first, last] = hourSpanOf(stats);
  const done = new Map(stats.best_hours.map((entry) => [entry.hour, entry.done]));
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const hour = first + index;
    return {
      key: String(hour),
      value: done.get(hour) ?? 0,
      label: String(hour).padStart(2, '0'),
    };
  });
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

function weekdayIndexOf(day: string): number {
  return (new Date(startOfDayKey(day)).getDay() + WEEK - 1) % WEEK;
}

export function bucketsOf<T>(
  entries: readonly T[],
  dayOf: (entry: T) => string,
  range: PlannerStatsRange,
): readonly (readonly T[])[] {
  if (loadStepOf(range) === 1) return entries.map((entry) => [entry]);
  const weeks: T[][] = [];
  for (const entry of entries) {
    const current = weeks.at(-1);
    if (current === undefined || weekdayIndexOf(dayOf(entry)) === 0) weeks.push([entry]);
    else current.push(entry);
  }
  const [first, ...rest] = weeks;
  if (first !== undefined && first.length < WEEK && rest.length > 0) return rest;
  return weeks;
}

export function bucketLabel(first: string, step: number): string {
  const at = startOfDayKey(first);
  return step === 1 ? weekdayShort(at) : shortDate(at);
}

export function loadBucketsOf(stats: PlannerStats): readonly LoadBucket[] {
  const step = loadStepOf(stats.range);
  const done = doneByDayOf(stats);
  return bucketsOf(stats.weekly_load, (entry) => entry.day, stats.range).flatMap((chunk) => {
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

function monthsOf(days: readonly string[]): readonly (readonly string[])[] {
  const months: string[][] = [];
  for (const day of days) {
    const current = months.at(-1);
    if (current?.[0]?.slice(0, 7) === day.slice(0, 7)) current.push(day);
    else months.push([day]);
  }
  const [first, ...rest] = months;
  if (first?.[0]?.endsWith('-01') === false && rest.length > 0) return rest;
  return months;
}

export function doneTrendOf(stats: PlannerStats): readonly ChartPoint[] {
  const done = doneByDayOf(stats);
  const days = rangeDaysOf(stats);
  const chunks =
    stats.range === 'year' ? monthsOf(days) : bucketsOf(days, (day) => day, stats.range);
  return chunks.map((chunk, index) => ({
    t: index,
    v: chunk.reduce((sum, day) => sum + (done.get(day) ?? 0), 0),
  }));
}

export interface RangeSpan {
  readonly from: string;
  readonly to: string;
}

export function rangeSpanOf(range: PlannerStatsRange, today: string): RangeSpan {
  return { from: shiftDay(today, 1 - RANGE_DAYS[range]), to: today };
}

export function rangeLabelOf(span: RangeSpan): string {
  const from = shortDate(startOfDayKey(span.from));
  const to = shortDate(startOfDayKey(span.to));
  if (yearOf(span.from) === yearOf(span.to)) return `${from} to ${to}`;
  return `${from} ${yearOf(span.from)} to ${to} ${yearOf(span.to)}`;
}
