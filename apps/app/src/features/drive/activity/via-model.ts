import type { DriveFeedOp, DriveFeedRow, DriveVia } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { compareText, plural } from '../../../format/text';
import {
  localDayKey,
  monthShort,
  shiftDay,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';

export interface ActivityEntry {
  readonly row: DriveFeedRow;
  readonly itemName: string;
  readonly folderId: string | null;
  readonly folderPath: string;
  readonly actorName: string | null;
  readonly deviceName: string | null;
}

export interface ActivityViewer {
  readonly me: string | null;
  readonly zone: string | null;
}

export const ACTIVITY_SERIES = [
  'you',
  'people',
  'ai',
  'automation',
  'background',
  'outside',
] as const;

export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

export interface SeriesLook {
  readonly label: string;
  readonly colour: ColourRole;
  readonly fill: string;
}

export const SERIES_LOOK: Readonly<Record<ActivitySeries, SeriesLook>> = {
  you: { label: 'You', colour: 'viz-blue', fill: 'bg-viz-blue' },
  people: { label: 'Other people', colour: 'viz-magenta', fill: 'bg-viz-magenta' },
  ai: { label: 'AI', colour: 'viz-violet', fill: 'bg-viz-violet' },
  automation: { label: 'Automations', colour: 'viz-green', fill: 'bg-viz-green' },
  background: { label: 'Sync, mount and scan', colour: 'track', fill: 'bg-track' },
  outside: { label: 'Outside', colour: 'primary', fill: 'bg-primary' },
};

export interface ViaLook {
  readonly chip: string;
  readonly badge: string;
  readonly icon: IconName;
}

export const VIA_LOOK: Readonly<Record<DriveVia, ViaLook>> = {
  app: { chip: 'App', badge: 'App', icon: 'smartphone' },
  ai: { chip: 'AI', badge: 'AI', icon: 'sparkles' },
  automation: { chip: 'Automations', badge: 'Automation', icon: 'automations' },
  mount: { chip: 'Mount', badge: 'Mount', icon: 'hardDrive' },
  sync: { chip: 'Sync', badge: 'Sync', icon: 'folderSync' },
  scan: { chip: 'Scan', badge: 'Scan', icon: 'search' },
  share: { chip: 'Share', badge: 'Share', icon: 'link' },
  outside: { chip: 'Outside', badge: 'Outside', icon: 'alert' },
};

const VIA_SERIES: Readonly<Record<DriveVia, ActivitySeries | null>> = {
  app: null,
  share: null,
  ai: 'ai',
  automation: 'automation',
  mount: 'background',
  sync: 'background',
  scan: 'background',
  outside: 'outside',
};

export function seriesOf(row: DriveFeedRow, me: string | null): ActivitySeries {
  const fixed = VIA_SERIES[row.via];
  if (fixed !== null) return fixed;
  return row.actorProfileId !== null && row.actorProfileId === me ? 'you' : 'people';
}

const CHANGE_OPS: ReadonlySet<DriveFeedOp> = new Set([
  'create',
  'update',
  'rename',
  'move',
  'trash',
  'restore',
  'delete',
]);

export function isChange(row: DriveFeedRow): boolean {
  return CHANGE_OPS.has(row.op);
}

const VERB: Readonly<Record<DriveFeedOp, { readonly verb: string; readonly after: string }>> = {
  create: { verb: 'added', after: '' },
  update: { verb: 'changed', after: '' },
  rename: { verb: 'renamed', after: '' },
  move: { verb: 'moved', after: '' },
  star: { verb: 'starred', after: '' },
  unstar: { verb: 'unstarred', after: '' },
  trash: { verb: 'moved', after: ' to trash' },
  restore: { verb: 'restored', after: '' },
  delete: { verb: 'deleted', after: '' },
};

const FIXED_SUBJECT: Readonly<Partial<Record<DriveVia, string>>> = {
  ai: 'AI',
  automation: 'An automation',
  scan: 'Scan',
};

export function subjectOf(entry: ActivityEntry, me: string | null): string {
  const { row } = entry;
  const fixed = FIXED_SUBJECT[row.via];
  if (fixed !== undefined) return fixed;
  if (row.actorProfileId !== null && row.actorProfileId === me) return 'You';
  if (entry.actorName !== null) return entry.actorName;
  if (row.via === 'share') return 'Someone with a link';
  return entry.deviceName ?? 'Someone';
}

export function sentenceOf(entry: ActivityEntry, me: string | null): string {
  const { verb, after } = VERB[entry.row.op];
  if (entry.row.via === 'outside') {
    return `${entry.itemName} ${verb}${after} on the disk`;
  }
  return `${subjectOf(entry, me)} ${verb} ${entry.itemName}${after}`;
}

export function badgeOf(entry: ActivityEntry): string {
  const { via } = entry.row;
  const look = VIA_LOOK[via];
  return (via === 'sync' || via === 'mount') && entry.deviceName !== null
    ? `${look.badge} · ${entry.deviceName}`
    : look.badge;
}

export interface ActivityTarget {
  readonly rootId: string;
  readonly folderId: string | null;
  readonly params: Readonly<Record<string, string>>;
}

export function targetOf(entry: ActivityEntry): ActivityTarget {
  const { rootId, itemId } = entry.row;
  return { rootId, folderId: entry.folderId, params: { item: itemId, tab: 'activity' } };
}

export const ACTIVITY_RANGES = ['week', 'month', 'year'] as const;

export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

interface RangeLook {
  readonly label: string;
  readonly phrase: string;
  readonly unit: string;
}

export const RANGE_LOOK: Readonly<Record<ActivityRange, RangeLook>> = {
  week: { label: '7 days', phrase: 'in the last 7 days', unit: 'day' },
  month: { label: '30 days', phrase: 'in the last 30 days', unit: 'day' },
  year: { label: 'Year', phrase: 'in the last year', unit: 'month' },
};

const RANGE_DAYS = { week: 7, month: 30 } as const;
const YEAR_MONTHS = 12;

function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const start = new Date(startOfDayKey(`${month}-01`));
  return monthKeyOf(localDayKey(new Date(start.getFullYear(), start.getMonth() + by, 1)));
}

