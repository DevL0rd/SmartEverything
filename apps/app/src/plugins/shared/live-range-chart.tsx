import type { ReactNode } from 'react';
import { TimeSeriesChart, type ChartSeries } from '../../components/charts';
import { RING_SPAN_MS } from '../../store/computer-rings';

interface LiveRangeChartProps {
  readonly label: string;
  readonly series: readonly ChartSeries[];
  readonly unit?: string;
  readonly formatValue?: (value: number) => string;
  readonly height?: number;
  readonly stack?: boolean;
}

function newestOf(series: readonly ChartSeries[]): number {
  return series.reduce((newest, line) => Math.max(newest, line.points.at(-1)?.t ?? 0), 0);
}

export function LiveRangeChart({
  label,
  series,
  unit,
  formatValue,
  height,
  stack = false,
}: LiveRangeChartProps): ReactNode {
  return (
    <TimeSeriesChart
      label={label}
      series={series}
      window={{ spanMs: RING_SPAN_MS, now: newestOf(series) }}
      yDomain="sticky"
      stack={stack}
      {...(unit === undefined ? {} : { unit })}
      {...(formatValue === undefined ? {} : { formatValue })}
      {...(height === undefined ? {} : { height })}
    />
  );
}
