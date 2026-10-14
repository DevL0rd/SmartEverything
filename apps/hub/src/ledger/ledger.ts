import {
  AI_USAGE_ROW,
  USAGE_ENTRY,
  USAGE_RECONCILE,
  type AiUsageRow,
  type UsageBucket,
  type UsageChoices,
  type UsageEntry,
  type UsageFilter,
  type UsageLedgerPage,
  type UsagePoint,
  type UsageReconcile,
  type UsageSeries,
  type UsageSplit,
  type UsageTotals,
} from '@smarteverything/domain';
import type { StoreContext } from '../store/context';
import { ledgerPageOf, positionOf } from './ledger-page';
import { choicesOf, seriesOf, spentSince, totalsOf, unknownSince } from './usage-queries';
import { UsageStore } from './usage-store';
import { durableSessionWrite } from '../store/repositories/dsh-session-durability';

export type UsageListener = (row: AiUsageRow) => void;

export type CostSink = (row: AiUsageRow, deltaMicros: number) => void;

export type Unsubscribe = () => void;

export interface LedgerRequest {
  readonly filter: UsageFilter;
  readonly cursor: string | undefined;
  readonly limit: number;
}

export class AlreadyFinalError extends Error {
  override readonly name = 'AlreadyFinalError';

  constructor(id: string, state: string) {
    super(
      `The usage record ${id} is ${state}; only estimated or reported costs can be reconciled.`,
    );
  }
}

function subscribe<T>(set: Set<T>, item: T): Unsubscribe {
  set.add(item);
  return (): void => {
    set.delete(item);
  };
}

export class Ledger {
  private readonly rows: UsageStore;
  private readonly listeners = new Set<UsageListener>();
  private readonly sinks = new Set<CostSink>();

  constructor(
    private readonly context: StoreContext,
    private readonly timeZone: () => string,
  ) {
    this.rows = new UsageStore(context);
  }

  record(entry: UsageEntry, durable = false): AiUsageRow {
    const parsed = USAGE_ENTRY.parse(entry);
    const write = (): AiUsageRow => {
      const row = AI_USAGE_ROW.parse({
        ...parsed,
        id: this.context.newId(),
        at: parsed.at ?? this.context.now(),
        chat_id: parsed.chat_id ?? this.rows.chatOf(parsed.message_id, parsed.call_id),
      });
      this.rows.insert(row);
      this.context.changed('ai_usage', 'INSERT', row, null);
      this.sink(row, row.cost_micros);
      return row;
    };
    const row = durable ? durableSessionWrite(this.context, write) : this.context.write(write);
    this.tell(row);
    return row;
  }

  amend(
    id: string,
    change: Partial<
      Pick<
        AiUsageRow,
        | 'generation_id'
        | 'tokens_in'
        | 'tokens_out'
        | 'tokens_cached'
        | 'tokens_reasoning'
        | 'cost_micros'
        | 'cost_state'
        | 'meta'
      >
    >,
  ): AiUsageRow {
    const row = durableSessionWrite(this.context, () => {
      const before = this.rows.get(id);
      if (before.cost_state === 'reconciled') return before;
      const after = AI_USAGE_ROW.parse({
        ...before,
        ...change,
        meta: { ...before.meta, ...change.meta },
      });
      this.rows.replace(after);
      this.context.changed('ai_usage', 'UPDATE', after, before);
      this.sink(after, after.cost_micros - before.cost_micros);
      return after;
    });
    this.tell(row);
    return row;
  }

  pendingHarness(): AiUsageRow[] {
    return this.rows.pendingHarness();
  }

  reconcile(id: string, stats: UsageReconcile): AiUsageRow {
    const change = USAGE_RECONCILE.parse(stats);
    const row = this.context.write(() => {
      const before = this.rows.get(id);
      if (before.cost_state !== 'estimated' && before.cost_state !== 'reported') {
        throw new AlreadyFinalError(id, before.cost_state);
      }
      const after = AI_USAGE_ROW.parse({
        ...before,
        ...change,
        meta: { ...before.meta, ...change.meta, cost_available: true },
        cost_state: 'reconciled',
      });
      this.rows.replace(after);
      this.context.changed('ai_usage', 'UPDATE', after, before);
      this.sink(after, after.cost_micros - before.cost_micros);
      return after;
    });
    this.tell(row);
    return row;
  }

  get(id: string): AiUsageRow {
    return this.rows.get(id);
  }

  ledger(request: LedgerRequest): UsageLedgerPage {
    const after = request.cursor === undefined ? null : positionOf(request.cursor);
    const rows = this.rows.page({ filter: request.filter, after, limit: request.limit + 1 });
    return ledgerPageOf(this.context.sql, rows, request.limit);
  }

  totals(filter: UsageFilter): UsageTotals {
    return totalsOf(this.context.sql, filter);
  }

  series(filter: UsageFilter, bucket: UsageBucket, split: UsageSplit | null = null): UsagePoint[] {
    return this.report(filter, bucket, split).points;
  }

  report(filter: UsageFilter, bucket: UsageBucket, split: UsageSplit | null): UsageSeries {
    const timeZone = this.timeZone();
    return {
      from: filter.from,
      to: filter.to,
      bucket,
      split,
      time_zone: timeZone,
      points: seriesOf(this.context.sql, { filter, bucket, split, timeZone }),
    };
  }

  zone(): string {
    return this.timeZone();
  }

  unknownSince(from: string): number {
    return unknownSince(this.context.sql, from);
  }

  spentSince(from: string): number {
    return spentSince(this.context.sql, from);
  }

  choices(filter: UsageFilter): UsageChoices {
    return choicesOf(this.context.sql, filter);
  }

  on(listener: UsageListener): Unsubscribe {
    return subscribe(this.listeners, listener);
  }

  rollup(sink: CostSink): Unsubscribe {
    return subscribe(this.sinks, sink);
  }

  private sink(row: AiUsageRow, delta: number): void {
    for (const sink of this.sinks) {
      sink(row, delta);
    }
  }

  private tell(row: AiUsageRow): void {
    for (const listener of this.listeners) {
      listener(row);
    }
  }
}