export function bucketKeysOf(range: ActivityRange, now: number, zone: string | null): string[] {
  const today = localDayKey(now, zone);
  if (range === 'year') {
    const month = monthKeyOf(today);
    return Array.from({ length: YEAR_MONTHS }, (_, index) =>
      shiftMonth(month, index - YEAR_MONTHS + 1),
    );
  }
  const days = RANGE_DAYS[range];
  return Array.from({ length: days }, (_, index) => shiftDay(today, index - days + 1));
}

export function bucketOf(at: string, range: ActivityRange, zone: string | null): string {
  const day = localDayKey(at, zone);
  return range === 'year' ? monthKeyOf(day) : day;
}

export function inRange(
  entries: readonly ActivityEntry[],
  range: ActivityRange,
  viewer: ActivityViewer & { readonly now: number },
): ActivityEntry[] {
  const keys = new Set(bucketKeysOf(range, viewer.now, viewer.zone));
  return entries.filter((entry) => keys.has(bucketOf(entry.row.at, range, viewer.zone)));
}

export type SeriesCounts = Readonly<Record<ActivitySeries, number>>;

export interface ActivityColumn {
  readonly key: string;
  readonly label: string;
  readonly when: string;
  readonly spoken: string;
  readonly counts: SeriesCounts;
  readonly total: number;
}

function emptyCounts(): Record<ActivitySeries, number> {
  return { you: 0, people: 0, ai: 0, automation: 0, background: 0, outside: 0 };
}

