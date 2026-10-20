import type { BottleStats, BottleStatsRange } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { BandChart } from '../charts/band-chart';
import { Heatmap } from '../charts/heatmap';
import { Histogram } from '../charts/histogram';
import { MultipleChart } from '../charts/multiple-chart';
import { RhythmGrid } from '../charts/rhythm-grid';
import { SourceBars } from '../charts/source-bars';
import { BottleStrip } from '../components/bottle-strip';
import { DayDrill } from '../components/day-drill';
import { SourceBar } from '../components/source-bar';
import { useBottleView } from '../data/bottle-data';
import { streakMarkOf } from '../model/calendar-model';
import {
  barsSummary,
  bestsLine,
  chipsOf,
  multiplesOf,
  RANGE_OPTIONS,
  streakLine,
} from '../model/stats-model';

function Chips({ stats }: { readonly stats: BottleStats }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      {chipsOf(stats).map((chip) => (
        <Card key={chip.label} className="min-w-40 flex-1">
          <Text variant="footnote" tone="variant">
            {chip.label}
          </Text>
          <Text variant="title-2" className="tabular">
            {chip.value}
          </Text>
          <Badge label={chip.delta.text} tone={chip.delta.tone} />
        </Card>
      ))}
    </View>
  );
}

function Totals({
  stats,
  range,
}: {
  readonly stats: BottleStats;
  readonly range: BottleStatsRange;
}): ReactNode {
  const averages = range === 'day' || range === 'year' ? null : stats.averages;
  return (
    <Card title="Water per period" icon="trendUp">
      <SourceBars bars={stats.bars} range={range} goalMl={stats.goalMl} averages={averages} />
      <Text variant="footnote" tone="variant">
        {barsSummary(stats.bars, range)}
      </Text>
    </Card>
  );
}

function Habit({ stats }: { readonly stats: BottleStats }): ReactNode {
  const bests = bestsLine(stats.bests);
  return (
    <Card title="Streak and bests" icon="flame">
      <View className="flex-row items-center gap-2">
        <Icon name="flame" size={24} tone={stats.streak.current > 0 ? 'warning' : 'faint'} />
        <Text variant="body-strong">{streakLine(stats.streak)}</Text>
      </View>
      <Text
        variant="footnote"
        tone="variant"
      >{`Longest streak ${String(stats.streak.longest)} days`}</Text>
      {bests.map((best) => (
        <View key={best.label} className="flex-row items-center gap-2">
          <Icon name="trophy" size={20} tone="primary" />
          <Text variant="callout">{`${best.label}: ${best.value}`}</Text>
        </View>
      ))}
    </Card>
  );
}

function Calendar({
  stats,
  deviceId,
}: {
  readonly stats: BottleStats;
  readonly deviceId: string;
}): ReactNode {
  const [day, setDay] = useState<string | null>(null);
  return (
    <Card title="Calendar" icon="calendar">
      <Heatmap
        heatmap={stats.heatmap}
        today={stats.today}
        streak={streakMarkOf(stats.streak, stats.today)}
        onSelect={setDay}
      />
      <Text variant="caption" tone="faint">
        Darker days are closer to the goal. The strong outline is today, the orange outline and
        flame mark the streak. Tap a day to see its drinks.
      </Text>
      <View className="flex-row">
        <Button
          label="Drinks today"
          icon="glassWater"
          variant="tonal"
          onPress={() => {
            setDay(stats.today);
          }}
        />
      </View>
      <DayDrill deviceId={deviceId} heatmap={stats.heatmap} day={day} onDay={setDay} />
    </Card>
  );
}

function Patterns({
  stats,
  deviceId,
}: {
  readonly stats: BottleStats;
  readonly deviceId: string;
}): ReactNode {
  return (
    <>
      <Calendar stats={stats} deviceId={deviceId} />
      <Card title="When you drink" icon="clock">
        <RhythmGrid rhythm={stats.rhythm} />
      </Card>
      <Card title="Drink sizes" icon="glassWater">
        <Histogram sizes={stats.sizes} />
        <Text variant="caption" tone="faint">
          Millilitres per drink. The amber bar holds the median.
        </Text>
      </Card>
    </>
  );
}

function Trends({ stats }: { readonly stats: BottleStats }): ReactNode {
  return (
    <>
      <Card title="Last 30 days" icon="trendUp">
        <View className="gap-4">
          {multiplesOf(stats).map((multiple) => (
            <MultipleChart key={multiple.key} multiple={multiple} />
          ))}
        </View>
      </Card>
      <Card title="First and last drink" icon="clock">
        <BandChart daily={stats.daily} />
      </Card>
      <Card title="Where the water comes from" icon="droplet">
        <SourceBar parts={stats.sources} />
      </Card>
    </>
  );
}

function Body({
  stats,
  range,
  deviceId,
}: {
  readonly stats: BottleStats;
  readonly range: BottleStatsRange;
  readonly deviceId: string;
}): ReactNode {
  if (
    stats.chips.total.value === 0 &&
    stats.chips.total.previous === 0 &&
    stats.heatmap.every((entry) => entry.ml === 0)
  ) {
    return (
      <EmptyState
        icon="trendUp"
        title="No numbers yet"
        body="Charts and personal bests fill in after the first drinks."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Chips stats={stats} />
      <Totals stats={stats} range={range} />
      <Habit stats={stats} />
      <Patterns stats={stats} deviceId={deviceId} />
      <Trends stats={stats} />
    </View>
  );
}

export function StatsSection({ device }: { readonly device: Device }): ReactNode {
  const [range, setRange] = useState<BottleStatsRange>('week');
  const stats = useBottleView(device.id, 'stats', { range });
  return (
    <View className="gap-section-gap">
      <BottleStrip device={device} />
      <Segmented label="Range" options={RANGE_OPTIONS} value={range} fill onChange={setRange} />
      <LoadedQuery query={stats}>
        {(view) => <Body stats={view} range={range} deviceId={device.id} />}
      </LoadedQuery>
    </View>
  );
}
