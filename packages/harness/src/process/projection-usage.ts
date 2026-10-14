import { SUPPLIER_USAGE } from './metered-usage';
import type { SupplierUsage } from './metered-usage';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { AiHarnessEvent } from '@smarteverything/domain';
import { z } from 'zod';

export function supplierFacts(
  usage: TokenUsage,
): Pick<Extract<AiHarnessEvent, { kind: 'usage' }>['usage'], 'cost_usd' | 'generation_id'> {
  const supplier = z
    .object({
      supplier: z.object({ generationId: z.string(), usage: SUPPLIER_USAGE.nullable() }).optional(),
    })
    .parse(usage).supplier;
  return { cost_usd: supplier?.usage?.cost ?? null, generation_id: supplier?.generationId ?? null };
}
export function cacheFacts(
  usage: TokenUsage,
): Pick<
  Extract<AiHarnessEvent, { kind: 'usage' }>['usage'],
  'cache_read_tokens' | 'cache_write_tokens' | 'reasoning_tokens'
> {
  const supplier = z
    .object({ supplier: z.object({ usage: SUPPLIER_USAGE.nullable() }).optional() })
    .parse(usage).supplier;
  if (supplier?.usage !== undefined && supplier.usage !== null)
    return suppliedCacheFacts(supplier.usage);
  return {
    cache_read_tokens: usage.cacheReadTokens ?? null,
    cache_write_tokens: usage.cacheWriteTokens ?? null,
    reasoning_tokens: usage.reasoningTokens ?? null,
  };
}

function suppliedCacheFacts(usage: SupplierUsage): ReturnType<typeof cacheFacts> {
  return {
    cache_read_tokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    cache_write_tokens: usage.prompt_tokens_details?.cache_write_tokens ?? null,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
}
