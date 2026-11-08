import type { DriveStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Donut, FillChart, SegmentBar, type DonutSlice } from '../../../components/charts';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';
import { storageSummaryOf } from '../components/drive-frame';
import { KIND_COLOUR, KIND_LABEL } from '../roots/root-card-model';

const DONUT_SIZE = 128;
const MONTHS_IN_YEAR = 12;

type GrowthDays = NonNullable<DriveStats['growth']>;

export interface VolumeName {
  readonly mountId: string;
  readonly name: string;
}

export function kindSlicesOf(stats: DriveStats): readonly DonutSlice[] {
  return stats.kinds
    .filter((kind) => kind.bytes > 0)
    .map((kind) => ({
      key: kind.kind,
      value: kind.bytes,
      colour: KIND_COLOUR[kind.kind],
      label: KIND_LABEL[kind.kind],
    }));
}

export function aboutText(months: number): string {
  if (months < 1) return 'less than a month';
  if (months < MONTHS_IN_YEAR) {
    const whole = Math.round(months);
    return `about ${count(whole)} ${whole === 1 ? 'month' : 'months'}`;
  }
  const years = Math.round(months / MONTHS_IN_YEAR);
  return `about ${count(years)} ${years === 1 ? 'year' : 'years'}`;
}

export function fullInText(stats: DriveStats, names: readonly VolumeName[]): string | null {
  const filling = stats.volumes.flatMap((volume) =>
    volume.fullInMonths === null ? [] : [{ mountId: volume.mountId, months: volume.fullInMonths }],
  );
  const soonest = filling.reduce<(typeof filling)[number] | null>(
    (best, volume) => (best === null || volume.months < best.months ? volume : best),
    null,
  );
  if (soonest === null) return null;
  const when = `${aboutText(soonest.months)} at this pace`;
  if (stats.volumes.length === 1) return `Full in ${when}`;
  const name = names.find((entry) => entry.mountId === soonest.mountId)?.name;
  return name === undefined ? `The first disk is full in ${when}` : `${name} is full in ${when}`;
}

export function growthLabelOf(growth: GrowthDays): string {
  const first = growth[0];
  const last = growth.at(-1);
  if (first === undefined || last === undefined) return 'Used space over time';
  return `Used space from ${bytes(first.bytes)} on ${shortDate(startOfDayKey(first.day))} to ${bytes(last.bytes)} now`;
}

function GrowthChart({
  growth,
  fullIn,
}: {
  readonly growth: GrowthDays;
  readonly fullIn: string | null;
}): ReactNode {
  const first = growth[0];
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap justify-between gap-x-4">
        <Text variant="caption" tone="variant">
          {first === undefined ? 'Used space' : `Used since ${shortDate(startOfDayKey(first.day))}`}
        </Text>
        {fullIn === null ? null : (
          <Text variant="caption" tone="variant">
            {fullIn}
          </Text>
        )}
      </View>
      <View className="h-16">
        <FillChart
          values={growth.map((day) => ({ key: day.day, value: day.bytes }))}
          kind="line"
          colour="primary"
          label={growthLabelOf(growth)}
        />
      </View>
    </View>
  );
}

function GrowthLine({
  stats,
  names,
}: {
  readonly stats: DriveStats;
  readonly names: readonly VolumeName[];
}): ReactNode {
  if (stats.growth === null) {
    return (
      <Text variant="caption" tone="variant">
        Growth shows after two months of history
      </Text>
    );
  }
  return <GrowthChart growth={stats.growth} fullIn={fullInText(stats, names)} />;
}

function Totals({ stats }: { readonly stats: DriveStats }): ReactNode {
  const summary = storageSummaryOf(stats);
  const free = stats.volumes.reduce((all, volume) => all + volume.freeBytes, 0);
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="title-3" numberOfLines={1} className="shrink tabular">
          {summary.used}
        </Text>
        {stats.volumes.length === 0 ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
            {`${bytes(free)} free`}
          </Text>
        )}
      </View>
      <SegmentBar
        segments={summary.segments.filter((segment) => segment.value > 0)}
        label="Used space by kind"
        legend
        format={bytes}
        {...(summary.total === undefined ? {} : { total: summary.total })}
      />
    </View>
  );
}

function KindDonut({ stats }: { readonly stats: DriveStats }): ReactNode {
  return (
    <Donut slices={kindSlicesOf(stats)} size={DONUT_SIZE} label="Used space by kind" legend={false}>
      <Text variant="title-3" className="tabular">
        {bytes(stats.bytes)}
      </Text>
      <Text variant="caption" tone="variant">
        used
      </Text>
    </Donut>
  );
}

export interface StorageHeroProps {
  readonly stats: DriveStats;
  readonly names: readonly VolumeName[];
  readonly wide: boolean;
}

export function StorageHero({ stats, names, wide }: StorageHeroProps): ReactNode {
  return (
    <Card>
      <View className={wide ? 'flex-row items-center gap-6' : 'gap-4'}>
        {wide ? <KindDonut stats={stats} /> : null}
        <View className="min-w-0 flex-1 gap-4">
          <Totals stats={stats} />
          <GrowthLine stats={stats} names={names} />
        </View>
      </View>
    </Card>
  );
}
