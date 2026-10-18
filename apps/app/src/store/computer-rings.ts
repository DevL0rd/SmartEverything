import type { ComputerParts, HistoryBackfillResponse } from '@smarteverything/domain';
import { usePausable } from '../design/external-store';
import type { ChartPoint } from '../components/charts/scale';
import { readingsOf, seriesId } from './computer-series';

export const RING_SPAN_MS = 300_000;
const CAPACITY = 320;
const NONE: readonly ChartPoint[] = [];

export class SeriesRing {
  private times = new Float64Array(CAPACITY);
  private values = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private version = 0;
  private cache: { readonly version: number; readonly points: readonly ChartPoint[] } | null = null;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  readonly points = (): readonly ChartPoint[] => {
    if (this.count === 0) return NONE;
    if (this.cache?.version === this.version) return this.cache.points;
    const newest = this.timeAt(this.count - 1);
    const points: ChartPoint[] = [];
    for (let index = 0; index < this.count; index += 1) {
      const t = this.timeAt(index);
      if (t >= newest - RING_SPAN_MS) points.push({ t, v: this.valueAt(index) });
    }
    this.cache = { version: this.version, points };
    return points;
  };

  newest(): number | null {
    return this.count === 0 ? null : this.timeAt(this.count - 1);
  }

  oldest(): number | null {
    return this.count === 0 ? null : this.timeAt(0);
  }

  push(t: number, v: number): boolean {
    const newest = this.newest();
    if (newest !== null && t <= newest) return false;
    const slot = (this.head + this.count) % CAPACITY;
    this.times[slot] = t;
    this.values[slot] = v;
    if (this.count === CAPACITY) this.head = (this.head + 1) % CAPACITY;
    else this.count += 1;
    while (this.count > 0 && this.timeAt(0) < t - RING_SPAN_MS) {
      this.head = (this.head + 1) % CAPACITY;
      this.count -= 1;
    }
    this.changed();
    return true;
  }

  seed(older: readonly ChartPoint[]): void {
    const first = this.oldest();
    const edge = (this.newest() ?? older.at(-1)?.t ?? 0) - RING_SPAN_MS;
    const fresh = older.filter((point) => point.t >= edge && (first === null || point.t < first));
    if (fresh.length === 0) return;
    const merged = [...fresh, ...this.stored()].slice(-CAPACITY);
    this.fill(merged);
    this.changed();
  }

  clear(): void {
    if (this.count === 0) return;
    this.head = 0;
    this.count = 0;
    this.changed();
  }

  private stored(): ChartPoint[] {
    return Array.from({ length: this.count }, (_, index) => ({
      t: this.timeAt(index),
      v: this.valueAt(index),
    }));
  }

  private fill(points: readonly ChartPoint[]): void {
    this.head = 0;
    this.count = points.length;
    points.forEach((point, index) => {
      this.times[index] = point.t;
      this.values[index] = point.v;
    });
  }

  private timeAt(index: number): number {
    return this.times[(this.head + index) % CAPACITY] ?? 0;
  }

  private valueAt(index: number): number {
    return this.values[(this.head + index) % CAPACITY] ?? 0;
  }

  private changed(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}

export class ComputerRings {
  private readonly byDevice = new Map<string, Map<string, SeriesRing>>();
  private readonly backfilled = new Map<string, Set<string>>();

  claimBackfill(deviceId: string, topics: readonly string[]): readonly string[] {
    const claimed = this.backfilled.get(deviceId) ?? new Set<string>();
    this.backfilled.set(deviceId, claimed);
    const fresh = topics.filter((topic) => !claimed.has(topic));
    fresh.forEach((topic) => claimed.add(topic));
    return fresh;
  }

  releaseBackfill(deviceId: string, topics: readonly string[]): void {
    topics.forEach((topic) => this.backfilled.get(deviceId)?.delete(topic));
  }

  ring(deviceId: string, id: string): SeriesRing {
    const rings = this.byDevice.get(deviceId) ?? new Map<string, SeriesRing>();
    this.byDevice.set(deviceId, rings);
    const known = rings.get(id);
    if (known !== undefined) return known;
    const created = new SeriesRing();
    rings.set(id, created);
    return created;
  }

  feed(deviceId: string, at: number, parts: ComputerParts): void {
    for (const [id, value] of readingsOf(parts)) {
      if (value !== null) this.ring(deviceId, id).push(at, value);
    }
  }

  seed(deviceId: string, response: HistoryBackfillResponse): void {
    for (const series of response.series) {
      const points = response.timestamps.flatMap((t, index): ChartPoint[] => {
        const v = series.values[index];
        return v === null || v === undefined ? [] : [{ t, v }];
      });
      this.ring(deviceId, seriesId(series.topic, series.key)).seed(points);
    }
  }

  drop(deviceId: string): void {
    this.backfilled.delete(deviceId);
    for (const ring of this.byDevice.get(deviceId)?.values() ?? []) ring.clear();
  }
}

export const computerRings = new ComputerRings();

export function useLiveSeries(deviceId: string, series: string): readonly ChartPoint[] {
  const ring = computerRings.ring(deviceId, series);
  return usePausable(ring.subscribe, ring.points);
}
