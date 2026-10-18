import { googleModelIdOf, type AiUsageRow } from '@smarteverything/domain';
import { rateOf, type PriceBook } from './gemini-live';
import type { Ledger } from './ledger';

export interface SpokenLine {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly callId: string;
  readonly model: string;
  readonly characters: number;
  readonly inputTokens: number;
  readonly audioTokens: number;
  readonly audioMs: number;
}

export function recordSpeech(ledger: Ledger, prices: PriceBook, line: SpokenLine): AiUsageRow {
  const modelId = googleModelIdOf(line.model);
  const pricing = prices.priceOf(modelId);
  const micros =
    line.inputTokens * rateOf(pricing, modelId, 'input_per_mtok') +
    line.audioTokens * rateOf(pricing, modelId, 'audio_out_per_mtok');
  return ledger.record({
    profile_id: line.profileId,
    client_id: line.clientId,
    call_id: line.callId,
    source: 'gemini',
    work: 'speak',
    model_id: modelId,
    tokens_in: line.inputTokens,
    tokens_out: line.audioTokens,
    audio_out_ms: line.audioMs,
    cost_micros: Math.round(micros),
    cost_state: 'reported',
    meta: { characters: line.characters },
  });
}
