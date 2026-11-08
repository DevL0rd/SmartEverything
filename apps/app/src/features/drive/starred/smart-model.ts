import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { bytes, count } from '../../../format/number';
import { compareText, joinParts, plural } from '../../../format/text';
import { localDayKey, shiftDay } from '../../../format/time';

export const NEW_MATCH_DAYS = 14;

const WEEK_DAYS = 7;

export type SmartFolder = Extract<DriveAlbum, { readonly kind: 'smart' }>;

export interface MatchDay {
  readonly day: string;
  readonly added: number;
}

export interface SmartStats {
  readonly bytes: number | null;
  readonly days: readonly MatchDay[] | null;
  readonly thisWeek: number | null;
}

export interface StatsInput {
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
  readonly today: string;
  readonly timeZone: string | null;
}

export function smartFoldersOf(albums: readonly DriveAlbum[]): readonly SmartFolder[] {
  return albums
    .filter((album): album is SmartFolder => album.kind === 'smart')
    .sort((left, right) => compareText(left.title, right.title));
}

export function matchDaysOf(input: StatsInput): readonly MatchDay[] {
  const first = shiftDay(input.today, 1 - NEW_MATCH_DAYS);
  const added = new Map<string, number>();
  for (const item of input.items) {
    const day = localDayKey(item.addedAt, input.timeZone);
    if (day >= first) added.set(day, (added.get(day) ?? 0) + 1);
  }
  return Array.from({ length: NEW_MATCH_DAYS }, (_, index) => {
    const day = shiftDay(first, index);
    return { day, added: added.get(day) ?? 0 };
  });
}

function sizeOf(item: DriveItem): number {
  return item.kind === 'folder' ? 0 : item.bytes;
}

export function smartStatsOf(input: StatsInput): SmartStats {
  if (!input.complete) return { bytes: null, days: null, thisWeek: null };
  const days = matchDaysOf(input);
  return {
    bytes: input.items.reduce((sum, item) => sum + sizeOf(item), 0),
    days,
    thisWeek: days.slice(-WEEK_DAYS).reduce((sum, day) => sum + day.added, 0),
  };
}

export function matchesText(value: number): string {
  return plural(value, 'file');
}

export function smartCaptionOf(folder: SmartFolder, stats: SmartStats): string {
  return joinParts([
    matchesText(folder.itemCount),
    stats.bytes === null ? null : bytes(stats.bytes),
  ]);
}

export function thisWeekText(stats: SmartStats): string | null {
  return stats.thisWeek === null ? null : `${count(stats.thisWeek)} this week`;
}

export function matchBarsLabel(folder: SmartFolder, stats: SmartStats): string {
  const week = stats.thisWeek ?? 0;
  return `New matches per day for ${folder.title} over the last ${String(NEW_MATCH_DAYS)} days, ${matchesText(week)} this week`;
}

export function smartFolderHref(albumId: string): AppHref {
  return href.drivePage('starred', { smart: albumId });
}
