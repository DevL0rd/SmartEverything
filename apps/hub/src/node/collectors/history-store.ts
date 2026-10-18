import {
  DEFAULT_HISTORY_POLICY,
  historyCapacity,
  type HistoryColumns,
  type HistoryPolicy,
  type HistoryQuery,
  type HistorySeries,
} from '@smarteverything/domain';
import { significant } from './rounding';
import type { SeriesPoint } from './history-series';

const VALUE_DIGITS = 6;
const KEY_SEPARATOR = '\u0000';

interface Span {
  readonly from: number;
  readonly selected: number;
  readonly step: number;
  readonly buckets: number;
}

interface Column {
  readonly topic: string;
  readonly key: string;
  readonly unit: string | null;
  readonly values: Float32Array;
}

function stampsOf(times: Float64Array, head: number, size: number): number[] {
  const capacity = times.length;
  return Array.from(
    { length: size },
    (_, offset) => times[(head - size + offset + capacity) % capacity] ?? 0,
  );
}

export class HistoryStore {
  private policy: HistoryPolicy;
  private times: Float64Array;
  private columns = new Map<string, Column>();
  private head = 0;
  private size = 0;
  private writes = 0;

  constructor(policy: HistoryPolicy = DEFAULT_HISTORY_POLICY) {
    this.policy = policy;
    this.times = new Float64Array(historyCapacity(policy));
  }

  get bytes(): number {
    let total = this.times.byteLength;
    for (const column of this.columns.values()) {
      total += column.values.byteLength;
    }
    return total;
  }

  get seriesCount(): number {
    return this.columns.size;
  }

  get points(): number {
    return this.size;
  }

  setPolicy(policy: HistoryPolicy): void {
    const capacity = historyCapacity(policy);
    if (capacity !== this.times.length) {
      this.resize(capacity);
    }
    this.policy = policy;
  }

  clear(): void {
    this.columns.clear();
    this.head = 0;
    this.size = 0;
    this.writes = 0;
  }

  record(at: number, points: readonly SeriesPoint[]): void {
    const capacity = this.times.length;
    const slot = this.head;
    this.times[slot] = at;
    for (const column of this.columns.values()) {
      column.values[slot] = Number.NaN;
    }
    for (const point of points) {
      const column = this.columnFor(point);
      column.values[slot] = point.value ?? Number.NaN;
    }
    this.head = (slot + 1) % capacity;
    this.size = Math.min(capacity, this.size + 1);
    this.writes += 1;
    if (this.writes % capacity === 0) {
      this.dropEmpty();
    }
  }

  backfill(query: HistoryQuery, now: number): HistoryColumns {
    const since = 'sinceMs' in query ? query.sinceMs : now - query.windowMs;
    const stamps = stampsOf(this.times, this.head, this.size);
    const found = stamps.findIndex((stamp) => stamp >= since);
    const from = found === -1 ? stamps.length : found;
    const selected = stamps.length - from;
    const step = Math.max(1, Math.ceil(selected / query.maxPoints));
    const buckets = Math.ceil(selected / step);
    const timestamps = Array.from({ length: buckets }, (_, bucket) => {
      const last = Math.min(selected - 1, bucket * step + step - 1);
      return stamps[from + last] ?? 0;
    });
    const wanted = new Set(query.topics);
    const series = [...this.columns.values()]
      .filter((column) => wanted.has(column.topic))
      .map((column) => this.seriesOf(column, { from, selected, step, buckets }));
    return {
      intervalMs: this.policy.interval_ms,
      windowMs: this.policy.window_ms,
      oldestMs: timestamps[0] ?? null,
      newestMs: timestamps.at(-1) ?? null,
      timestamps,
      series,
      downsample: {
        method: step > 1 ? 'mean' : 'none',
        sourcePoints: selected,
        stepMs: this.policy.interval_ms * step,
      },
    };
  }

  private seriesOf(column: Column, span: Span): HistorySeries {
    const { from, selected, step, buckets } = span;
    const capacity = this.times.length;
    const oldest = this.head - this.size + from;
    const values = Array.from({ length: buckets }, (_, bucket) => {
      let sum = 0;
      let count = 0;
      const end = Math.min(selected, bucket * step + step);
      for (let offset = bucket * step; offset < end; offset += 1) {
        const value = column.values[(oldest + offset + capacity) % capacity] ?? Number.NaN;
        if (!Number.isNaN(value)) {
          sum += value;
          count += 1;
        }
      }
      return count === 0 ? null : significant(sum / count, VALUE_DIGITS);
    });
    return { topic: column.topic, key: column.key, unit: column.unit, values };
  }

  private columnFor(point: SeriesPoint): Column {
    const id = `${point.topic}${KEY_SEPARATOR}${point.key}`;
    const known = this.columns.get(id);
    if (known !== undefined) {
      return known;
    }
    const values = new Float32Array(this.times.length).fill(Number.NaN);
    const column = { topic: point.topic, key: point.key, unit: point.unit, values };
    this.columns.set(id, column);
    return column;
  }

  private dropEmpty(): void {
    for (const [id, column] of this.columns) {
      if (column.values.every((value) => Number.isNaN(value))) {
        this.columns.delete(id);
      }
    }
  }

  private resize(capacity: number): void {
    const kept = Math.min(this.size, capacity);
    const stamps = stampsOf(this.times, this.head, this.size).slice(this.size - kept);
    const times = new Float64Array(capacity);
    times.set(stamps);
    const oldCapacity = this.times.length;
    const oldest = this.head - kept;
    const columns = new Map<string, Column>();
    for (const [id, column] of this.columns) {
      const values = new Float32Array(capacity).fill(Number.NaN);
      for (let offset = 0; offset < kept; offset += 1) {
        values[offset] = column.values[(oldest + offset + oldCapacity) % oldCapacity] ?? Number.NaN;
      }
      columns.set(id, { ...column, values });
    }
    this.times = times;
    this.columns = columns;
    this.head = kept % capacity;
    this.size = kept;
  }
}
