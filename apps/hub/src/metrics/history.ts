import {
  METRIC_RANGE_RESOLUTION,
  type MetricPoint,
  type MetricRange,
  type MetricSeries,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  DeviceMetricsRepository,
  MetricRowInsert,
} from '../store/repositories/device-metrics';
import { HOUR_MS, MinuteAccumulator, startOf, type MinuteSummary } from './minute';
import { MetricRing } from './ring';

const RING_SECONDS = 600;
const MINUTE_RETENTION_MS = 24 * HOUR_MS;
const HOUR_RETENTION_MS = 30 * 24 * HOUR_MS;
const ROLLED_WINDOW_MS = 23 * HOUR_MS;

const RANGE_MS: Readonly<Record<MetricRange, number>> = {
  '10m': RING_SECONDS * 1000,
  '24h': MINUTE_RETENTION_MS,
  '30d': HOUR_RETENTION_MS,
};

export interface MetricHistoryOptions {
  readonly store: Pick<DeviceMetricsRepository, 'saveMinutes' | 'rollHours' | 'prune' | 'series'>;
  readonly log: Logger;
  readonly now: () => Date;
}

interface Series {
  readonly ring: MetricRing;
  readonly minute: MinuteAccumulator;
}

function seriesKey(deviceId: string, capability: string): string {
  return `${deviceId}|${capability}`;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}

export class MetricHistory {
  private readonly series = new Map<string, Series>();
  private rolledHour: number;

  constructor(private readonly options: MetricHistoryOptions) {
    this.rolledHour = startOf(options.now().getTime(), HOUR_MS);
  }

  push(deviceId: string, capability: string, value: number, at: Date): void {
    const time = at.getTime();
    const series = this.seriesOf(deviceId, capability);
    series.ring.push(value, time);
    const finished = series.minute.add(value, time);
    if (finished !== null) {
      this.save(deviceId, capability, finished);
    }
    this.rollIfNewHour(time);
  }

  read(deviceId: string, capability: string, range: MetricRange): MetricSeries {
    const resolution = METRIC_RANGE_RESOLUTION[range];
    const from = this.options.now().getTime() - RANGE_MS[range];
    if (resolution === 'second') {
      return { resolution, points: this.recent(deviceId, capability, from) };
    }
    return {
      resolution,
      points: this.options.store.series(deviceId, capability, resolution, iso(from)),
    };
  }

  private recent(deviceId: string, capability: string, from: number): MetricPoint[] {
    const series = this.series.get(seriesKey(deviceId, capability));
    if (series === undefined) {
      return [];
    }
    return series.ring.since(from).map((point) => ({
      at: iso(point.at),
      value: point.value,
      minimum: point.value,
      maximum: point.value,
    }));
  }

  private seriesOf(deviceId: string, capability: string): Series {
    const key = seriesKey(deviceId, capability);
    const known = this.series.get(key);
    if (known !== undefined) {
      return known;
    }
    const created = { ring: new MetricRing(RING_SECONDS), minute: new MinuteAccumulator() };
    this.series.set(key, created);
    return created;
  }

  private save(deviceId: string, capability: string, minute: MinuteSummary): void {
    const row: MetricRowInsert = {
      deviceId,
      capability,
      bucketStart: iso(minute.start),
      average: minute.average,
      minimum: minute.minimum,
      maximum: minute.maximum,
      count: minute.count,
    };
    try {
      this.options.store.saveMinutes([row]);
    } catch (cause) {
      this.options.log.error('metrics.minute_not_saved', cause, { deviceId, capability });
    }
  }

  private rollIfNewHour(at: number): void {
    const hour = startOf(at, HOUR_MS);
    if (hour <= this.rolledHour) {
      return;
    }
    this.rolledHour = hour;
    try {
      this.options.store.rollHours(iso(hour - ROLLED_WINDOW_MS), iso(hour));
      this.options.store.prune('minute', iso(at - MINUTE_RETENTION_MS));
      this.options.store.prune('hour', iso(at - HOUR_RETENTION_MS));
    } catch (cause) {
      this.options.log.error('metrics.hours_not_rolled', cause, { hour: iso(hour) });
    }
  }
}
