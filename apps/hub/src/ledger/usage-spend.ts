import type { AiUsageRow } from '@smarteverything/domain';
import type { ChangeFeed } from '../store/feed';
import type { StoreHost } from '../store/host/host';
import { spendRowOf, type SpendRow } from './units';

export type UsageListener = (row: AiUsageRow) => void;

export const SPEND_HORIZON_MS = 33 * 24 * 60 * 60 * 1000;

export class UsageSpendNotLoadedError extends Error {
  override readonly name = 'UsageSpendNotLoadedError';

  constructor() {
    super('The AI spend was read before it was loaded from the store host.');
  }
}

export class UsageSpendHorizonError extends Error {
  override readonly name = 'UsageSpendHorizonError';

  constructor(from: string, horizon: string) {
    super(
      `The AI spend since ${from} reaches before the loaded spend, which starts at ${horizon}.`,
    );
  }
}

export class UsageSpend {
  private readonly rows = new Map<string, SpendRow>();
  private readonly listeners = new Set<UsageListener>();
  private horizon: number | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
    private readonly timeZone: () => string,
    private readonly now: () => Date,
  ) {
    feed.subscribe((change) => {
      if (change.table !== 'ai_usage') return;
      if (change.record === null) {
        if (change.oldRecord !== null) this.rows.delete(change.oldRecord.id);
        return;
      }
      this.take(change.record);
      for (const listener of this.listeners) listener(change.record);
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  on(listener: UsageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  zone(): string {
    return this.timeZone();
  }

  spentSince(from: string): number {
    return this.since(from).reduce((total, row) => total + row.costMicros, 0);
  }

  unknownSince(from: string): number {
    return this.since(from).filter((row) => row.unknown).length;
  }

  spentByProfile(from: string, profileId: string): number {
    return this.since(from)
      .filter((row) => row.profileId === profileId)
      .reduce((total, row) => total + row.costMicros, 0);
  }

  private take(record: AiUsageRow): void {
    this.rows.set(record.id, spendRowOf(record));
  }

  private async fill(): Promise<void> {
    const horizon = this.now().getTime() - SPEND_HORIZON_MS;
    const rows = await this.host.read('ledgerSpendRows', { from: new Date(horizon).toISOString() });
    for (const row of rows) if (!this.rows.has(row.id)) this.rows.set(row.id, row);
    this.horizon = horizon;
  }

  private since(from: string): SpendRow[] {
    if (this.horizon === null) throw new UsageSpendNotLoadedError();
    const start = Date.parse(from);
    if (start < this.horizon)
      throw new UsageSpendHorizonError(from, new Date(this.horizon).toISOString());
    this.forget();
    return [...this.rows.values()].filter((row) => Date.parse(row.at) >= start);
  }

  private forget(): void {
    const horizon = this.now().getTime() - SPEND_HORIZON_MS;
    if (this.horizon === null || horizon <= this.horizon) return;
    this.horizon = horizon;
    for (const [id, row] of this.rows) if (Date.parse(row.at) < horizon) this.rows.delete(id);
  }
}
