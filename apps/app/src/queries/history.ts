import { type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HistoryBucket, type HistoryRow } from '@smarteverything/domain';
import { api } from '../api/transport';
import type { ChartPoint } from '../components/charts';
import { HOUR_MS } from '../format/time';
import { deviceHistoryBucketsKey, deviceHistoryKey, historyKey } from './keys';
import { useScreenQuery } from './use-screen-query';

const HOUR_SECONDS = 3_600;
const RAW_MAX_HOURS = 24;
const CHART_POINTS = 180;

export function readHistory(capabilities: readonly string[], since: string): Promise<HistoryRow[]> {
  return api().call(E.readHistory, { query: { capabilities: [...capabilities], from: since } });
}

export function useHistory(
  capabilities: readonly string[],
  sinceHours: number,
): UseQueryResult<HistoryRow[]> {
  return useScreenQuery({
    queryKey: historyKey(capabilities, sinceHours),
    queryFn: () =>
      readHistory(capabilities, new Date(Date.now() - sinceHours * HOUR_MS).toISOString()),
  });
}

export function bucketSecondsFor(hours: number): number {
  return Math.ceil(hours / CHART_POINTS) * HOUR_SECONDS;
}

export async function readDeviceRows(
  deviceId: string,
  capability: string,
  hours: number,
): Promise<HistoryRow[]> {
  const rows = await api().call(E.readHistory, {
    query: {
      capabilities: [capability],
      deviceIds: [deviceId],
      from: new Date(Date.now() - hours * HOUR_MS).toISOString(),
      order: 'desc',
    },
  });
  return rows.reverse();
}

export function readDeviceBuckets(
  deviceId: string,
  capability: string,
  hours: number,
): Promise<HistoryBucket[]> {
  const now = Date.now();
  return api().call(E.readHistoryBuckets, {
    query: {
      capabilities: [capability],
      deviceIds: [deviceId],
      from: new Date(now - hours * HOUR_MS).toISOString(),
      to: new Date(now).toISOString(),
      bucketSeconds: bucketSecondsFor(hours),
    },
  });
}

export function pointsOfRows(rows: readonly HistoryRow[]): ChartPoint[] {
  return rows.flatMap((row) =>
    typeof row.value === 'number' ? [{ t: Date.parse(row.observed_at), v: row.value }] : [],
  );
}

export function pointsOfBuckets(buckets: readonly HistoryBucket[]): ChartPoint[] {
  return buckets.flatMap((bucket) =>
    bucket.average === null ? [] : [{ t: Date.parse(bucket.bucket_start), v: bucket.average }],
  );
}

export function useDeviceSeries(
  deviceId: string,
  capability: string,
  hours: number,
  enabled = true,
): UseQueryResult<ChartPoint[]> {
  const bucketed = hours > RAW_MAX_HOURS;
  const rows = useScreenQuery({
    queryKey: deviceHistoryKey(deviceId, capability, hours),
    queryFn: () => readDeviceRows(deviceId, capability, hours),
    select: pointsOfRows,
    enabled: enabled && !bucketed,
  });
  const buckets = useScreenQuery({
    queryKey: deviceHistoryBucketsKey(deviceId, capability, hours),
    queryFn: () => readDeviceBuckets(deviceId, capability, hours),
    select: pointsOfBuckets,
    enabled: enabled && bucketed,
  });
  return bucketed ? buckets : rows;
}
