import type { PlannerStats, PlannerStatsRange } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { usePlannerCollections, usePlannerStats } from '../data';
import { usePlannerShownPerson } from '../frame/person';
import { PlannerFrame } from '../frame/planner-frame';
import { QueryBody } from '../frame/query-body';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { AlarmSummary } from './alarm-summary';
import { ChangeCard } from './change-card';
import { HabitSummary } from './habit-summary';
import {
  CalendarCard,
  DoneHeatCard,
  HoursCard,
  KpiSkeleton,
  KpiStrip,
  LoadCard,
} from './insights-cards';
import { calendarSlicesOf, hasInsights, rangeLabelOf, rangeSpanOf } from './insights-model';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';

const RANGE_OPTIONS: readonly SegmentedOption<PlannerStatsRange>[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function Pair({
  compact,
  children,
}: {
  readonly compact: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return <View className={compact ? 'gap-4' : 'flex-row items-stretch gap-4'}>{children}</View>;
}

function Cell({
  compact,
  children,
}: {
  readonly compact: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return <View className={cn(!compact && 'min-w-0 flex-1')}>{children}</View>;
}

function Insights({
  stats,
  compact,
}: {
  readonly stats: PlannerStats;
  readonly compact: boolean;
}): ReactNode {
  const slices = calendarSlicesOf(stats, usePlannerCollections(usePlannerShownPerson()));
  if (!hasInsights(stats)) {
    return (
      <EmptyState
        icon="trendUp"
        title="No insights yet"
        body={`Insights fill in as you finish tasks and events this ${stats.range}.`}
      />
    );
  }
  return (
    <View className="gap-4">
      <KpiStrip stats={stats} />
      <DoneHeatCard stats={stats} />
      <Pair compact={compact}>
        <Cell compact={compact}>
          <HoursCard stats={stats} />
        </Cell>
        <Cell compact={compact}>
          <CalendarCard slices={slices} />
        </Cell>
      </Pair>
      <Pair compact={compact}>
        <Cell compact={compact}>
          <LoadCard stats={stats} />
        </Cell>
        <Cell compact={compact}>
          <AlarmSummary stats={stats} />
        </Cell>
      </Pair>
      <Pair compact={compact}>
        <Cell compact={compact}>
          <HabitSummary stats={stats} />
        </Cell>
        <Cell compact={compact}>
          <ChangeCard stats={stats} slices={slices} />
        </Cell>
      </Pair>
    </View>
  );
}

function Loading({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <View className="gap-4">
      <KpiSkeleton />
      <Skeleton shape="tile" />
      {[0, 1].map((row) => (
        <Pair key={row} compact={compact}>
          <Cell compact={compact}>
            <Skeleton shape="tile" />
          </Cell>
          <Cell compact={compact}>
            <Skeleton shape="tile" />
          </Cell>
        </Pair>
      ))}
    </View>
  );
}

function RangeBar({
  range,
  onRange,
  compact,
}: {
  readonly range: PlannerStatsRange;
  readonly onRange: (range: PlannerStatsRange) => void;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className={cn(!compact && 'flex-row')}>
      <Segmented
        options={RANGE_OPTIONS}
        value={range}
        onChange={onRange}
        label="Range"
        compact={compact}
        fill={compact}
      />
    </View>
  );
}

export function InsightsPage(): ReactNode {
  const [range, setRange] = useState<PlannerStatsRange>('week');
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const query = usePlannerStats(usePlannerShownPerson(), range);
  const today = useMinuteOf(dayKeyOf);
  const subtitle = rangeLabelOf(rangeSpanOf(range, today), compact ? 'compact' : 'full');
  return (
    <PlannerFrame
      section="insights"
      toolbar={<RangeBar range={range} onRange={setRange} compact={compact} />}
      subtitle={subtitle}
    >
      {query.data === undefined && !query.isError ? (
        <Loading compact={compact} />
      ) : (
        <QueryBody query={query}>
          {(stats) => <Insights stats={stats} compact={compact} />}
        </QueryBody>
      )}
    </PlannerFrame>
  );
}
