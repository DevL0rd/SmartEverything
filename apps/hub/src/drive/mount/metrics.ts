const STEPS_PER_DOUBLING = 8;
const MICROS_PER_MS = 1000;

export interface Summary {
  readonly count: number;
  readonly totalMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export interface OpSummary {
  readonly wait: Summary;
  readonly run: Summary;
}

function bucketOf(micros: number): number {
  return micros < 1 ? 0 : Math.floor(Math.log2(micros) * STEPS_PER_DOUBLING) + 1;
}

function upperMsOf(bucket: number): number {
  return bucket === 0 ? 0 : 2 ** (bucket / STEPS_PER_DOUBLING) / MICROS_PER_MS;
}

export class Histogram {
  private readonly counts = new Map<number, number>();
  private total = 0;
  private sum = 0;
  private max = 0;

  record(ms: number): void {
    const bucket = bucketOf(ms * MICROS_PER_MS);
    const count = this.counts.get(bucket);
    this.counts.set(bucket, count === undefined ? 1 : count + 1);
    this.total += 1;
    this.sum += ms;
    if (ms > this.max) this.max = ms;
  }

  private quantile(fraction: number): number {
    if (this.total === 0) return 0;
    const rank = Math.ceil(fraction * this.total);
    let seen = 0;
    const ordered = [...this.counts].sort(([left], [right]) => left - right);
    for (const [bucket, count] of ordered) {
      seen += count;
      if (seen >= rank) return Math.min(upperMsOf(bucket), this.max);
    }
    return this.max;
  }

  summary(): Summary {
    return {
      count: this.total,
      totalMs: this.sum,
      p50Ms: this.quantile(0.5),
      p95Ms: this.quantile(0.95),
      p99Ms: this.quantile(0.99),
      maxMs: this.max,
    };
  }
}

interface OpHistograms {
  readonly wait: Histogram;
  readonly run: Histogram;
}

export class MountMetrics {
  private ops = new Map<string, OpHistograms>();

  record(op: string, waitMs: number, runMs: number): void {
    let own = this.ops.get(op);
    if (own === undefined) {
      own = { wait: new Histogram(), run: new Histogram() };
      this.ops.set(op, own);
    }
    own.wait.record(waitMs);
    own.run.record(runMs);
  }

  snapshot(): Readonly<Record<string, OpSummary>> {
    const out: Record<string, OpSummary> = {};
    for (const [name, own] of this.ops)
      out[name] = { wait: own.wait.summary(), run: own.run.summary() };
    return out;
  }

  reset(): void {
    this.ops = new Map();
  }
}
