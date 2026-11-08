import type {
  PhotoInsightKind,
  PhotoInsightRange,
  PhotoInsights,
  PhotoRailCounts,
} from '@smarteverything/domain';
import type { DonutSlice, FillValue } from '../../../components/charts';
import type { MetricItem } from '../../../components/metric-strip';
import type { SegmentedOption } from '../../../components/segmented';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count, percent } from '../../../format/number';
import { monthShort, startOfDayKey } from '../../../format/time';

export function rangeOptions(compact: boolean): readonly SegmentedOption<PhotoInsightRange>[] {
  return [
    { value: 'this_year', label: 'This year' },
    compact
      ? { value: 'last_12_months', label: '12 months', spoken: 'Last 12 months' }
      : { value: 'last_12_months', label: 'Last 12 months' },
    { value: 'all_time', label: 'All time' },
  ];
}

export type InsightsPhase = 'empty' | 'range-empty' | 'shown';

export function phaseOf(insights: PhotoInsights, libraryItems: number | undefined): InsightsPhase {
  if (insights.items > 0) return 'shown';
  return libraryItems === undefined || libraryItems === 0 ? 'empty' : 'range-empty';
}

export function kindItems(insights: PhotoInsights, kind: PhotoInsightKind): number {
  return insights.kinds.find((entry) => entry.kind === kind)?.items ?? 0;
}

