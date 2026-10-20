import type { InclineScale, StatsRange } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { BeltStrip } from '../components/belt-strip';
import { GhostBars } from '../components/ghost-bars';
import { HeatMap } from '../components/heat-map';
import { PersonChip } from '../components/person-chip';
import { BestsShelf, PerSession, SmallMultiples, TotalsGrid } from '../components/stats-cards';
import { TimeAtIncline } from '../components/time-at-incline';
import { ZoneBar } from '../components/zone-bar';
import { useTreadmillState, useTreadmillView } from '../data/treadmill-data';
import { averageLinesOf, RANGE_OPTIONS, type Metric } from '../model/stats-model';
import { streakLine, type StatsView } from '../model/today-model';

const METRICS: readonly { readonly value: Metric; readonly label: string }[] = [
  { value: 'distance', label: 'Distance' },
  { value: 'time', label: 'Time' },
  { value: 'steps', label: 'Steps' },
  { value: 'kcal', label: 'Energy' },
];

const CLIMB_METRIC = { value: 'climb', label: 'Climb' } as const;

const METRIC_UNIT: Readonly<Record<Metric, string>> = {
  climb: 'metres climbed',
  distance: 'kilometres',
  time: 'minutes',
  steps: 'steps',
  kcal: 'kilocalories',
};

function Trend({
  view,
  range,
}: {
  readonly view: StatsView;
  readonly range: StatsRange;
}): ReactNode {
  const [metric, setMetric] = useState<Metric>('distance');
  const { stats } = view;
  const metrics =
    stats.totals.climbM > 0 || stats.previous.climbM > 0 ? [...METRICS, CLIMB_METRIC] : METRICS;
  const averages = averageLinesOf(range, stats, metric);
  const lines =
    averages === null
      ? []
      : [
          { values: averages.short, colour: 'warning' as const },
          { values: averages.long, colour: 'info' as const },
        ];
  return (
    <Card title="Trend" icon="trendUp">
      <View className="gap-3">
        <Segmented label="Measure" options={metrics} value={metric} fill onChange={setMetric} />
        <GhostBars
          buckets={stats.buckets}
          previous={stats.previousBuckets}
          range={range}
          metric={metric}
          label={`${METRIC_UNIT[metric]} per ${range === 'day' ? 'hour' : range === 'year' ? 'month' : 'day'}, with the period before behind`}
          lines={lines}
          colour={metric === 'climb' ? 'viz-violet' : 'primary'}
        />
        <Text variant="caption" tone="faint">
          {lines.length > 0
            ? 'Bars are this period, faint bars the one before. Lines are the 7 and 30 day averages.'
            : 'Bars are this period, faint bars the one before.'}
        </Text>
      </View>
    </Card>
  );
}

function StatsBody({
  view,
  range,
  today,
  scale,
}: {
  readonly view: StatsView;
  readonly range: StatsRange;
  readonly today: string;
  readonly scale: InclineScale;
}): ReactNode {
  const { stats } = view;
  if (stats.totals.sessions === 0 && stats.previous.sessions === 0 && stats.heatmap.length === 0) {
    return (
      <EmptyState
        icon="trendUp"
        title="No numbers yet"
        body="Charts and personal bests fill in after your first walk."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <TotalsGrid stats={stats} />
      <PerSession stats={stats} />
      <Trend view={view} range={range} />
      <Card title="Personal bests" icon="trophy">
        <BestsShelf bests={stats.bests} />
      </Card>
      <Card title="Streak" icon="flame">
        <View className="flex-row items-center gap-2">
          <Icon name="flame" size={24} tone={stats.streak.current > 0 ? 'warning' : 'faint'} />
          <Text variant="body-strong">{streakLine(stats.streak)}</Text>
        </View>
      </Card>
      <Card title="Activity calendar" icon="calendar">
        <HeatMap heatmap={stats.heatmap} today={today} />
      </Card>
      {Object.keys(stats.incline.seconds).length === 0 ? null : (
        <Card title="Time at each incline" icon="trendUp">
          <TimeAtIncline seconds={stats.incline.seconds} scale={scale} />
        </Card>
      )}
      <Card title="Time in each zone" icon="gauge">
        <ZoneBar zones={stats.zones} />
      </Card>
      <SmallMultiples stats={stats} />
    </View>
  );
}

export function StatsSection({ device }: { readonly device: Device }): ReactNode {
  const [range, setRange] = useState<StatsRange>('week');
  const [personId, setPersonId] = useState('');
  const today = useDayKey();
  const scale = useTreadmillState(device.id).data?.inclineScale ?? 'unconfirmed';
  const stats = useTreadmillView(device.id, 'stats', {
    range,
    anchor: today,
    ...(personId === '' ? {} : { personId }),
  });
  return (
    <View className="gap-section-gap">
      <BeltStrip device={device} />
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="min-w-0 flex-1">
          <Segmented label="Range" options={RANGE_OPTIONS} value={range} fill onChange={setRange} />
        </View>
        <PersonChip personId={personId} onChange={setPersonId} />
      </View>
      <LoadedQuery query={stats}>
        {(view) => <StatsBody view={view} range={range} today={today} scale={scale} />}
      </LoadedQuery>
    </View>
  );
}
