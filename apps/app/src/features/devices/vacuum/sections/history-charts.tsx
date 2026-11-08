import type { ReactNode } from 'react';
import type { VacuumCleanSummary } from '@smarteverything/domain';
import { Card } from '../../../../components/card';
import { Bars, TimeSeriesChart, type Bar } from '../../../../components/charts';
import { ErrorState } from '../../../../components/error-state';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import { monthShort, weekdayShort } from '../../../../format/time';
import { useDeviceSeries } from '../../../../queries/history';
import type { Device } from '../../../../store/state';
import { useVacuum } from '../data/use-vacuum';
import type { StatsPeriod, StatsRange } from '../model/stats-period';
import { weeklyOf, type StatsSummary } from '../model/stats-series';

const BATTERY_WINDOW: Readonly<
  Record<StatsRange, { readonly hours: number; readonly range: '7d' | '30d' | 'year' }>
> = {
  week: { hours: 168, range: '7d' },
  month: { hours: 720, range: '30d' },
  year: { hours: 8760, range: 'year' },
};
export function bucketLabelOf(range: StatsRange, startMs: number): string {
  if (range === 'week') {
    return weekdayShort(startMs);
  }
  return range === 'month' ? String(new Date(startMs).getDate()) : monthShort(startMs);
}

export function batteryUsedBars(cleans: readonly VacuumCleanSummary[]): readonly Bar[] {
  return [...cleans]
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
    .flatMap((clean) =>
      clean.batteryStart === null || clean.batteryEnd === null
        ? []
        : [
            {
              key: clean.id,
              value: Math.max(0, clean.batteryStart - clean.batteryEnd),
              label: new Date(clean.startedAt).getDate().toString(),
            },
          ],
    );
}
function BarsCard({
  title,
  caption,
  bars,
  colour,
  label,
  format,
}: {
  readonly title: string;
  readonly caption: string;
  readonly bars: readonly Bar[];
  readonly colour: 'viz-1' | 'viz-2' | 'viz-3';
  readonly label: string;
  readonly format: (value: number) => string;
}): ReactNode {
  return (
    <Card title={title}>
      <Text variant="footnote" tone="variant">
        {caption}
      </Text>
      <Bars bars={bars} colour={colour} label={label} formatValue={format} />
    </Card>
  );
}

function spoken(title: string, period: StatsPeriod, bars: readonly Bar[], unit: string): string {
  return `${title}, ${period.label}: ${bars
    .filter((bar) => bar.value > 0)
    .map((bar) => `${bar.label ?? ''} ${String(Math.round(bar.value))} ${unit}`)
    .join(', ')}`;
}

export function Charts({
  stats,
  period,
  cleans,
}: {
  readonly stats: StatsSummary;
  readonly period: StatsPeriod;
  readonly cleans: readonly VacuumCleanSummary[];
}): ReactNode {
  const labelled = (pick: (bucket: StatsSummary['buckets'][number]) => number): Bar[] =>
    stats.buckets.map((bucket) => ({
      key: String(bucket.startMs),
      value: pick(bucket),
      label: bucketLabelOf(period.range, bucket.startMs),
    }));
  const area = labelled((bucket) => bucket.areaM2);
  const minutes = labelled((bucket) => bucket.seconds / 60);
  const unit = period.range === 'year' ? 'month' : 'day';
  return (
    <>
      <BarsCard
        title={`Area per ${unit}`}
        caption="Square metres cleaned"
        bars={area}
        colour="viz-1"
        label={spoken(`Area per ${unit}`, period, area, 'square metres')}
        format={(value) => `${String(Math.round(value))} m²`}
      />
      <BarsCard
        title={`Time per ${unit}`}
        caption="Minutes the robot worked"
        bars={minutes}
        colour="viz-2"
        label={spoken(`Time per ${unit}`, period, minutes, 'minutes')}
        format={(value) => `${String(Math.round(value))} min`}
      />
      <Weekly period={period} cleans={cleans} />
    </>
  );
}

function Weekly({
  period,
  cleans,
}: {
  readonly period: StatsPeriod;
  readonly cleans: readonly VacuumCleanSummary[];
}): ReactNode {
  const weeks = weeklyOf(cleans, period);
  if (weeks.length < 2) {
    return null;
  }
  const labelOf = (startMs: number): string =>
    `${String(new Date(startMs).getDate())} ${monthShort(startMs)}`;
  const series = (pick: (week: (typeof weeks)[number]) => number): Bar[] =>
    weeks.map((week) => ({
      key: String(week.startMs),
      value: pick(week),
      label: labelOf(week.startMs),
    }));
  return (
    <Card title="Cleans per week">
      <Text variant="footnote" tone="variant">
        Weeks start on Monday
      </Text>
      <Text variant="label" tone="variant">
        Vacuum
      </Text>
      <Bars
        bars={series((week) => week.vacuumCleans)}
        colour="viz-1"
        label={`Vacuum cleans per week, ${period.label}`}
      />
      <Text variant="label" tone="variant">
        Mop
      </Text>
      <Bars
        bars={series((week) => week.mopCleans)}
        colour="viz-2"
        label={`Mop cleans per week, ${period.label}`}
      />
    </Card>
  );
}

function BatteryLive({
  device,
  period,
}: {
  readonly device: Device;
  readonly period: StatsPeriod;
}): ReactNode {
  const { keyOf } = useVacuum(device);
  const key = keyOf('battery');
  const window = BATTERY_WINDOW[period.range];
  const series = useDeviceSeries(device.id, key ?? '', window.hours, key !== undefined);
  if (key === undefined) {
    return null;
  }
  if (series.isPending) {
    return <Skeleton shape="block" className="h-40" />;
  }
  if (series.isError) {
    return <ErrorState error={series.error} />;
  }
  return (
    <TimeSeriesChart
      series={[{ points: series.data, colour: 'viz-3', label: 'Battery' }]}
      range={window.range}
      fit
      height={140}
      unit="%"
      yDomain={[0, 100]}
    />
  );
}

export function Battery({
  device,
  period,
  now,
  cleans,
}: {
  readonly device: Device;
  readonly period: StatsPeriod;
  readonly now: number;
  readonly cleans: readonly VacuumCleanSummary[];
}): ReactNode {
  const used = batteryUsedBars(cleans);
  const current = period.endMs > now;
  return (
    <Card title="Battery">
      {current ? (
        <>
          <Text
            variant="footnote"
            tone="variant"
          >{`Charge over the last ${String(BATTERY_WINDOW[period.range].hours / 24)} days`}</Text>
          <BatteryLive device={device} period={period} />
        </>
      ) : null}
      {used.length === 0 ? null : (
        <>
          <Text variant="footnote" tone="variant">
            Battery used by each clean, percent
          </Text>
          <Bars
            bars={used}
            colour="viz-3"
            label={spoken('Battery used per clean', period, used, 'percent')}
            formatValue={(value) => `${String(Math.round(value))}%`}
          />
        </>
      )}
      {current || used.length > 0 ? null : (
        <Text variant="footnote" tone="variant">
          No battery readings for this period.
        </Text>
      )}
    </Card>
  );
}
