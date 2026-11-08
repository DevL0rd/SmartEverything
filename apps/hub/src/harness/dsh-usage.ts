import { Logger } from '@smarteverything/logging';
import { settledUsage } from '@smarteverything/harness/reducer';
import type { SettledUsage } from '@smarteverything/harness/reducer';
import type { LedgerChange, LedgerTokens } from './metered-change';

interface Awaiting {
  readonly rowId: string;
  readonly supplier: LedgerTokens;
}
interface UsageRows {
  readonly amend: (id: string, change: LedgerChange) => unknown;
}

export function dshChange(usage: SettledUsage): LedgerChange {
  return {
    tokens_in: usage.inputTokens,
    tokens_out: usage.outputTokens,
    tokens_cached: usage.cacheReadTokens,
    tokens_reasoning: usage.reasoningTokens,
    meta: { tokens_source: 'dsh', cache_write_tokens: usage.cacheWriteTokens },
  };
}

export class DshUsageLedger {
  private readonly log = new Logger('hub.harness');
  private readonly awaiting = new Map<string, Awaiting>();

  constructor(private readonly rows: UsageRows) {}

  expect(sessionId: string, rowId: string, supplier: LedgerTokens): void {
    const stale = this.awaiting.get(sessionId);
    if (stale !== undefined && stale.rowId !== rowId) this.abandon(sessionId, stale);
    this.awaiting.set(sessionId, { rowId, supplier });
  }

  appended(sessionId: string, events: readonly unknown[]): void {
    for (const event of events) {
      try {
        this.settle(sessionId, settledUsage(event));
      } catch (cause) {
        this.log.error('harness.dsh_usage_failed', cause, { sessionId });
      }
    }
  }

  private settle(sessionId: string, usage: SettledUsage | undefined): void {
    const waiting = this.awaiting.get(sessionId);
    if (usage === undefined || waiting === undefined) return;
    this.awaiting.delete(sessionId);
    this.rows.amend(waiting.rowId, dshChange(usage));
  }

  private abandon(sessionId: string, stale: Awaiting): void {
    this.log.warn('harness.dsh_usage_missing', { sessionId, rowId: stale.rowId });
    this.rows.amend(stale.rowId, { ...stale.supplier, meta: { tokens_source: 'supplier' } });
  }
}
