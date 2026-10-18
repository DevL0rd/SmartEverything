import { microsOfUsd, type AiUsageRow, type UsageReconcile } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { GenerationStats } from '../openrouter/chat-types';
import type { OpenRouterClient } from '../openrouter/client';
import { settledGeneration } from '../openrouter/generation';
import type { Ledger, Unsubscribe } from './ledger';
import { background, messageOf } from '@smarteverything/logging';

export interface ReconcilerOptions {
  readonly ledger: Ledger;
  readonly client: OpenRouterClient;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly log: Logger;
}

const REFINE_ATTEMPTS = 5;

function due(row: AiUsageRow): row is AiUsageRow & { generation_id: string } {
  return (
    row.source === 'openrouter' &&
    row.generation_id !== null &&
    (row.cost_state === 'estimated' || row.cost_state === 'reported')
  );
}

function reconcileOf(stats: GenerationStats): UsageReconcile {
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
        this.schedule(row);
      }
    });
    for (const row of options.ledger.pendingGenerations()) if (due(row)) this.schedule(row);
  }

  private schedule(row: AiUsageRow & { generation_id: string }): void {
    if (this.settling.has(row.id)) return;
    this.settling.add(row.id);
    const attempts =
      row.meta['cost_available'] === true ? REFINE_ATTEMPTS : Number.POSITIVE_INFINITY;
    background(
      this.settle(row.id, row.generation_id, attempts).finally((): void => {
        this.settling.delete(row.id);
      }),
      'reconciler.settle_failed',
    );
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe();
  }

  private async settle(id: string, generationId: string, attempts: number): Promise<void> {
    const { ledger, client, sleep, log } = this.options;
    try {
      const stats = await settledGeneration(client, generationId, sleep, attempts);
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
        reason: messageOf(cause),
      });
    }
  }
}
