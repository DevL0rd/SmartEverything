import type { PlannerStats, PlannerStatsRange } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { usePlannerCollections, usePlannerStats } from '../data';
import { usePlannerShownPerson } from '../frame/person';
import { PlannerFrame } from '../frame/planner-frame';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { AlarmSummary } from './alarm-summary';
import { ChangeCard } from './change-card';
import { HabitSummary } from './habit-summary';
import { CalendarCard, DoneHeatCard, HoursCard, KpiStrip, LoadCard } from './insights-cards';
import { calendarSlicesOf, hasInsights, rangeLabelOf } from './insights-model';

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
  return <View className={compact ? 'gap-4' : 'flex-row items-start gap-4'}>{children}</View>;
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
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const query = usePlannerStats(usePlannerShownPerson(), range);
  const subtitle = query.data === undefined ? undefined : rangeLabelOf(query.data);
  return (
    <PlannerFrame
      section="insights"
      width="dashboard"
      toolbar={<RangeBar range={range} onRange={setRange} compact={compact} />}
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <QueryBody query={query}>{(stats) => <Insights stats={stats} compact={compact} />}</QueryBody>
    </PlannerFrame>
  );
}
