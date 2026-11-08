import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { DriveRoot, DriveShare, DriveStats, DriveSyncClient } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { ChartPoint } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { shiftDay, startOfDayKey } from '../../../format/time';
import { useDayKey, useMinuteOf } from '../../../store/clock';
import { sameJson } from '../../../store/same-json';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveShares, useDriveStats, useDriveSyncClients } from '../../nas/data';
import { libraryLayoutOf, libraryRailWidthOf } from '../../nas/frame/sections';
import { useDriveSyncSummary, type DriveSyncSummary } from '../components/sync-pill';

export const CHANGE_DAYS = 14;

const WEEK_DAYS = 7;

const NO_BREAK_SPACE = ' ';

const TILES = ['files', 'used', 'changes', 'synced', 'links'] as const;

type Growth = NonNullable<DriveStats['growth']>;

export interface LinkCounts {
  readonly active: number;
  readonly more: boolean;
  readonly opens: number;
}

export interface StatInputs {
  readonly stats: DriveStats;
  readonly roots: readonly DriveRoot[];
  readonly clients: readonly DriveSyncClient[];
  readonly sync: DriveSyncSummary | null;
  readonly links: LinkCounts | null;
  readonly today: string;
  readonly stale: boolean;
}

export interface SplitFigure {
  readonly value: string;
  readonly unit?: string;
}

function counted(value: number, one: string): string {
  return `${count(value)} ${value === 1 ? one : `${one}s`}`;
}

export function splitFigure(text: string): SplitFigure {
  const at = text.lastIndexOf(NO_BREAK_SPACE);
  return at < 0 ? { value: text } : { value: text.slice(0, at), unit: text.slice(at + 1) };
}

export function statColumnsOf(area: number): number {
  if (libraryLayoutOf(area) === 'compact') return 2;
  return libraryRailWidthOf(area) === 'wide' ? TILES.length : 3;
}

function lastDays(today: string, days: number): readonly string[] {
  return Array.from({ length: days }, (_, index) => shiftDay(today, index - days + 1));
}

export function changeSeriesOf(growth: Growth, today: string): readonly ChartPoint[] {
  const byDay = new Map(growth.map((day) => [day.day, day.added + day.removed]));
  return lastDays(today, CHANGE_DAYS).map((day) => ({
    t: startOfDayKey(day),
    v: byDay.get(day) ?? 0,
  }));
}

export function addedThisWeek(growth: Growth, today: string): number {
  const week = new Set(lastDays(today, WEEK_DAYS));
  return growth.reduce((all, day) => (week.has(day.day) ? all + day.added : all), 0);
}

export function activeLinksOf(
  shares: readonly DriveShare[],
  more: boolean,
  now: number,
): LinkCounts {
  const active = shares.filter(
    (share) =>
      share.revokedAt === null && (share.expiresAt === null || Date.parse(share.expiresAt) > now),
  );
  return {
    active: active.length,
    more,
    opens: active.reduce((all, share) => all + share.opens, 0),
  };
}

function filesItem({ stats, today }: StatInputs): MetricItem {
  return {
    key: 'files',
    label: 'Files',
    value: count(stats.items),
    caption:
      stats.growth === null
        ? counted(stats.folders, 'folder')
        : `${count(addedThisWeek(stats.growth, today))} added this week`,
  };
}

function usedItem({ stats }: StatInputs): MetricItem {
  const total = stats.volumes.reduce((all, volume) => all + volume.totalBytes, 0);
  return {
    key: 'used',
    label: 'Used',
    ...splitFigure(bytes(stats.bytes)),
    ...(stats.volumes.length === 0
      ? {}
      : { caption: `of ${bytes(total)} on ${plural(stats.volumes.length, 'volume')}` }),
    href: href.drivePage('storage'),
  };
}

function changesItem({ stats, today }: StatInputs): MetricItem | null {
  if (stats.growth === null) return null;
  const series = changeSeriesOf(stats.growth, today);
  return {
    key: 'changes',
    label: 'Changes',
    value: count(series.reduce((all, point) => all + point.v, 0)),
    caption: `in ${String(CHANGE_DAYS)} days`,
    series,
    href: href.drivePage('activity'),
  };
}

function computersOf(clients: readonly DriveSyncClient[]): number {
  return new Set(clients.filter((client) => client.enabled).map((client) => client.deviceId)).size;
}

function syncedItem({ roots, clients, sync }: StatInputs): MetricItem {
  const computers = computersOf(clients);
  const tone = sync?.tone;
  return {
    key: 'synced',
    label: 'Synced folders',
    value: count(roots.filter((root) => root.synced).length),
    ...(computers === 0 ? {} : { unit: `on ${plural(computers, 'computer')}` }),
    caption: sync === null ? 'Not syncing yet' : sync.line,
    ...(tone === 'warning' || tone === 'critical' ? { tone } : {}),
    href: href.drivePage('sync'),
  };
}

function linksItem({ links }: StatInputs): MetricItem | null {
  if (links === null) return null;
  return {
    key: 'links',
    label: 'Share links',
    value: `${count(links.active)}${links.more ? '+' : ''}`,
    unit: 'active',
    caption: counted(links.opens, 'open'),
    href: href.drivePage('shared'),
  };
}

export function statItemsOf(inputs: StatInputs): readonly MetricItem[] {
  return [
    filesItem(inputs),
    usedItem(inputs),
    changesItem(inputs),
    syncedItem(inputs),
    linksItem(inputs),
  ].flatMap((item) => (item === null ? [] : [{ ...item, stale: inputs.stale }]));
}

function useLinkCounts(): LinkCounts | null {
  const query = useDriveShares(null);
  const shares = flattenPages(query.data, (page) => page.items);
  const loaded = query.data !== undefined;
  const more = query.hasNextPage;
  return useMinuteOf((now) => (loaded ? activeLinksOf(shares, more, now) : null), sameJson);
}

function StripSkeleton({ columns }: { readonly columns: number }): ReactNode {
  return (
    <View aria-busy className="flex-row flex-wrap gap-2">
      {TILES.slice(0, columns).map((tile) => (
        <Skeleton key={tile} shape="block" className="h-16 min-w-0 flex-1" />
      ))}
    </View>
  );
}

export function StatStrip({ roots }: { readonly roots: readonly DriveRoot[] }): ReactNode {
  const query = useDriveStats();
  const stats = query.data;
  const clients = useDriveSyncClients();
  const sync = useDriveSyncSummary();
  const links = useLinkCounts();
  const today = useDayKey();
  const stale = useSyncStatus().status !== 'live';
  const columns = statColumnsOf(useAreaWidth());
  if (stats === undefined) {
    return query.isError ? (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.stats_refetch_failed');
        }}
      />
    ) : (
      <StripSkeleton columns={columns} />
    );
  }
  const items = statItemsOf({ stats, roots, clients, sync, links, today, stale });
  return (
    <MetricStrip items={items} columns={{ compact: columns, medium: columns, expanded: columns }} />
  );
}
