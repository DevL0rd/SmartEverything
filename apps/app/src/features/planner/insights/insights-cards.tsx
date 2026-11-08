import type { PlannerStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import {
  Bars,
  CalendarHeatmap,
  Donut,
  type DonutSlice,
  type HeatDay,
} from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { MetricStrip } from '../../../components/metric-strip';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { dayKeyOf, shortDate, startOfDayKey } from '../../../format/time';
import { rounded } from '../../../format/number';
import { useMinuteOf } from '../../../store/clock';
import { doneSeriesOf } from '../tasks/tasks-metrics';
import {
  bestDayOf,
  dayBarsOf,
  doneByDayOf,
  heatDaysOf,
  heatSplitOf,
  hourBarsOf,
  hourWindowOf,
  hoursOf,
  loadBarsOf,
  loadBucketsOf,
  peakHourOf,
  rangeDaysOf,
  type LoadBucket,
} from './insights-model';
import { kpisOf } from './summary-model';

const KPI_COLUMNS = { compact: 2, medium: 3, expanded: 5 } as const;
const DONUT_SIZE = 112;

export function KpiStrip({ stats }: { readonly stats: PlannerStats }): ReactNode {
  return <MetricStrip items={kpisOf(stats, doneSeriesOf(stats))} columns={KPI_COLUMNS} />;
}

function Caption({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" className="tabular" numberOfLines={2}>
      {text}
    </Text>
  );
}

function heatCaption(stats: PlannerStats, best: HeatDay | null): string {
  const done = `${String(stats.completion.done)} done`;
  if (best === null) return done;
  return `${done} · best day ${shortDate(startOfDayKey(best.day))} with ${String(best.pages)}`;
}

function DoneChart({
  stats,
  days,
}: {
  readonly stats: PlannerStats;
  readonly days: readonly HeatDay[];
}): ReactNode {
  const today = useMinuteOf(dayKeyOf);
  const { width, onLayout } = useMeasuredWidth();
  const label = `Done per day this ${stats.range}`;
  if (stats.range === 'week') {
    return (
      <Bars
        bars={dayBarsOf(days)}
        colour="primary"
        label={label}
        height={72}
        highlightKey={today}
        formatValue={(value) => `${rounded(value, 0)} done`}
      />
    );
  }
  return (
    <View onLayout={onLayout}>
      {width === 0 ? null : (
        <CalendarHeatmap
          days={days}
          today={today}
          label={label}
          unit="done"
          split={heatSplitOf(days.length, width)}
          weekdays
        />
      )}
    </View>
  );
}

export function DoneHeatCard({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const days = heatDaysOf(rangeDaysOf(stats), doneByDayOf(stats), null);
  return (
    <Card title={`Everything done this ${stats.range}`}>
      <Caption text={heatCaption(stats, bestDayOf(days))} />
      <DoneChart stats={stats} days={days} />
    </Card>
  );
}

export function HoursCard({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const peak = peakHourOf(stats);
  return (
    <Card title="When you get things done">
      <Caption text={peak === null ? 'Nothing done yet' : `Best ${hourWindowOf(peak)}`} />
      <Bars
        bars={hourBarsOf(stats)}
        colour="primary"
        label={
          peak === null ? 'Done by hour, nothing yet' : `Done by hour, best ${hourWindowOf(peak)}`
        }
        height={72}
        {...(peak === null ? {} : { highlightKey: String(peak) })}
        formatValue={(value) => `${rounded(value, 0)} done`}
      />
    </Card>
  );
}

export function CalendarCard({ slices }: { readonly slices: readonly DonutSlice[] }): ReactNode {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Card title="Time by calendar">
      {total === 0 ? (
        <Caption text="No events with a time yet" />
      ) : (
        <Donut slices={slices} size={DONUT_SIZE} label="Time by calendar">
          <Figure value={hoursOf(total)} size="s" />
        </Donut>
      )}
    </Card>
  );
}

function loadCaption(stats: PlannerStats, buckets: readonly LoadBucket[]): string {
  const last = buckets.at(-1);
  const unit = stats.range === 'week' ? 'day' : 'week';
  if (last === undefined) return `Booked hours and tasks done per ${unit}`;
  const now = stats.range === 'week' ? 'today' : 'this week';
  return `Booked hours and tasks done per ${unit} · ${now} ${hoursOf(last.minutes)}, ${String(last.done)} done`;
}

export function LoadCard({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const buckets = loadBucketsOf(stats);
  const last = buckets.at(-1);
  return (
    <Card title={stats.range === 'week' ? 'Daily load' : 'Weekly load'}>
      <Caption text={loadCaption(stats, buckets)} />
      <Bars
        bars={loadBarsOf(buckets)}
        colour="primary"
        label={`Booked hours per ${stats.range === 'week' ? 'day' : 'week'}`}
        height={88}
        {...(last === undefined ? {} : { highlightKey: last.key })}
        formatValue={(value) => hoursOf(value * 60)}
      />
    </Card>
  );
}
