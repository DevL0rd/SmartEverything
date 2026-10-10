import { withRole, type HistoryRow, type PresentedCapability } from '@smarteverything/domain';
import { type UseQueryResult } from '@tanstack/react-query';
import type { PreloadContext } from '../../../app-shell/route-types';
import type { ChartPoint, ChartSeries } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { readHistory } from '../../../queries/history';
import { historyKey } from '../../../queries/keys';
import type { ClimateSource } from '../model/climate-devices';
import { useScreenQuery } from '../../../queries/use-screen-query';

export const AIR_METRICS = ['pm25', 'pm10', 'temperature', 'humidity', 'co2'] as const;

export type AirMetric = (typeof AIR_METRICS)[number];

export const AIR_RANGES = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 d' },
  { value: '30d', label: '30 d' },
] as const;

export type AirRange = (typeof AIR_RANGES)[number]['value'];

const AIR_RANGE_HOURS: Readonly<Record<AirRange, number>> = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
};

const METRIC_COLOUR: Readonly<Record<AirMetric, ColourRole>> = {
  pm25: 'viz-1',
  pm10: 'viz-3',
  temperature: 'temp-warm',
  humidity: 'humidity',
  co2: 'viz-5',
};

const SERIES_COLOURS: readonly ColourRole[] = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
];

const HOUR_MS = 3_600_000;

function historyQuery(
  capabilities: readonly string[],
  hours: number,
): {
  readonly queryKey: ReturnType<typeof historyKey>;
  readonly queryFn: () => Promise<HistoryRow[]>;
} {
  return {
    queryKey: historyKey(capabilities, hours),
    queryFn: () => readHistory(capabilities, new Date(Date.now() - hours * HOUR_MS).toISOString()),
  };
}

export async function preloadAirHistory({ queryClient }: PreloadContext): Promise<void> {
  await Promise.all(
    AIR_METRICS.map((metric) => queryClient.query(historyQuery([metric], AIR_RANGE_HOURS['24h']))),
  );
}

export interface MetricSource {
  readonly source: ClimateSource;
  readonly presented: PresentedCapability;
}

export function metricSources(
  sources: readonly ClimateSource[],
  metric: AirMetric,
): readonly MetricSource[] {
  return sources.flatMap((source) => {
    const presented = withRole(source.model.presentation, metric);
    return presented === undefined ? [] : [{ source, presented }];
  });
}

function capabilityKeys(sources: readonly MetricSource[]): readonly string[] {
  return [...new Set(sources.map((entry) => entry.presented.key))].sort();
}

export function useAirHistory(
  sources: readonly MetricSource[],
  range: AirRange,
): UseQueryResult<HistoryRow[]> {
  const keys = capabilityKeys(sources);
  return useScreenQuery({
    ...historyQuery(keys, AIR_RANGE_HOURS[range]),
    enabled: keys.length > 0,
  });
}

const BUCKET_MS: Readonly<Record<AirRange, number>> = {
  '24h': 15 * 60_000,
  '7d': HOUR_MS,
  '30d': 6 * HOUR_MS,
};

function bucketed(points: readonly ChartPoint[], size: number): readonly ChartPoint[] {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const point of points) {
    const start = Math.floor(point.t / size) * size;
    const bucket = buckets.get(start) ?? { sum: 0, count: 0 };
    buckets.set(start, { sum: bucket.sum + point.v, count: bucket.count + 1 });
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([start, bucket]) => ({ t: start + size / 2, v: bucket.sum / bucket.count }));
}

function pointsOf(
  rows: readonly HistoryRow[],
  entry: MetricSource,
  range: AirRange,
): readonly ChartPoint[] {
  const raw = rows.flatMap((row) =>
    row.device_id === entry.source.model.device.id &&
    row.capability === entry.presented.key &&
    typeof row.value === 'number'
      ? [{ t: Date.parse(row.observed_at), v: row.value }]
      : [],
  );
  return bucketed(raw, BUCKET_MS[range]);
}

const FIT_SHARE = 0.5;

export function shouldFit(series: readonly ChartSeries[], range: AirRange): boolean {
  const times = series.flatMap((entry) => entry.points.map((point) => point.t));
  if (times.length === 0) {
    return false;
  }
  const span = Math.max(...times) - Math.min(...times);
  return span < AIR_RANGE_HOURS[range] * HOUR_MS * FIT_SHARE;
}

export function seriesOf(
  rows: readonly HistoryRow[],
  sources: readonly MetricSource[],
  metric: AirMetric,
  range: AirRange,
): readonly ChartSeries[] {
  const series = sources
    .map((entry) => ({ entry, points: pointsOf(rows, entry, range) }))
    .filter((found) => found.points.length > 0);
  return series.map(({ entry, points }, index) => ({
    points,
    colour:
      series.length === 1
        ? METRIC_COLOUR[metric]
        : (SERIES_COLOURS[index % SERIES_COLOURS.length] ?? METRIC_COLOUR[metric]),
    label: entry.source.model.device.label,
  }));
}

export function chartedMetric(sources: readonly ClimateSource[]): AirMetric | null {
  const charted: readonly AirMetric[] = ['pm25', 'temperature', 'humidity'];
  return charted.find((metric) => metricSources(sources, metric).length > 0) ?? null;
}
