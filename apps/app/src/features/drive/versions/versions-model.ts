import type { DriveConflict, DriveItem, DriveVersion, DriveVia } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts/scale';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { clock, dayLabel } from '../../../format/time';
import type { ActivitySeries } from '../activity/via-model';
import type { ByName } from '../folder/folder-model';

export const CURRENT = 'current';

export interface VersionEntry {
  readonly key: string;
  readonly versionId: string | null;
  readonly bytes: number;
  readonly madeAt: string | null;
  readonly keptAt: string | null;
  readonly authorId: string | null;
  readonly via: DriveVia | null;
  readonly deviceId: string | null;
}

type Maker = Pick<VersionEntry, 'madeAt' | 'authorId' | 'via' | 'deviceId'>;

function makerOf(item: DriveItem, byRev: ReadonlyMap<number, DriveVersion>, rev: number): Maker {
  const write = byRev.get(rev - 1);
  if (write !== undefined) {
    return {
      madeAt: write.at,
      authorId: write.actorProfileId,
      via: write.via,
      deviceId: write.deviceId,
    };
  }
  const first = rev === 1;
  return {
    madeAt: first ? item.addedAt : null,
    authorId: first ? item.addedByProfileId : null,
    via: item.outside && rev === item.rev ? 'outside' : null,
    deviceId: null,
  };
}

export function entriesOf(item: DriveItem, versions: readonly DriveVersion[]): VersionEntry[] {
  const byRev = new Map(versions.map((version) => [version.rev, version]));
  const current: VersionEntry = {
    key: CURRENT,
    versionId: null,
    bytes: item.bytes,
    keptAt: null,
    ...makerOf(item, byRev, item.rev),
    madeAt: item.modifiedAt,
  };
  return [
    current,
    ...versions.map((version) => ({
      key: version.id,
      versionId: version.id,
      bytes: version.bytes,
      keptAt: version.at,
      ...makerOf(item, byRev, version.rev),
    })),
  ];
}

export interface VersionPicks {
  readonly a: string;
  readonly b: string | null;
}

export function initialPicks(entries: readonly VersionEntry[]): VersionPicks {
  return { a: CURRENT, b: entries.find((entry) => entry.key !== CURRENT)?.key ?? null };
}

export function pickOf(picks: VersionPicks, key: string): VersionPicks {
  if (key === picks.a) return picks;
  if (key === picks.b) return { a: key, b: picks.a };
  return { a: picks.a, b: key };
}

export function settlePicks(picks: VersionPicks, entries: readonly VersionEntry[]): VersionPicks {
  const keys = new Set(entries.map((entry) => entry.key));
  const a = keys.has(picks.a) ? picks.a : CURRENT;
  if (picks.b !== null && picks.b !== a && keys.has(picks.b)) {
    return a === picks.a ? picks : { a, b: picks.b };
  }
  return { a, b: entries.find((entry) => entry.key !== a)?.key ?? null };
}

export type PickSlot = 'a' | 'b';

export function slotOf(picks: VersionPicks, key: string): PickSlot | null {
  if (key === picks.a) return 'a';
  return key === picks.b ? 'b' : null;
}

export function entryOf(entries: readonly VersionEntry[], key: string | null): VersionEntry | null {
  return key === null ? null : (entries.find((entry) => entry.key === key) ?? null);
}

export interface VersionTotal {
  readonly count: number;
  readonly bytes: number;
}

export function totalOf(entries: readonly VersionEntry[]): VersionTotal {
  return {
    count: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

export function totalText(total: VersionTotal): string {
  return `${plural(total.count, 'version')} · ${bytes(total.bytes)}`;
}

export const SIZE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export function sizePoints(entries: readonly VersionEntry[], now: number): ChartPoint[] {
  const start = now - SIZE_WINDOW_MS;
  return entries
    .flatMap((entry) =>
      entry.madeAt === null ? [] : [{ t: Date.parse(entry.madeAt), v: entry.bytes }],
    )
    .filter((point) => point.t >= start)
    .sort((first, second) => first.t - second.t);
}

export interface Clock {
  readonly now: number;
  readonly zone: string | null;
}

function stamp(at: string, time: Clock): string {
  return `${dayLabel(at, time.now, time.zone)} ${clock(at, time.zone)}`;
}

export function whenOf(entry: VersionEntry, time: Clock): string {
  if (entry.madeAt !== null) return stamp(entry.madeAt, time);
  return entry.keptAt === null ? '' : `Until ${stamp(entry.keptAt, time)}`;
}

export type DeviceName = (deviceId: string) => string | null;

export interface Namers {
  readonly byName: ByName;
  readonly deviceName: DeviceName;
}

function deviceOf(entry: VersionEntry, namers: Namers): string | null {
  return entry.deviceId === null ? null : namers.deviceName(entry.deviceId);
}

const FIXED_BY: Readonly<Partial<Record<DriveVia, string>>> = {
  ai: 'AI',
  automation: 'An automation',
  scan: 'Found by a scan',
  share: 'Someone with a link',
  outside: 'Changed outside SmartEverything',
};

function placeOf(via: DriveVia | null, device: string | null): string | null {
  if (via === 'app') return 'in the app';
  if (via === 'mount') return 'on the mounted drive';
  if (via !== 'sync') return null;
  return device === null ? 'on a synced computer' : `on ${device}`;
}

export function byOf(entry: VersionEntry, namers: Namers): string {
  const fixed = entry.via === null ? undefined : FIXED_BY[entry.via];
  if (fixed !== undefined) return fixed;
  const device = deviceOf(entry, namers);
  const who = namers.byName(entry.authorId) ?? device ?? 'Someone';
  const place = placeOf(entry.via, device);
  return place === null ? who : `${who} ${place}`;
}

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

function personSeries(entry: VersionEntry, me: string | null): ActivitySeries {
  return entry.authorId !== null && entry.authorId === me ? 'you' : 'people';
}

export function seriesOfEntry(entry: VersionEntry, me: string | null): ActivitySeries {
  const fixed = entry.via === null ? null : VIA_SERIES[entry.via];
  return fixed ?? personSeries(entry, me);
}

export function whoSeriesOf(entry: VersionEntry, me: string | null): ActivitySeries {
  const fixed = entry.via === null ? null : VIA_SERIES[entry.via];
  if (fixed !== null && fixed !== 'background') return fixed;
  if (entry.authorId === null) return fixed ?? 'people';
  return personSeries(entry, me);
}

export function captionOf(entry: VersionEntry, namers: Namers, time: Clock): string {
  return joinParts([byOf(entry, namers), whenOf(entry, time), bytes(entry.bytes)]);
}

export function openConflictOf(
  conflicts: readonly DriveConflict[],
  itemId: string,
): DriveConflict | null {
  return (
    conflicts.find((conflict) => conflict.itemId === itemId && conflict.resolvedAt === null) ?? null
  );
}

export interface RestorePlan {
  readonly versionId: string | null;
  readonly primary: boolean;
  readonly footer: string;
}

export const RESTORE_FOOTER = 'Restoring adds a new version. Nothing is overwritten.';

export const CONFLICT_FOOTER =
  'Choose which copy to keep first. Restoring always adds a new version.';

export function restorePlanOf(b: VersionEntry | null, conflicted: boolean): RestorePlan {
  return {
    versionId: b?.versionId ?? null,
    primary: !conflicted,
    footer: conflicted ? CONFLICT_FOOTER : RESTORE_FOOTER,
  };
}

export function downloadableOf(b: VersionEntry | null): boolean {
  return b?.key === CURRENT;
}
