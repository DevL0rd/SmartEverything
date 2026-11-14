import type { DriveStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Donut, FillChart, SegmentBar, type DonutSlice } from '../../../components/charts';
import { Text } from '../../../components/text';
import { bytes, count, percent } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';
import { KIND_COLOUR, KIND_LABEL, kindSegmentsOf } from '../model/item-kinds';
import type { DiskView } from './usage-model';

const DONUT_SIZE = 128;
const MONTHS_IN_YEAR = 12;

type GrowthDays = NonNullable<DriveStats['growth']>;

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

export function fullInText(stats: Pick<DriveStats, 'fullInMonths'>): string | null {
  if (stats.fullInMonths === null) return null;
  return `Full in ${aboutText(stats.fullInMonths)} at this pace`;
}

export function growthLabelOf(growth: GrowthDays): string {
  const first = growth[0];
  const last = growth.at(-1);
  if (first === undefined || last === undefined) return 'Used space over time';
  return `Used space from ${bytes(first.bytes)} on ${shortDate(startOfDayKey(first.day))} to ${bytes(last.bytes)} now`;
}

function GrowthChart({ growth }: { readonly growth: GrowthDays }): ReactNode {
  const first = growth[0];
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        {first === undefined ? 'Used space' : `Used since ${shortDate(startOfDayKey(first.day))}`}
      </Text>
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

function Forecast({ stats }: { readonly stats: DriveStats }): ReactNode {
  const fullIn = fullInText(stats);
  return (
    <View className="gap-3">
      {fullIn === null ? null : (
        <Text variant="callout" className="font-sans-medium">
          {fullIn}
        </Text>
      )}
      {stats.growth === null ? (
        <Text variant="caption" tone="variant">
          Growth shows after two months of history
        </Text>
      ) : (
        <GrowthChart growth={stats.growth} />
      )}
    </View>
  );
}

function DiskDonut({ disk }: { readonly disk: DiskView }): ReactNode {
  const used = disk.segments.reduce((all, segment) => all + segment.value, 0);
  const slices = disk.segments
    .filter((segment) => segment.value > 0)
    .map((segment) => ({ key: segment.label, ...segment }));
  return (
    <Donut slices={slices} size={DONUT_SIZE} label="Data folder disk use" legend={false}>
      <Text variant="title-3" className="tabular">
        {percent(disk.total === 0 ? 0 : used / disk.total)}
      </Text>
      <Text variant="caption" tone="variant">
        used
      </Text>
    </Donut>
  );
}

export interface StorageHeroProps {
  readonly stats: DriveStats;
  readonly disk: DiskView;
  readonly wide: boolean;
}

export function StorageHero({ stats, disk, wide }: StorageHeroProps): ReactNode {
  return (
    <Card
      title="Data folder disk"
      icon="server"
      metadata={<Badge label={disk.fsType} icon="hardDrive" />}
    >
      <View className={wide ? 'flex-row items-center gap-6' : 'gap-4'}>
        {wide ? <DiskDonut disk={disk} /> : null}
        <View className="min-w-0 flex-1 gap-4">
          <View className="gap-3">
            <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
              <Text variant="title-3" tone={disk.tone} className="tabular">
                {disk.used}
              </Text>
              <Text variant="footnote" tone="variant" className="tabular">
                {disk.free}
              </Text>
            </View>
            <SegmentBar
              segments={disk.segments}
              total={disk.total}
              label="Data folder disk"
              legend
              format={bytes}
            />
          </View>
          <Forecast stats={stats} />
        </View>
      </View>
    </Card>
  );
}

function KindDonut({ stats }: { readonly stats: DriveStats }): ReactNode {
  return (
    <Donut slices={kindSlicesOf(stats)} size={DONUT_SIZE} label="Used space by kind" legend={false}>
      <Text variant="title-3" className="tabular">
        {bytes(stats.liveBytes)}
      </Text>
      <Text variant="caption" tone="variant">
        in files
      </Text>
    </Donut>
  );
}

export function KindsCard({
  stats,
  wide,
}: {
  readonly stats: DriveStats;
  readonly wide: boolean;
}): ReactNode {
  const segments = kindSegmentsOf(stats.kinds).filter((segment) => segment.value > 0);
  if (segments.length === 0) return null;
  return (
    <Card title="By kind" icon="layers">
      <View className={wide ? 'flex-row items-center gap-6' : 'gap-4'}>
        {wide ? <KindDonut stats={stats} /> : null}
        <View className="min-w-0 flex-1 gap-2">
          <Text variant="footnote" tone="variant">
            The files in your drives and the Shared Drive
          </Text>
          <SegmentBar segments={segments} label="Used space by kind" legend format={bytes} />
        </View>
      </View>
    </Card>
  );
}
