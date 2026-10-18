import { extent } from 'd3-array';
import { withRole, type HistoryRow, type PresentedCapability } from '@smarteverything/domain';
import { type UseQueryResult } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import type { PreloadContext } from '../../../app-shell/route-types';
import type { ChartPoint, ChartSeries } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { HOUR_MS, MINUTE_MS } from '../../../format/time';
import { compareText } from '../../../format/text';
import { readHistory } from '../../../queries/history';
import { historyKey } from '../../../queries/keys';
import type { DeviceModel } from '../../devices';
import { useScreenQuery } from '../../../queries/use-screen-query';

const log = new Logger('app.climate');

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

function historyQuery(
  capabilities: readonly string[],
  hours: number,
): {
  readonly queryKey: ReturnType<typeof historyKey>;
  readonly queryFn: () => Promise<HistoryRow[]>;
} {
  return {
    queryKey: historyKey(capabilities, hours),
    queryFn: async (): Promise<HistoryRow[]> => {
      const startedAt = Date.now();
      try {
        const rows = await readHistory(
          capabilities,
          new Date(Date.now() - hours * HOUR_MS).toISOString(),
        );
        log.debug('history.loaded', () => ({
          capabilities,
          hours,
          rows: rows.length,
          latencyMs: Date.now() - startedAt,
        }));
        return rows;
      } catch (error) {
        log.error('history.failed', error, {
          capabilities,
          hours,
          latencyMs: Date.now() - startedAt,
        });
        throw error;
      }
    },
  };
}

export async function preloadAirHistory({ queryClient }: PreloadContext): Promise<void> {
  await Promise.all(
    AIR_METRICS.map((metric) => queryClient.query(historyQuery([metric], AIR_RANGE_HOURS['24h']))),
  );
}

export interface MetricSource {
  readonly model: DeviceModel;
  readonly presented: PresentedCapability;
}

export function metricSources(
  models: readonly DeviceModel[],
  metric: AirMetric,
): readonly MetricSource[] {
  return models.flatMap((model) => {
    const presented = withRole(model.presentation, metric);
    return presented === undefined ? [] : [{ model, presented }];
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
  log.trace('history.requested', { capabilities: keys, range, enabled: keys.length > 0 });
  return useScreenQuery({
    ...historyQuery(keys, AIR_RANGE_HOURS[range]),
    enabled: keys.length > 0,
  });
}

const BUCKET_MS: Readonly<Record<AirRange, number>> = {
  '24h': 15 * MINUTE_MS,
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
  entries: readonly MetricSource[],
  range: AirRange,
): readonly ChartPoint[] {
  const raw = rows.flatMap((row) =>
    typeof row.value === 'number' &&
    entries.some(
      (entry) => row.device_id === entry.model.device.id && row.capability === entry.presented.key,
    )
      ? [{ t: Date.parse(row.observed_at), v: row.value }]
      : [],
  );
  return bucketed(raw, BUCKET_MS[range]);
}

const FIT_SHARE = 0.5;
const OTHER_LABEL = 'Other';

export function shouldFit(series: readonly ChartSeries[], range: AirRange): boolean {
  const [first, last] = extent(series.flatMap((entry) => entry.points.map((point) => point.t)));
  return first !== undefined && last - first < AIR_RANGE_HOURS[range] * HOUR_MS * FIT_SHARE;
}

interface SourceGroup {
  readonly entries: readonly MetricSource[];
  readonly label: string;
}

function groupsOf(sources: readonly MetricSource[]): readonly SourceGroup[] {
  const ordered = [...sources].sort((left, right) =>
    compareText(left.model.device.id, right.model.device.id),
  );
  const shown = ordered.length > SERIES_COLOURS.length ? SERIES_COLOURS.length - 1 : ordered.length;
  const groups = ordered
    .slice(0, shown)
    .map((entry) => ({ entries: [entry], label: entry.model.device.label }));
  const rest = ordered.slice(shown);
  return rest.length === 0 ? groups : [...groups, { entries: rest, label: OTHER_LABEL }];
}

export function seriesOf(
  rows: readonly HistoryRow[],
  sources: readonly MetricSource[],
  metric: AirMetric,
  range: AirRange,
): readonly ChartSeries[] {
  const groups = groupsOf(sources);
  return SERIES_COLOURS.flatMap((colour, index) => {
    const group = groups[index];
    const points = group === undefined ? [] : pointsOf(rows, group.entries, range);
    return group === undefined || points.length === 0
      ? []
      : [
          {
            points,
            colour: sources.length === 1 ? METRIC_COLOUR[metric] : colour,
            label: group.label,
          },
        ];
  });
}

export function chartedMetric(models: readonly DeviceModel[]): AirMetric | null {
  const charted: readonly AirMetric[] = ['pm25', 'temperature', 'humidity'];
  return charted.find((metric) => metricSources(models, metric).length > 0) ?? null;
}
