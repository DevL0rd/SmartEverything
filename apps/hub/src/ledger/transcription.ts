import { microsOfUsd, type JsonValue } from '@smarteverything/domain';
import type { TranscriptionAnswer } from '../openrouter/transcription';
import type { Ledger } from './ledger';

export interface TranscriptionCharge {
  readonly profileId: string;
  readonly pluginId: string | null;
  readonly messageId: string | null;
  readonly model: string;
  readonly answer: TranscriptionAnswer;
  readonly audioMs?: number;
  readonly meta: Readonly<Record<string, JsonValue>>;
}

function usageMeta(answer: TranscriptionAnswer): Readonly<Record<string, JsonValue>> {
  const usage = answer.usage;
  const seconds = usage?.seconds;
  const cost = usage?.cost;
  return {
    cost_available: cost !== undefined,
    usage_available: usage !== null,
    ...(seconds === undefined ? {} : { seconds }),
    ...(cost === undefined ? {} : { cost_usd: cost }),
  };
}

function audioMillis(charge: TranscriptionCharge): number {
  const seconds = charge.answer.usage?.seconds;
  return seconds === undefined ? (charge.audioMs ?? 0) : Math.round(seconds * 1000);
}

export function recordAudioTranscription(ledger: Ledger, charge: TranscriptionCharge): void {
  const usage = charge.answer.usage;
  const cost = usage?.cost;
  ledger.record({
    source: 'openrouter',
    work: 'transcribe',
    profile_id: charge.profileId,
    plugin_id: charge.pluginId,
    message_id: charge.messageId,
    model_id: charge.model,
    tokens_in: usage?.input_tokens ?? 0,
    tokens_out: usage?.output_tokens ?? 0,
    audio_in_ms: audioMillis(charge),
    cost_micros: cost === undefined ? 0 : microsOfUsd(cost),
    cost_state: cost === undefined ? 'estimated' : 'reported',
    meta: { ...charge.meta, ...usageMeta(charge.answer) },
  });
}
