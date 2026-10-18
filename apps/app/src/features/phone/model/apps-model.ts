import type { PhoneDetail } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import { DAY_MS, weekdayShort } from '../../../format/time';

type AppsSection = NonNullable<PhoneDetail['apps']>;

export const MOST_TODAY_APPS = 6;

const DAYS_IN_WEEK = 7;

const NO_USAGE: readonly number[] = Array.from({ length: DAYS_IN_WEEK }, () => 0);

export interface AppRow {
  readonly package: string;
  readonly label: string;
  readonly iconHash: string | null;
  readonly minutesToday: number;
  readonly minutesByDay: readonly number[];
  readonly lastUsedAt: string | null;
}

export interface TodayApp extends AppRow {
  readonly share: number;
}

export interface WeekBar {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

function newest(left: AppRow, right: AppRow): number {
  if (right.minutesToday !== left.minutesToday) return right.minutesToday - left.minutesToday;
  const leftAt = left.lastUsedAt === null ? 0 : Date.parse(left.lastUsedAt);
  const rightAt = right.lastUsedAt === null ? 0 : Date.parse(right.lastUsedAt);
  if (rightAt !== leftAt) return rightAt - leftAt;
  return compareText(left.label, right.label);
}

export function appRowsOf(section: AppsSection): readonly AppRow[] {
  const usage = new Map(section.usage.map((entry) => [entry.package, entry]));
  return section.installed
    .map((app) => {
      const used = usage.get(app.package);
      return {
        package: app.package,
        label: app.label,
        iconHash: app.iconHash,
        minutesToday: used?.minutesToday ?? 0,
        minutesByDay: used?.minutesByDay ?? NO_USAGE,
        lastUsedAt: used?.lastUsedAt ?? null,
      };
    })
    .sort(newest);
}

export function todayAppsOf(rows: readonly AppRow[], most = MOST_TODAY_APPS): readonly TodayApp[] {
  const used = rows.filter((row) => row.minutesToday > 0).slice(0, most);
  const top = used[0]?.minutesToday ?? 1;
  return used.map((row) => ({ ...row, share: row.minutesToday / top }));
}

export function matchingApps(rows: readonly AppRow[], query: string): readonly AppRow[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return rows;
  return rows.filter(
    (row) => row.label.toLowerCase().includes(wanted) || row.package.toLowerCase().includes(wanted),
  );
}

export function weekBarsOf(minutesByDay: readonly number[], now: number): readonly WeekBar[] {
  return minutesByDay.map((value, index) => ({
    key: `day-${String(index)}`,
    label: weekdayShort(now - (minutesByDay.length - 1 - index) * DAY_MS),
    value,
  }));
}

export function todayKeyOf(minutesByDay: readonly number[]): string {
  return `day-${String(minutesByDay.length - 1)}`;
}

export function appSpoken(row: AppRow, lastUsed: string): string {
  return `${row.label}, ${lastUsed}`;
}
