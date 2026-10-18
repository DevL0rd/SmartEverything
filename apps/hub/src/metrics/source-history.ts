import type { HistoryColumns, HistoryPolicy, HistoryQuery } from '@smarteverything/domain';
import { HistoryStore } from '../node/collectors/history-store';
import type { SeriesPoint } from '../node/collectors/history-series';

const SOURCE_TOPIC = 'live';

export interface SourceHistoryOptions {
  readonly policyOf: (deviceId: string) => HistoryPolicy;
  readonly now: () => Date;
}

class RecordedSource {
  private readonly store: HistoryStore;
  private pendingAt: number | null = null;
  private pending: SeriesPoint[] = [];
  private nextAt = 0;

  constructor(private policy: HistoryPolicy) {
    this.store = new HistoryStore(policy);
  }

  push(key: string, value: number, at: number): void {
    if (this.pendingAt !== null && this.pendingAt !== at) this.flush();
    if (this.pendingAt === null && at < this.nextAt) return;
    this.pendingAt = at;
    this.pending.push({ topic: SOURCE_TOPIC, key, unit: null, value });
  }

  backfill(query: HistoryQuery, now: number): HistoryColumns {
    this.flush();
    return this.store.backfill(query, now);
  }

  retune(policy: HistoryPolicy): void {
    this.policy = policy;
    this.store.setPolicy(policy);
  }

  private flush(): void {
    if (this.pendingAt === null) return;
    this.store.record(this.pendingAt, this.pending);
    this.nextAt = this.pendingAt + this.policy.interval_ms;
    this.pendingAt = null;
    this.pending = [];
  }
}

export class SourceHistory {
  private readonly sources = new Map<string, RecordedSource>();

  constructor(private readonly options: SourceHistoryOptions) {}

  push(deviceId: string, key: string, value: number, at: Date): void {
    this.sourceOf(deviceId).push(key, value, at.getTime());
  }

  backfill(deviceId: string, query: HistoryQuery): HistoryColumns {
    return this.sourceOf(deviceId).backfill(query, this.options.now().getTime());
  }

  retune(): void {
    for (const [deviceId, source] of this.sources) source.retune(this.options.policyOf(deviceId));
  }

  private sourceOf(deviceId: string): RecordedSource {
    const known = this.sources.get(deviceId);
    if (known !== undefined) return known;
    const created = new RecordedSource(this.options.policyOf(deviceId));
    this.sources.set(deviceId, created);
    return created;
  }
}