function columnLabel(key: string, range: ActivityRange): { label: string; when: string } {
  if (range === 'year') {
    const start = startOfDayKey(`${key}-01`);
    return { label: monthShort(start), when: monthShort(start) };
  }
  const start = startOfDayKey(key);
  const label = range === 'week' ? weekdayShort(start) : String(new Date(start).getDate());
  return { label, when: `${weekdayShort(start)} ${shortDate(start)}` };
}

export function activityColumns(
  entries: readonly ActivityEntry[],
  range: ActivityRange,
  viewer: ActivityViewer & { readonly now: number },
): ActivityColumn[] {
  const keys = bucketKeysOf(range, viewer.now, viewer.zone);
  const tallies = new Map(keys.map((key) => [key, emptyCounts()]));
  for (const entry of entries) {
    if (!isChange(entry.row)) continue;
    const tally = tallies.get(bucketOf(entry.row.at, range, viewer.zone));
    if (tally === undefined) continue;
    tally[seriesOf(entry.row, viewer.me)] += 1;
  }
  return keys.map((key) => {
    const counts = tallies.get(key) ?? emptyCounts();
    const total = ACTIVITY_SERIES.reduce((sum, series) => sum + counts[series], 0);
    const { label, when } = columnLabel(key, range);
    return { key, label, when, spoken: `${when}, ${plural(total, 'change')}`, counts, total };
  });
}

export function busiestOf(columns: readonly ActivityColumn[]): ActivityColumn | null {
  return columns.reduce<ActivityColumn | null>(
    (best, column) => (column.total > (best?.total ?? 0) ? column : best),
    null,
  );
}

export function seriesTotals(columns: readonly ActivityColumn[]): SeriesCounts {
  const totals = emptyCounts();
  for (const column of columns) {
    for (const series of ACTIVITY_SERIES) totals[series] += column.counts[series];
  }
  return totals;
}

export function peopleLabel(entries: readonly ActivityEntry[], me: string | null): string {
  const names = new Set(
    entries.filter((entry) => seriesOf(entry.row, me) === 'people').map((entry) => entry.actorName),
  );
  const [only] = names;
  return names.size === 1 && only !== undefined && only !== null ? only : SERIES_LOOK.people.label;
}

export function chartSummary(
  columns: readonly ActivityColumn[],
  range: ActivityRange,
  labels: Readonly<Record<ActivitySeries, string>>,
): string {
  const totals = seriesTotals(columns);
  const all = ACTIVITY_SERIES.reduce((sum, series) => sum + totals[series], 0);
  const parts = ACTIVITY_SERIES.filter((series) => totals[series] > 0).map(
    (series) => `${labels[series]} ${count(totals[series])}`,
  );
  const head = `Changes per ${RANGE_LOOK[range].unit} ${RANGE_LOOK[range].phrase}, ${plural(all, 'change')}`;
  return parts.length === 0 ? head : `${head}: ${parts.join(', ')}`;
}

export interface FolderCount {
  readonly key: string;
  readonly rootId: string;
  readonly folderId: string | null;
  readonly label: string;
  readonly count: number;
}

export function folderCounts(entries: readonly ActivityEntry[]): FolderCount[] {
  const counted = new Map<string, FolderCount>();
  for (const entry of entries) {
    if (!isChange(entry.row)) continue;
    const key = `${entry.row.rootId}/${entry.folderId ?? ''}`;
    const seen = counted.get(key);
    counted.set(key, {
      key,
      rootId: entry.row.rootId,
      folderId: entry.folderId,
      label: entry.folderPath,
      count: (seen?.count ?? 0) + 1,
    });
  }
  return [...counted.values()].sort(
    (first, second) => second.count - first.count || compareText(first.label, second.label),
  );
}

export interface OutsideSummary {
  readonly count: number;
  readonly folders: readonly FolderCount[];
}

export function outsideOf(entries: readonly ActivityEntry[]): OutsideSummary {
  const outside = entries.filter((entry) => entry.row.via === 'outside' && isChange(entry.row));
  return { count: outside.length, folders: folderCounts(outside) };
}
