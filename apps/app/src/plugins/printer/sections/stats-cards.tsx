import type { PrinterStatsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Bars, Donut, StateTimeline } from '../../../components/charts';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { MetricStrip } from '../../../components/metric-strip';
import { RankedList } from '../../../components/ranked-list';
import { Text } from '../../../components/text';
import {
  barsOf,
  gapNote,
  laneSegments,
  splitSlices,
  stateShareSlices,
  streakLine,
  totalsItems,
  type StatsPeriod,
} from '../model/stats-view';

const LANE_COLOURS = {
  idle: 'positive',
  printing: 'primary',
  stopped: 'critical',
  asleep: 'on-surface-faint',
  offline: 'outline',
} as const;

export function Totals({ view }: { readonly view: PrinterStatsView }): ReactNode {
  return <MetricStrip columns={{ compact: 2, medium: 3, expanded: 3 }} items={totalsItems(view)} />;
}

export function Trend({
  view,
  period,
}: {
  readonly view: PrinterStatsView;
  readonly period: StatsPeriod;
}): ReactNode {
  const { stats } = view;
  const note = gapNote(stats.buckets, stats.heatmap.find((day) => day.covered)?.day ?? null);
  return (
    <Card title="Pages printed" icon="trendUp">
      <View className="gap-2">
        <Bars
          bars={barsOf(period, stats.buckets)}
          colour="primary"
          label="Pages printed in each part of the period"
        />
        <Text variant="caption" tone="variant" className="tabular">
          7 day average {String(Math.round(stats.average7.at(-1) ?? 0))} pages · 30 day average{' '}
          {String(Math.round(stats.average30.at(-1) ?? 0))} pages
        </Text>
        {note === null ? null : (
          <Text variant="caption" tone="faint">
            {note}
          </Text>
        )}
      </View>
    </Card>
  );
}

export function Split({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const slices = splitSlices(view);
  return slices.length === 0 ? null : (
    <Card title="Colour and black and white" icon="palette">
      <Donut slices={slices} size={132} label="Colour pages against black and white pages" legend />
    </Card>
  );
}

export function PerJob({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const bars = view.stats.pagesPerJob.map((entry) => ({
    key: entry.label,
    value: entry.jobs,
    label: entry.label,
  }));
  return bars.every((bar) => bar.value === 0) ? null : (
    <Card title="Pages per job" icon="fileText">
      <Bars bars={bars} colour="viz-violet" label="Number of jobs by how many pages they had" />
    </Card>
  );
}

export function People({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const top = Math.max(1, ...view.people.map((person) => person.jobs));
  return view.people.length < 2 ? null : (
    <Card title="Who prints" icon="users">
      <View className="gap-2">
        <Text variant="caption" tone="variant">
          Jobs per person across every recorded job, not only this range.
        </Text>
        <RankedList
          entries={[...view.people]
            .sort((left, right) => right.jobs - left.jobs)
            .map((person) => ({
              key: person.label,
              label: person.mine ? `${person.label} (you)` : person.label,
              value: String(person.jobs),
              share: person.jobs / top,
            }))}
        />
      </View>
    </Card>
  );
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function Bests({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const { stats, bests } = view;
  return (
    <Card title="Personal bests" icon="trophy">
      <View className="gap-2">
        {stats.busiestDay === null ? null : (
          <Text variant="body">
            Busiest day {dayLabel(stats.busiestDay.day)}:{' '}
            {String(Math.round(stats.busiestDay.pages))} pages
          </Text>
        )}
        {bests.biggestJob === null ? null : (
          <Text variant="body">Biggest job: {String(bests.biggestJob)} pages</Text>
        )}
        <View className="flex-row items-center gap-2">
          <Icon name="flame" size={20} tone={stats.printing.current > 0 ? 'warning' : 'faint'} />
          <Text variant="body">
            {streakLine(stats.printing.current, stats.printing.longest, 'printing')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Icon name="leaf" size={20} tone={stats.printFree.current > 0 ? 'positive' : 'faint'} />
          <Text variant="body">
            Print-free: {streakLine(stats.printFree.current, stats.printFree.longest, 'print-free')}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export function StateTime({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const segments = laneSegments(view);
  const slices = stateShareSlices(view);
  return (
    <Card title="What the printer did" icon="activity">
      <View className="gap-3">
        <StateTimeline
          segments={segments}
          colours={LANE_COLOURS}
          label="The last 7 days by printer state"
          empty="No state recorded yet"
        />
        {slices.length === 0 ? null : (
          <Donut slices={slices} size={120} label="Time spent in each printer state" legend />
        )}
      </View>
    </Card>
  );
}

export function Events({ view }: { readonly view: PrinterStatsView }): ReactNode {
  return view.events.length === 0 ? null : (
    <Card title="Recent events" icon="list">
      <View className="gap-2">
        {view.events.slice(0, 20).map((event) => (
          <View key={`${event.at}-${event.kind}`} className="flex-row gap-3">
            <Text variant="caption" tone="faint" className="tabular w-24">
              {new Date(event.at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Text variant="callout" className="min-w-0 flex-1">
              {event.text}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
