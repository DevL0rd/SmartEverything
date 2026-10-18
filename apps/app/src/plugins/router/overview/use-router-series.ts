import type { ChartPoint } from '../../../components/charts';
import { useDeviceSeries } from '../../../queries/history';
import { megabitPoints } from './traffic-model';

const EMPTY: readonly ChartPoint[] = [];

export interface RouterSeries {
  readonly state: 'loading' | 'failed' | 'ready';
  readonly points: readonly ChartPoint[];
}

export function useMegabitSeries(
  deviceId: string,
  capability: 'download_rate' | 'upload_rate',
  hours: number,
): RouterSeries {
  const query = useDeviceSeries(deviceId, capability, hours);
  if (query.data !== undefined) {
    return { state: 'ready', points: megabitPoints(query.data) };
  }
  return { state: query.isError ? 'failed' : 'loading', points: EMPTY };
}

export function useRawSeries(
  deviceId: string,
  capability: 'latency' | 'cpu_load' | 'memory_used',
  hours: number,
): readonly ChartPoint[] {
  return useDeviceSeries(deviceId, capability, hours).data ?? EMPTY;
}
