import type { PlannerStats, PlannerStatsRange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Bars, ProgressBar } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Segmented, type SegmentedOption } from '../../components/segmented';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { dayKeyOf } from '../../format/time';
import { useMinuteOf } from '../../store/clock';
import { usePlannerStats } from '../planner/data';
import {
  timedText,
  timerUseBucketsOf,
  timerUseLabelsOf,
  type TimerUseBucket,
  type TimerUseLabel,
} from './lap-model';

const RANGE_OPTIONS: readonly SegmentedOption<PlannerStatsRange>[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function totalOf(buckets: readonly TimerUseBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.ms, 0);
}

function highlightOf(buckets: readonly TimerUseBucket[], today: string): string | undefined {
  return buckets.findLast((bucket) => bucket.key <= today)?.key;
}

function UseBars({
  stats,
  buckets,
  height,
}: {
  readonly stats: PlannerStats;
  readonly buckets: readonly TimerUseBucket[];
  readonly height: number;
}): ReactNode {
  const today = useMinuteOf(dayKeyOf);
  const highlight = highlightOf(buckets, today);
  const unit = stats.range === 'week' ? 'day' : 'week';
  return (
    <Bars
      bars={buckets.map((bucket) => ({
        key: bucket.key,
        value: bucket.ms / 60_000,
        label: bucket.label,
      }))}
      colour="primary"
      label={`Minutes timed per ${unit} this ${stats.range}`}
      height={height}
      {...(highlight === undefined ? {} : { highlightKey: highlight })}
      formatValue={(minutes) => timedText(minutes * 60_000)}
    />
  );
}

function LabelShare({ entry }: { readonly entry: TimerUseLabel }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
          {entry.label}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {timedText(entry.ms)}
        </Text>
      </View>
      <ProgressBar
        progress={entry.share}
        colour="primary"
        label={`${entry.label}, ${timedText(entry.ms)}`}
      />
    </View>
  );
}

function WideUse({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const buckets = timerUseBucketsOf(stats);
  return (
    <View className="flex-row items-start gap-6">
      <View className="min-w-0 flex-1">
        <UseBars stats={stats} buckets={buckets} height={110} />
      </View>
      <View className="w-56 gap-3">
        <View>
          <Text variant="caption" tone="variant">
            {`Timed this ${stats.range}`}
          </Text>
          <Figure value={timedText(totalOf(buckets))} size="s" />
        </View>
        {timerUseLabelsOf(stats).map((entry) => (
          <LabelShare key={entry.label} entry={entry} />
        ))}
      </View>
    </View>
  );
}

function CompactUse({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const buckets = timerUseBucketsOf(stats);
  return (
    <View className="gap-3">
      <Text variant="caption" tone="variant" className="tabular">
        {`${timedText(totalOf(buckets))} this ${stats.range}`}
      </Text>
      <UseBars stats={stats} buckets={buckets} height={96} />
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {timerUseLabelsOf(stats).map((entry) => (
          <Text key={entry.label} variant="caption" tone="variant" className="tabular">
            {`${entry.label} ${timedText(entry.ms)}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function UseBody({
  range,
  compact,
}: {
  readonly range: PlannerStatsRange;
  readonly compact: boolean;
}): ReactNode {
  const query = usePlannerStats(null, range);
  if (query.data !== undefined) {
    return compact ? <CompactUse stats={query.data} /> : <WideUse stats={query.data} />;
  }
  if (query.isError) {
    return (
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="footnote" tone="variant">
          Couldn’t load timer use.
        </Text>
        <Button
          label="Try again"
          variant="text"
          onPress={() => {
            background(query.refetch(), 'clock.timer_use_refetch_failed');
          }}
        />
      </View>
    );
  }
  return <Skeleton shape="block" />;
}

export function TimerUseCard({ compact }: { readonly compact: boolean }): ReactNode {
  const [range, setRange] = useState<PlannerStatsRange>('week');
  return (
    <Card
      title="Timer use"
      action={
        <Segmented
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          label="Timer use range"
          compact
        />
      }
    >
      <UseBody range={range} compact={compact} />
    </Card>
  );
}
