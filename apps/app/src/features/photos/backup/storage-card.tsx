import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveStats, PhotoInsights } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { SegmentBar } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { useDriveStats } from '../../drive';
import { usePhotoInsights } from '../data';
import { GrowthChart } from './growth-chart';
import { growthTextOf, monthlyGrowthOf, storageOf } from './stats-model';

type GrowthDays = NonNullable<DriveStats['growth']>;

function GrowthBlock({
  growth,
  text,
}: {
  readonly growth: GrowthDays;
  readonly text: string | null;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        Growth
      </Text>
      <GrowthChart
        days={growth}
        perMonth={monthlyGrowthOf(growth)}
        label={text ?? 'Library size over time'}
      />
      {text === null ? null : (
        <Text variant="caption" tone="variant">
          {text}
        </Text>
      )}
    </View>
  );
}

function Growth({ stats }: { readonly stats: DriveStats }): ReactNode {
  const now = useMinute();
  if (stats.growth === null) {
    return (
      <Text variant="caption" tone="variant">
        Growth shows after two months of history
      </Text>
    );
  }
  return <GrowthBlock growth={stats.growth} text={growthTextOf(stats, now)} />;
}

function StorageBody({
  stats,
  insights,
}: {
  readonly stats: DriveStats;
  readonly insights: PhotoInsights;
}): ReactNode {
  const view = storageOf(stats, insights);
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline gap-2">
        <Text variant="title-3" className="tabular-nums">
          {bytes(view.libraryBytes)}
        </Text>
        <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
          library
        </Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {`${bytes(view.freeBytes)} free`}
        </Text>
      </View>
      <SegmentBar
        segments={view.segments}
        label="Hub disk use by kind"
        size="thick"
        legend
        format={bytes}
        total={view.totalBytes}
      />
      <View className="border-t border-outline-variant pt-3">
        <Growth stats={stats} />
      </View>
    </View>
  );
}

export function StorageCard(): ReactNode {
  const stats = useDriveStats().data;
  const insights = usePhotoInsights('all_time').data;
  const total = stats?.space.totalBytes ?? 0;
  return (
    <Card
      title="Storage use"
      metadata={
        total === 0 ? null : (
          <Text variant="caption" tone="variant" className="tabular-nums">
            {`Hub disk · ${bytes(total)}`}
          </Text>
        )
      }
    >
      {stats === undefined || insights === undefined ? (
        <Skeleton shape="block" />
      ) : (
        <StorageBody stats={stats} insights={insights} />
      )}
    </Card>
  );
}
