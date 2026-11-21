import {
  METRIC_RANGE_RESOLUTION,
  type MetricPoint,
  type MetricRange,
  type MetricSeries,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HostedRepository } from '../store/host/hosted';
import type { MetricRowInsert } from '../store/repositories/device-metrics';
import { HOUR_MS, MinuteAccumulator, startOf, type MinuteSummary } from './minute';
import { MetricRing } from './ring';

export const PRUNE_SLICE_ROWS = 1000;

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
  readonly store: HostedRepository<
    'deviceMetrics',
    'saveMinutes' | 'rollHours' | 'prune' | 'series'
  >;
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
  private writes: Promise<void> = Promise.resolve();

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

  recent(deviceId: string, capability: string): MetricSeries {
    const from = this.options.now().getTime() - RANGE_MS['10m'];
    return { resolution: 'second', points: this.ringSince(deviceId, capability, from) };
  }

  async read(deviceId: string, capability: string, range: MetricRange): Promise<MetricSeries> {
    const resolution = METRIC_RANGE_RESOLUTION[range];
    if (resolution === 'second') return this.recent(deviceId, capability);
    const from = this.options.now().getTime() - RANGE_MS[range];
    return {
      resolution,
      points: await this.options.store.series(deviceId, capability, resolution, iso(from)),
    };
  }

  settled(): Promise<void> {
    return this.writes;
  }

  private ringSince(deviceId: string, capability: string, from: number): MetricPoint[] {
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
    this.queued(() => this.options.store.saveMinutes([row]), 'metrics.minute_not_saved', {
      deviceId,
      capability,
    });
  }

  private queued(
    work: () => Promise<unknown>,
    failure: string,
    fields: Readonly<Record<string, string>>,
  ): void {
    this.writes = this.writes
      .then(async () => {
        await work();
      })
      .catch((cause: unknown) => {
        this.options.log.error(failure, cause, fields);
      });
  }

  private rollIfNewHour(at: number): void {
    const hour = startOf(at, HOUR_MS);
    if (hour <= this.rolledHour) {
      return;
    }
    this.rolledHour = hour;
    this.queued(
      () => this.options.store.rollHours(iso(hour - ROLLED_WINDOW_MS), iso(hour)),
      'metrics.hours_not_rolled',
      { hour: iso(hour) },
    );
    this.queued(() => this.prune(at), 'metrics.prune_failed', { hour: iso(hour) });
  }

  private async prune(at: number): Promise<void> {
    for (const [resolution, before] of [
      ['minute', iso(at - MINUTE_RETENTION_MS)],
      ['hour', iso(at - HOUR_RETENTION_MS)],
    ] as const) {
      let removed = PRUNE_SLICE_ROWS;
      while (removed === PRUNE_SLICE_ROWS)
        removed = await this.options.store.prune(resolution, before, PRUNE_SLICE_ROWS);
    }
  }
}
