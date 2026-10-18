import type { HealthRecord } from '@smarteverything/domain';
import type { ChartPoint } from '../../components/charts';
import { MINUTE_MS } from '../../format/time';

export const HEART_FRESH_MS = 2 * MINUTE_MS;
export const RELAY_STALE_MS = 30 * MINUTE_MS;
const HEART_BUCKET_MS = 5 * MINUTE_MS;

export interface HeartReading {
  readonly bpm: number;
  readonly at: number;
}

export interface HeartView extends HeartReading {
  readonly fresh: boolean;
}

export interface HeartSources {
  readonly phone: { readonly heartRate: number | null; readonly updatedAt: string } | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly worn: boolean | null;
}

export function heartReadingOf({ phone, details, worn }: HeartSources): HeartReading | null {
  if (worn !== true) {
    return null;
  }
  if (phone !== null) {
    return phone.heartRate !== null && phone.heartRate > 0
      ? { bpm: phone.heartRate, at: Date.parse(phone.updatedAt) }
      : null;
  }
  const bpm = details['heartRate'];
  const reportedAt = details['reportedAt'];
  return typeof bpm === 'number' && bpm > 0 && typeof reportedAt === 'string'
    ? { bpm, at: Date.parse(reportedAt) }
    : null;
}

export function heartViewOf(reading: HeartReading | null, now: number): HeartView | null {
  return reading === null ? null : { ...reading, fresh: now - reading.at <= HEART_FRESH_MS };
}

export function sameHeartView(left: HeartView | null, right: HeartView | null): boolean {
  return left?.bpm === right?.bpm && left?.at === right?.at && left?.fresh === right?.fresh;
}

export function beatingBpm(view: HeartView | null): number | null {
  return view?.fresh === true ? view.bpm : null;
}

export function relayLastSeen(
  phoneConnected: boolean,
  reportedAt: unknown,
  now: number,
): number | null {
  if (phoneConnected || typeof reportedAt !== 'string') {
    return null;
  }
  const at = Date.parse(reportedAt);
  return now - at > RELAY_STALE_MS ? at : null;
}

export function heartPointsOf(records: readonly HealthRecord[]): readonly ChartPoint[] {
  const buckets = new Map<number, { total: number; count: number }>();
  for (const record of records) {
    if (record.type !== 'HeartRate') {
      continue;
    }
    for (const sample of record.data.samples) {
      const bucket = Math.floor(Date.parse(sample.time) / HEART_BUCKET_MS) * HEART_BUCKET_MS;
      const found = buckets.get(bucket) ?? { total: 0, count: 0 };
      buckets.set(bucket, { total: found.total + sample.bpm, count: found.count + 1 });
    }
  }
  return [...buckets.entries()]
    .map(([t, { total, count }]) => ({ t, v: Math.round(total / count) }))
    .sort((left, right) => left.t - right.t);
}
