export type WindowFields = Record<string, number | string>;

export interface Tally {
  count: number;
  ms: number;
  bytes: number;
  worstMs: number;
}

const KILOBYTE = 1024;
const NAME_MAX = 22;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? round1((part * 100) / whole) : 0;
}

export function perSecond(count: number, windowMs: number): number {
  return windowMs > 0 ? round1((count * 1000) / windowMs) : 0;
}

export function kilobytes(bytes: number): number {
  return round1(bytes / KILOBYTE);
}

function shortName(name: string): string {
  return name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name;
}

export class TallyTable {
  private readonly rows = new Map<string, Tally>();

  add(name: string, ms: number, bytes: number): void {
    const row = this.rows.get(name);
    if (row === undefined) {
      this.rows.set(name, { count: 1, ms, bytes, worstMs: ms });
      return;
    }
    row.count += 1;
    row.ms += ms;
    row.bytes += bytes;
    row.worstMs = Math.max(row.worstMs, ms);
  }

  total(): Tally {
    const sum: Tally = { count: 0, ms: 0, bytes: 0, worstMs: 0 };
    this.rows.forEach((row) => {
      sum.count += row.count;
      sum.ms += row.ms;
      sum.bytes += row.bytes;
      sum.worstMs = Math.max(sum.worstMs, row.worstMs);
    });
    return sum;
  }

  top(limit: number, by: (row: Tally) => number): readonly (readonly [string, Tally])[] {
    return [...this.rows].sort(([, a], [, b]) => by(b) - by(a)).slice(0, limit);
  }

  encode(limit: number, by: (row: Tally) => number): string {
    return this.top(limit, by)
      .map(
        ([name, row]) =>
          `${shortName(name)}:${String(row.count)}/${String(round1(row.ms))}/${String(kilobytes(row.bytes))}`,
      )
      .join(',');
  }

  clear(): void {
    this.rows.clear();
  }

  get size(): number {
    return this.rows.size;
  }
}

export class CounterDelta {
  private previous: Readonly<Record<string, number>> | null = null;

  next(current: Readonly<Record<string, number>>): Readonly<Record<string, number>> | null {
    const before = this.previous;
    this.previous = current;
    if (before === null) {
      return null;
    }
    const delta: Record<string, number> = {};
    Object.entries(current).forEach(([key, value]) => {
      const base = before[key];
      delta[key] = base === undefined || value < base ? value : value - base;
    });
    return delta;
  }

  reset(): void {
    this.previous = null;
  }
}

export function sizeOf(data: unknown): number {
  if (typeof data === 'string') {
    return data.length;
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  return ArrayBuffer.isView(data) ? data.byteLength : 0;
}
