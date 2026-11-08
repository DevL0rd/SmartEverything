import { JSON_VALUE, microsOfUsd, ApiError } from '@smarteverything/domain';
import type { AiUsageRow } from '@smarteverything/domain';
import type { SupplierUsage, SupplierUsageSnapshot } from './metered-usage';

export type LedgerTokens = Pick<
  AiUsageRow,
  'tokens_in' | 'tokens_out' | 'tokens_cached' | 'tokens_reasoning'
>;
export type LedgerChange = Partial<
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
>;

export function supplierTokens(usage: SupplierUsage): LedgerTokens {
  return {
    tokens_in: usage.prompt_tokens,
    tokens_out: usage.completion_tokens,
    tokens_cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
    tokens_reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

export function ledgerChange(
  snapshot: SupplierUsageSnapshot,
  previous: AiUsageRow,
  tokensFromDsh: boolean,
): LedgerChange {
  const usage = snapshot.usage;
  if (usage === null) return { generation_id: snapshot.generationId };
  const cost = costOf(usage, previous);
  return {
    generation_id: snapshot.generationId,
    ...(tokensFromDsh ? {} : supplierTokens(usage)),
    cost_micros: cost.micros,
    cost_state: cost.state,
    meta: {
      cost_available: cost.available,
      usage_available: true,
      ...(tokensFromDsh ? {} : { tokens_source: 'supplier' }),
      provider_usage: JSON_VALUE.parse(usage),
      supplier_model: snapshot.model,
    },
  };
}

function costOf(
  usage: SupplierUsage,
  previous: AiUsageRow,
): {
  readonly micros: number;
  readonly state: AiUsageRow['cost_state'];
  readonly available: boolean;
} {
  const cost = usage.cost ?? null;
  const micros = cost === null ? previous.cost_micros : microsOfUsd(cost);
  if (!Number.isSafeInteger(micros))
    throw new ApiError('upstream_failed', 'Reported supplier cost exceeds the accounting range.');
  return {
    micros,
    state: cost === null ? previous.cost_state : 'reported',
    available: cost !== null || previous.meta['cost_available'] === true,
  };
}
