import { useQueries, useQuery } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import {
  API_ENDPOINTS as E,
  type ComputerMetric,
  type MetricRange,
  type MetricSeries,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { ChartPoint } from '../../../components/charts';
import { useScreenPaused } from '../../../design/screen-pause';

type Lists = readonly (readonly ChartPoint[])[];

function pointsOf(series: MetricSeries): readonly ChartPoint[] {
  return series.points.map((point) => ({ t: Date.parse(point.at), v: point.value }));
}

function listsOf(results: readonly { readonly data: readonly ChartPoint[] | undefined }[]): Lists {
  return results.map((result) => result.data ?? []);
}

function metricKey(
  deviceId: string,
  capability: ComputerMetric,
  range: MetricRange,
): readonly string[] {
  return ['window', 'computer-metric', deviceId, capability, range];
}

async function readMetric(
  deviceId: string,
  capability: ComputerMetric,
  range: MetricRange,
): Promise<readonly ChartPoint[]> {
  return pointsOf(
    await api().call(E.readComputerMetrics, {
      params: { deviceId },
      query: { capability, range },
    }),
  );
}

export function useMetricSeries(
  deviceId: string,
  metrics: readonly ComputerMetric[],
  range: MetricRange,
  enabled: boolean,
): Lists {
  const paused = useScreenPaused();
  return useQueries({
    queries: metrics.map((capability) => ({
      queryKey: metricKey(deviceId, capability, range),
      queryFn: () => readMetric(deviceId, capability, range),
      enabled,
      subscribed: !paused,
    })),
    combine: listsOf,
  });
}

export interface MetricHistory {
  readonly points: readonly ChartPoint[] | undefined;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function useMetricHistory(
  deviceId: string,
  metric: ComputerMetric,
  range: MetricRange,
  enabled: boolean,
): MetricHistory {
  const paused = useScreenPaused();
  const query = useQuery({
    queryKey: metricKey(deviceId, metric, range),
    queryFn: () => readMetric(deviceId, metric, range),
    enabled,
    subscribed: !paused,
  });
  return {
    points: query.data,
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'computer_history.refetch_failed');
    },
  };
}
