import { microsOfUsd, type AiUsageRow, type JsonValue } from '@smarteverything/domain';
import type { OrUsage } from '../openrouter/wire';
import type { MediaNoteAnswer } from '../transcripts/media-notes';
import type { Ledger } from './ledger';

interface MediaNoteCharge {
  readonly profileId: string;
  readonly messageId: string | null;
  readonly pluginId: null;
  readonly model: string;
  readonly answer: MediaNoteAnswer;
  readonly meta: Readonly<Record<string, JsonValue>>;
}

export function tokenMeters(
  usage: OrUsage | null,
): Pick<AiUsageRow, 'tokens_in' | 'tokens_out' | 'tokens_cached' | 'tokens_reasoning'> {
  if (usage === null) return { tokens_in: 0, tokens_out: 0, tokens_cached: 0, tokens_reasoning: 0 };
  return {
    tokens_in: usage.prompt_tokens,
    tokens_out: usage.completion_tokens,
    tokens_cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
    tokens_reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

export function recordMediaNote(ledger: Ledger, charge: MediaNoteCharge): void {
  const { usage } = charge.answer;
  const cost = usage?.cost ?? null;
  ledger.record({
    source: 'openrouter',
    work: 'transcribe',
    profile_id: charge.profileId,
    message_id: charge.messageId,
    plugin_id: charge.pluginId,
    model_id: charge.model,
    generation_id: charge.answer.generationId ?? null,
    ...tokenMeters(usage),
    cost_micros: cost === null ? 0 : microsOfUsd(cost),
    cost_state: cost === null ? 'estimated' : 'reported',
    meta: {
      ...charge.meta,
      cost_available: cost !== null,
      usage_available: usage !== null,
      ...(cost === null ? {} : { cost_usd: cost }),
    },
  });
}
