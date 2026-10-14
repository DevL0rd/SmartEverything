import { microsOfUsd, type AiUsageRow, type UsageReconcile } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { GenerationStats } from '../openrouter/chat-types';
import type { OpenRouterClient } from '../openrouter/client';
import { settledGeneration } from '../openrouter/generation';
import type { Ledger, Unsubscribe } from './ledger';

export interface ReconcilerOptions {
  readonly ledger: Ledger;
  readonly client: OpenRouterClient;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly log: Logger;
}

function due(row: AiUsageRow): row is AiUsageRow & { generation_id: string } {
  return (
    row.source === 'openrouter' &&
    row.generation_id !== null &&
    (row.cost_state === 'estimated' || row.cost_state === 'reported')
  );
}

export function reconcileOf(stats: GenerationStats): UsageReconcile {
  const { nativeTokensPrompt, nativeTokensCompletion, nativeTokensReasoning, nativeTokensCached } =
    stats;
  return {
    cost_micros: microsOfUsd(stats.totalCost),
    ...(nativeTokensPrompt === null ? {} : { tokens_in: nativeTokensPrompt }),
    ...(nativeTokensCompletion === null ? {} : { tokens_out: nativeTokensCompletion }),
    ...(nativeTokensReasoning === null ? {} : { tokens_reasoning: nativeTokensReasoning }),
    ...(nativeTokensCached === null ? {} : { tokens_cached: nativeTokensCached }),
  };
}

export class Reconciler {
  private stopped = false;
  private readonly settling = new Set<string>();
  private readonly unsubscribe: Unsubscribe;

  constructor(private readonly options: ReconcilerOptions) {
    this.unsubscribe = options.ledger.on((row) => {
      if (due(row)) {
        this.schedule(row.id, row.generation_id);
      }
    });
    for (const row of options.ledger.pendingHarness())
      if (due(row)) this.schedule(row.id, row.generation_id);
  }

  private schedule(id: string, generationId: string): void {
    if (this.settling.has(id)) return;
    this.settling.add(id);
    void this.settle(id, generationId).finally((): void => {
      this.settling.delete(id);
    });
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe();
  }

  private async settle(id: string, generationId: string): Promise<void> {
    const { ledger, client, sleep, log } = this.options;
    try {
      const stats = await settledGeneration(client, generationId, sleep);
      if (this.stopped) {
        return;
      }
      if (stats === null) {
        log.warn('ledger.reconcile_unavailable', { usageId: id, generationId });
        return;
      }
      ledger.reconcile(id, reconcileOf(stats));
    } catch (cause) {
      log.warn('ledger.reconcile_failed', {
        usageId: id,
        generationId,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}
