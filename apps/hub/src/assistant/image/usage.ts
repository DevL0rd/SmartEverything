import { MICROS_PER_USD, type ImageOperationReceipt } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export function recordImageUsage(
  store: Store,
  receipt: ImageOperationReceipt,
): ImageOperationReceipt {
  if (receipt.usage_ledger_id !== null) return receipt;
  const cost = receipt.usage?.['cost'];
  if (cost === undefined) return receipt;
  const micros = Math.round(cost * MICROS_PER_USD);
  const row = store.ledger.record({
    profile_id: receipt.profile_id,
    client_id: receipt.origin?.client_id ?? null,
    plugin_id: receipt.origin?.plugin_id ?? null,
    chat_id: receipt.chat_id,
    message_id: receipt.message_id,
    source: 'openrouter',
    work: 'image',
    model_id: receipt.request.model,
    generation_id: null,
    images: receipt.results.length,
    cost_micros: micros,
    cost_state: 'reported',
    meta: {
      image_operation_id: receipt.id,
      provider_tag: receipt.endpoint.provider_tag,
      image_outcome: receipt.state,
      usage_source: receipt.usage_source,
      usage_complete: receipt.usage_complete,
      provider_usage: receipt.usage,
    },
  });
  return { ...receipt, usage_ledger_id: row.id };
}
