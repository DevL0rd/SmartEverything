import type { PlannerStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { ChartPoint } from '../../../components/charts';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { compareText } from '../../../format/text';
import { daysBetween } from '../../../format/time';
import { usePlannerStats } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { matchesFilter, type TaskEntry, type TaskFilter } from './task-grouping';

const COLUMNS = { compact: 2, medium: 4, expanded: 4 } as const;

export interface OpenFacts {
  readonly open: number;
  readonly byDevice: number;
  readonly overdue: number;
  readonly oldestDays: number;
}

const OVERDUE: TaskFilter = { kind: 'smart', list: 'overdue' };

export function openFactsOf(entries: readonly TaskEntry[], today: string): OpenFacts {
  const open = entries.filter((entry) => entry.open);
  const late = open.filter((entry) => matchesFilter(entry, OVERDUE, today));
  const oldest = late.reduce(
    (most, entry) => Math.max(most, entry.dueDay === null ? 0 : daysBetween(entry.dueDay, today)),
    0,
  );
  return {
    open: open.length,
    byDevice: open.filter((entry) => entry.item.completion.kind === 'signal').length,
    overdue: late.length,
    oldestDays: oldest,
  };
}

export function doneSeriesOf(stats: PlannerStats): readonly ChartPoint[] {
  const byDay = new Map<string, number>();
  for (const trend of stats.list_trends) {
    for (const point of trend.points)
      byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.done);
  }
  return [...byDay.keys()]
    .sort(compareText)
    .map((day, index) => ({ t: index, v: byDay.get(day) ?? 0 }));
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function openItems(facts: OpenFacts): readonly MetricItem[] {
  return [
    {
      key: 'open',
      label: 'Open',
      value: String(facts.open),
      caption:
        facts.byDevice === 0 ? 'none with a device' : `${String(facts.byDevice)} with a device`,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: String(facts.overdue),
      ...(facts.overdue === 0 ? {} : { tone: 'critical' as const }),
      caption:
        facts.overdue === 0
          ? 'nothing late'
          : `oldest ${facts.oldestDays === 0 ? 'today' : plural(facts.oldestDays, 'day', 'days')}`,
    },
  ];
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function doneItems(stats: PlannerStats | undefined): readonly MetricItem[] {
  if (stats === undefined) {
    return [
      { key: 'done', label: 'Done this week', value: '–', stale: true },
      { key: 'devices', label: 'Done by devices', value: '–', stale: true },
    ];
  }
  const { done, due } = stats.completion;
  const { by_device: byDevice, by_hand: byHand } = stats.device_share;
  return [
    {
      key: 'done',
      label: 'Done this week',
      value: String(done),
      caption: `of ${String(due)} due`,
      series: doneSeriesOf(stats),
    },
    {
      key: 'devices',
      label: 'Done by devices',
      value: String(byDevice),
      caption: `${String(percent(byDevice, byDevice + byHand))} % of done`,
    },
  ];
}

export function TasksMetrics({
  entries,
  today,
}: {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
}): ReactNode {
  const { person } = usePlannerFrame();
  const stats = usePlannerStats(person, 'week').data;
  const facts = openFactsOf(entries, today);
  return <MetricStrip items={[...openItems(facts), ...doneItems(stats)]} columns={COLUMNS} />;
}
