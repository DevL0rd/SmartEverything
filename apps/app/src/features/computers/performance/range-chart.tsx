import { useMemo, type ReactNode } from 'react';
import type { ComputerMetric } from '@smarteverything/domain';
import { TimeSeriesChart, type ChartSeries, type YDomain } from '../../../components/charts';
import { LiveSeriesChart, WindowChart, type LiveLine } from '../components/live-series-chart';
import { useMetricSeries } from '../data/computer-history';
import { RANGE_SPAN_MS, type StoredRange, type ViewRange } from '../model/performance';

export interface RangeLine extends LiveLine {
  readonly metric: ComputerMetric | null;
}

export interface RangeChartProps {
  readonly deviceId: string;
  readonly range: ViewRange;
  readonly lines: readonly RangeLine[];
  readonly yDomain: YDomain;
  readonly label: string;
  readonly unit?: string;
  readonly formatValue?: (value: number) => string;
  readonly height?: number;
  readonly offline: boolean;
  readonly stack?: boolean;
}

const STATIC_RANGE: Readonly<Record<'24h' | '30d', '24h' | '30d'>> = { '24h': '24h', '30d': '30d' };

function StaticStored({
  range,
  series,
  chart,
  common,
}: {
  readonly range: '24h' | '30d';
  readonly series: readonly ChartSeries[];
  readonly chart: RangeChartProps;
  readonly common: Pick<RangeChartProps, 'unit' | 'formatValue' | 'height'>;
}): ReactNode {
  return (
    <TimeSeriesChart
      series={series}
      range={STATIC_RANGE[range]}
      label={chart.label}
      {...(chart.yDomain === 'sticky' ? {} : { yDomain: chart.yDomain })}
      {...common}
    />
  );
}

function StoredChart({
  range,
  chart,
}: {
  readonly range: StoredRange;
  readonly chart: RangeChartProps;
}): ReactNode {
  const { deviceId, lines, yDomain, label, unit, formatValue, height, stack } = chart;
  const stored = useMemo(() => lines.filter((line) => line.metric !== null), [lines]);
  const lists = useMetricSeries(
    deviceId,
    stored.flatMap((line) => (line.metric === null ? [] : [line.metric])),
    range,
    true,
  );
  const series = useMemo(
    (): readonly ChartSeries[] =>
      stored.map((line, index) => ({
        label: line.label,
        colour: line.colour,
        points: lists[index] ?? [],
      })),
    [stored, lists],
  );
  const common = {
    ...(unit === undefined ? {} : { unit }),
    ...(formatValue === undefined ? {} : { formatValue }),
    ...(height === undefined ? {} : { height }),
  };
  if (range === '10m') {
    return (
      <WindowChart
        series={series}
        lists={lists}
        spanMs={RANGE_SPAN_MS['10m']}
        yDomain={yDomain}
        label={label}
        offline={chart.offline}
        {...common}
        {...(stack === undefined ? {} : { stack })}
      />
    );
  }
  return <StaticStored range={range} series={series} chart={chart} common={common} />;
}

export function RangeChart(chart: RangeChartProps): ReactNode {
  const { range, deviceId, lines, yDomain, label, unit, formatValue, height, offline, stack } =
    chart;
  if (range === 'live') {
    return (
      <LiveSeriesChart
        deviceId={deviceId}
        lines={lines}
        yDomain={yDomain}
        label={label}
        offline={offline}
        {...(unit === undefined ? {} : { unit })}
        {...(formatValue === undefined ? {} : { formatValue })}
        {...(height === undefined ? {} : { height })}
        {...(stack === undefined ? {} : { stack })}
      />
    );
  }
  return <StoredChart range={range} chart={chart} />;
}