export function videoTime(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${count(hours)} h` : `${count(hours)} h ${String(rest).padStart(2, '0')}`;
}

function monthName(month: string): string {
  return monthShort(startOfDayKey(`${month}-01`));
}

export function monthTotals(
  growth: NonNullable<PhotoInsights['growth']>,
): readonly { readonly month: string; readonly bytes: number }[] {
  const totals = new Map<string, number>();
  for (const entry of growth) totals.set(entry.month, (totals.get(entry.month) ?? 0) + entry.bytes);
  return [...totals].map(([month, total]) => ({ month, bytes: total }));
}

export function addedLine(growth: PhotoInsights['growth']): string | undefined {
  if (growth === null) return undefined;
  const totals = monthTotals(growth);
  const last = totals.at(-1);
  const before = totals.at(-2);
  if (last === undefined || before === undefined) return undefined;
  return `+${bytes(Math.max(0, last.bytes - before.bytes))} in ${monthName(last.month)}`;
}

function coverageOf(insights: PhotoInsights): { readonly done: number; readonly total: number } {
  return insights.backupCoverage.reduce(
    (sum, phone) => ({ done: sum.done + phone.backedUp, total: sum.total + phone.total }),
    { done: 0, total: 0 },
  );
}

function phonesText(phones: number): string {
  return phones === 1 ? '1 phone' : `${count(phones)} phones`;
}

export function backedUpItem(insights: PhotoInsights): MetricItem | null {
  const phones = insights.backupCoverage.length;
  if (phones === 0) return null;
  const { done, total } = coverageOf(insights);
  const left = total - done;
  return {
    key: 'backup',
    label: 'Backed up',
    value: percent(total === 0 ? 1 : done / total, done === total ? 0 : 1),
    caption:
      left === 0
        ? `All ${phonesText(phones)} up to date`
        : `${count(left)} left on ${phonesText(phones)}`,
    tone: left === 0 ? 'positive' : 'default',
  };
}

export function favouritesItem(counts: PhotoRailCounts | undefined): MetricItem | null {
  if (counts === undefined) return null;
  return {
    key: 'favourites',
    label: 'Favourites',
    value: percent(counts.timeline === 0 ? 0 : counts.favourites / counts.timeline, 1),
    caption: counts.favourites === 1 ? '1 photo' : `${count(counts.favourites)} photos`,
  };
}

export function countriesText(places: PhotoInsights['places']): string {
  const countries = places.countries.length;
  return countries === 1 ? '1 country' : `${count(countries)} countries`;
}

export function placesLine(places: PhotoInsights['places']): string {
  const named = places.places === 1 ? '1 place' : `${count(places.places)} places`;
  return `${named} · ${countriesText(places)}`;
}

export function statItems(
  insights: PhotoInsights,
  counts: PhotoRailCounts | undefined,
): readonly MetricItem[] {
  const photos = insights.items - kindItems(insights, 'video');
  const added = addedLine(insights.growth);
  const fixed: readonly MetricItem[] = [
    {
      key: 'items',
      label: 'Items',
      value: count(insights.items),
      caption: `${count(photos)} photos · ${count(insights.videoTotals.items)} videos`,
    },
    {
      key: 'size',
      label: 'Library size',
      value: bytes(insights.bytes),
      ...(added === undefined ? {} : { caption: added }),
    },
    {
      key: 'video',
      label: 'Video time',
      value: videoTime(insights.videoTotals.durationMs),
      caption: `${count(insights.videoTotals.items)} videos`,
    },
    {
      key: 'places',
      label: 'Places',
      value: count(insights.places.places),
      caption: countriesText(insights.places),
    },
  ];
  return [...fixed, favouritesItem(counts), backedUpItem(insights)].flatMap((item) =>
    item === null ? [] : [item],
  );
}

interface KindLook {
  readonly label: string;
  readonly colour: ColourRole;
  readonly shade: number;
}

export const KIND_LOOK: Readonly<Record<PhotoInsightKind, KindLook>> = {
  photo: { label: 'Photos', colour: 'viz-1', shade: 1 },
  screenshot: { label: 'Screenshots', colour: 'viz-1', shade: 0.62 },
  raw: { label: 'RAW', colour: 'viz-1', shade: 0.34 },
  video: { label: 'Videos', colour: 'viz-3', shade: 1 },
};

const KIND_ORDER: readonly PhotoInsightKind[] = ['photo', 'video', 'screenshot', 'raw'];

export function kindSlices(insights: PhotoInsights): readonly DonutSlice[] {
  return KIND_ORDER.map((kind) => ({
    key: kind,
    value: kindItems(insights, kind),
    ...KIND_LOOK[kind],
  }));
}

export function photoShare(insights: PhotoInsights): string {
  return percent(insights.items === 0 ? 0 : kindItems(insights, 'photo') / insights.items);
}

export type GrowthGroup = 'photos' | 'videos';

export interface GrowthSeries {
  readonly group: GrowthGroup;
  readonly label: string;
  readonly colour: ColourRole;
  readonly values: readonly FillValue[];
  readonly latest: number;
}

const GROUP_OF: Readonly<Record<PhotoInsightKind, GrowthGroup>> = {
  photo: 'photos',
  screenshot: 'photos',
  raw: 'photos',
  video: 'videos',
};

function seriesOf(
  growth: NonNullable<PhotoInsights['growth']>,
  group: GrowthGroup,
): readonly FillValue[] {
  const totals = new Map<string, number>();
  for (const entry of growth) {
    if (GROUP_OF[entry.kind] === group) {
      totals.set(entry.month, (totals.get(entry.month) ?? 0) + entry.bytes);
    }
  }
  return [...totals].map(([month, value]) => ({ key: month, value }));
}

export function growthSeries(
  growth: NonNullable<PhotoInsights['growth']>,
): readonly GrowthSeries[] {
  return (['photos', 'videos'] as const).map((group) => {
    const values = seriesOf(growth, group);
    return {
      group,
      label: group === 'photos' ? 'Photos' : 'Videos',
      colour: group === 'photos' ? 'viz-1' : 'viz-3',
      values,
      latest: values.at(-1)?.value ?? 0,
    };
  });
}

export function growthTicks(growth: NonNullable<PhotoInsights['growth']>): readonly string[] {
  const months = [...new Set(growth.map((entry) => entry.month))];
  const first = months[0];
  const last = months.at(-1);
  if (first === undefined || last === undefined) return [];
  const label = (month: string): string =>
    first.slice(0, 4) === last.slice(0, 4) ? monthName(month) : month.slice(0, 4);
  const middle = months[Math.floor((months.length - 1) / 2)] ?? first;
  return [...new Set([label(first), label(middle), label(last)])];
}
