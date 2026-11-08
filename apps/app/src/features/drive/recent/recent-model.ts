import type { DriveItem, DriveRecentEntry, DriveRecentFilter } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { VirtualSection } from '../../../components/virtual-list';
import type { ColourRole } from '../../../design/tokens';
import { zonedDateFormat } from '../../../format/locale';
import { count } from '../../../format/number';
import { clock, localDayKey, shiftDay, startOfDayKey } from '../../../format/time';

export const WEEK_DAYS = 7;

export type RecentGroup = 'today' | 'week' | 'earlier';

export const GROUP_TITLE: Readonly<Record<RecentGroup, string>> = {
  today: 'Today',
  week: 'This week',
  earlier: 'Earlier',
};

export interface RecentDays {
  readonly today: string;
  readonly weekStart: string;
  readonly timeZone: string | null;
}

export interface RecentLine {
  readonly key: string;
  readonly entry: DriveRecentEntry;
  readonly group: RecentGroup;
}

export interface RecentDay {
  readonly day: string;
  readonly added: number;
  readonly changed: number;
}

const WEEKDAY = zonedDateFormat({ weekday: 'short' });
const SHORT_DATE = zonedDateFormat({ day: 'numeric', month: 'short' });

export function recentDaysOf(now: number, timeZone: string | null): RecentDays {
  const today = localDayKey(now, timeZone);
  return { today, weekStart: shiftDay(today, 1 - WEEK_DAYS), timeZone };
}

export function groupOf(at: string, days: RecentDays): RecentGroup {
  const day = localDayKey(at, days.timeZone);
  if (day === days.today) return 'today';
  return day >= days.weekStart ? 'week' : 'earlier';
}

export function entryKeyOf(entry: DriveRecentEntry): string {
  return `${entry.kind}\n${entry.item.id}\n${entry.at}`;
}

export function linesOf(entries: readonly DriveRecentEntry[], days: RecentDays): RecentLine[] {
  return entries.map((entry) => ({
    key: entryKeyOf(entry),
    entry,
    group: groupOf(entry.at, days),
  }));
}

export function weekCovered(entries: readonly DriveRecentEntry[], days: RecentDays): boolean {
  const last = entries.at(-1);
  return last !== undefined && groupOf(last.at, days) === 'earlier';
}

function sectionTitle(group: RecentGroup, size: number): string {
  return group === 'earlier' ? GROUP_TITLE[group] : `${GROUP_TITLE[group]} · ${count(size)}`;
}

export function sectionsOf(lines: readonly RecentLine[]): readonly VirtualSection<RecentLine>[] {
  const order: readonly RecentGroup[] = ['today', 'week', 'earlier'];
  return order.flatMap((group) => {
    const data = lines.filter((line) => line.group === group);
    return data.length === 0 ? [] : [{ key: group, title: sectionTitle(group, data.length), data }];
  });
}

export function weekBarsOf(lines: readonly RecentLine[], days: RecentDays): readonly RecentDay[] {
  const keys = Array.from({ length: WEEK_DAYS }, (_, index) => shiftDay(days.weekStart, index));
  return keys.map((day) => {
    const ofDay = lines.filter((line) => localDayKey(line.entry.at, days.timeZone) === day);
    return {
      day,
      added: ofDay.filter((line) => line.entry.kind === 'added').length,
      changed: ofDay.filter((line) => line.entry.kind === 'changed').length,
    };
  });
}

export type ChartFilter = Exclude<DriveRecentFilter, 'opened'>;

export function chartShown(filter: DriveRecentFilter): filter is ChartFilter {
  return filter !== 'opened';
}

export function dayLabelOf(day: string): string {
  return WEEKDAY(null).format(new Date(startOfDayKey(day)));
}

export function timeOf(line: RecentLine, timeZone: string | null): string {
  const at = new Date(line.entry.at);
  if (line.group === 'today') return clock(at, timeZone);
  return line.group === 'week' ? WEEKDAY(timeZone).format(at) : SHORT_DATE(timeZone).format(at);
}

export function whereOf(item: DriveItem, rootLabel: string | null): string {
  const folders = item.relPath.split('/').slice(0, -1);
  return [...(rootLabel === null ? [] : [rootLabel]), ...folders].join(' › ');
}

export function openHrefOf(item: DriveItem): AppHref {
  if (item.kind === 'folder') return href.driveRoot(item.rootId, { folder: item.id });
  return href.driveRoot(
    item.rootId,
    item.parentId === null ? { item: item.id } : { folder: item.parentId, item: item.id },
  );
}

export interface KindLook {
  readonly icon: IconName;
  readonly colour: ColourRole;
}

export const KIND_LOOK: Readonly<Record<DriveItem['kind'], KindLook>> = {
  folder: { icon: 'folder', colour: 'viz-2' },
  image: { icon: 'image', colour: 'viz-1' },
  video: { icon: 'film', colour: 'viz-3' },
  audio: { icon: 'music', colour: 'viz-4' },
  document: { icon: 'fileText', colour: 'viz-6' },
  other: { icon: 'fileText', colour: 'track' },
};
