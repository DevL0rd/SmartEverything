import {
  PLANNER_OCCURRENCE_SINGLE,
  parsePlannerRrule,
  type PlannerOccurrenceRow,
  type PlannerRrule,
} from '@smarteverything/domain';
import type { HeatDay } from '../../../components/charts';
import { compareText } from '../../../format/text';
import { daysBetween, localDayKey, shiftDay, startOfDayKey } from '../../../format/time';
import { matchesFilter, type TaskEntry, type TaskFilter } from './task-grouping';

export interface HabitStreak {
  readonly current: number;
  readonly longest: number;
}

const WEEK = 7;
const TOP_LEVEL = 4;

export function occurrenceDayOf(key: string): string | null {
  if (key === PLANNER_OCCURRENCE_SINGLE) return null;
  return key.includes('T') ? localDayKey(key) : key;
}

function byKey(left: PlannerOccurrenceRow, right: PlannerOccurrenceRow): number {
  const leftAt = Date.parse(left.occurrence_key);
  const rightAt = Date.parse(right.occurrence_key);
  return leftAt - rightAt || compareText(left.occurrence_key, right.occurrence_key);
}

export function habitStreakOf(occurrences: readonly PlannerOccurrenceRow[]): HabitStreak {
  let current = 0;
  let longest = 0;
  for (const row of [...occurrences].sort(byKey)) {
    if (occurrenceDayOf(row.occurrence_key) === null || row.status === 'skipped') continue;
    current = row.status === 'done' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { current, longest };
}

export function habitEntriesOf(
  entries: readonly TaskEntry[],
  filter: TaskFilter,
  today: string,
): readonly TaskEntry[] {
  const habit: TaskFilter = { kind: 'smart', list: 'habits' };
  return entries
    .filter(
      (entry) =>
        matchesFilter(entry, habit, today) &&
        (filter.kind === 'smart' || entry.item.collection_id === filter.id),
    )
    .sort(
      (left, right) =>
        left.item.position - right.item.position || compareText(left.item.title, right.item.title),
    );
}

export function occurrencesByItem(
  rows: readonly PlannerOccurrenceRow[],
): ReadonlyMap<string, readonly PlannerOccurrenceRow[]> {
  const grouped = new Map<string, PlannerOccurrenceRow[]>();
  for (const row of rows) {
    const members = grouped.get(row.item_id) ?? [];
    members.push(row);
    grouped.set(row.item_id, members);
  }
  return grouped;
}

function mondayIndexOf(day: string): number {
  return (new Date(startOfDayKey(day)).getDay() + 6) % WEEK;
}

export interface HeatWindow {
  readonly end: string;
  readonly weeks: number;
}

export function heatWindowOf(today: string, weeks: number, back: number): HeatWindow {
  return { end: shiftDay(today, -WEEK * back), weeks: Math.max(1, weeks) };
}

export function heatFirstDayOf(window: HeatWindow): string {
  return shiftDay(window.end, -mondayIndexOf(window.end) - WEEK * (window.weeks - 1));
}

function doneByDay(occurrences: readonly PlannerOccurrenceRow[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of occurrences) {
    const day = occurrenceDayOf(row.occurrence_key);
    if (row.status !== 'done' || day === null) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

export interface HeatInput {
  readonly occurrences: readonly PlannerOccurrenceRow[];
  readonly since: string;
  readonly window: HeatWindow;
}

export function habitHeatOf({ occurrences, since, window }: HeatInput): readonly HeatDay[] {
  const first = heatFirstDayOf(window);
  const counts = doneByDay(occurrences);
  const most = Math.max(1, ...counts.values());
  const length = daysBetween(first, window.end) + 1;
  return Array.from({ length }, (_, index) => {
    const day = shiftDay(first, index);
    const done = counts.get(day) ?? 0;
    return {
      day,
      pages: done,
      level: done === 0 ? 0 : Math.max(1, Math.ceil((done / most) * TOP_LEVEL)),
      covered: day >= since,
    };
  });
}

const WEEKDAY_NAME: Readonly<Record<PlannerRrule['by_day'][number]['weekday'], string>> = {
  SU: 'Sun',
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
};

const WORK_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;

function timesADay(times: number): string {
  if (times <= 1) return 'Every day';
  return times === 2 ? 'Twice a day' : `${String(times)} times a day`;
}

function dailyWords(rule: PlannerRrule): string {
  if (rule.interval > 1) return `Every ${String(rule.interval)} days`;
  return timesADay(rule.by_hour.length);
}

function weeklyWords(rule: PlannerRrule): string {
  const days = rule.by_day.map((entry) => entry.weekday);
  const every = rule.interval > 1 ? `Every ${String(rule.interval)} weeks` : 'Every week';
  if (days.length === 0) return every;
  if (days.length === WEEK) return timesADay(rule.by_hour.length);
  const named =
    days.length === WORK_DAYS.length && WORK_DAYS.every((day) => days.includes(day))
      ? 'Weekdays'
      : days.map((day) => WEEKDAY_NAME[day]).join(', ');
  return rule.interval > 1 ? `${every} on ${named}` : named;
}

const PLAIN_WORDS: Readonly<Partial<Record<PlannerRrule['freq'], string>>> = {
  MONTHLY: 'Every month',
  YEARLY: 'Every year',
  HOURLY: 'Every hour',
};

export function repeatWordsOf(rrule: string): string {
  const parsed = parsePlannerRrule(rrule);
  if (!parsed.success) return 'Repeats';
  const rule = parsed.data;
  if (rule.freq === 'DAILY') return dailyWords(rule);
  if (rule.freq === 'WEEKLY') return weeklyWords(rule);
  return PLAIN_WORDS[rule.freq] ?? 'Repeats';
}

export function streakWordsOf(streak: HabitStreak): string {
  if (streak.current === 0) {
    return streak.longest === 0 ? 'No streak yet' : `Best ${String(streak.longest)} in a row`;
  }
  return `${String(streak.current)} in a row`;
}
