import { MediaModality, type ModalityTokenCount, type UsageMetadata } from '@google/genai';
import {
  googleModelIdOf,
  type AiPricing,
  type AiUsageRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { Ledger } from './ledger';

export interface PriceBook {
  readonly priceOf: (modelId: string) => AiPricing;
}

export interface LiveTurn {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly callId: string;
  readonly chatId: string | null;
  readonly messageId: string | null;
  readonly model: string;
  readonly usage: UsageMetadata;
}

export class MissingPriceError extends Error {
  override readonly name = 'MissingPriceError';

  constructor(modelId: string, rate: string) {
    super(`There is no ${rate} price for ${modelId}; add it in Settings › AI › Prices.`);
  }
}

type Rate =
  | 'input_per_mtok'
  | 'output_per_mtok'
  | 'audio_in_per_mtok'
  | 'audio_out_per_mtok'
  | 'video_in_per_mtok';

const AUDIO_TOKENS_PER_SECOND = 32;

type Rates = ReadonlyMap<MediaModality, Rate>;

const PROMPT_RATES: Rates = new Map([
  [MediaModality.TEXT, 'input_per_mtok'],
  [MediaModality.DOCUMENT, 'input_per_mtok'],
  [MediaModality.AUDIO, 'audio_in_per_mtok'],
  [MediaModality.IMAGE, 'video_in_per_mtok'],
  [MediaModality.VIDEO, 'video_in_per_mtok'],
]);

const RESPONSE_RATES: Rates = new Map([
  [MediaModality.TEXT, 'output_per_mtok'],
  [MediaModality.AUDIO, 'audio_out_per_mtok'],
]);

interface Priced {
  micros: number;
  estimated: boolean;
}

function rateOf(pricing: AiPricing, modelId: string, rate: Rate): number {
  const value = pricing[rate];
  if (value === null) {
    throw new MissingPriceError(modelId, rate);
  }
  return value;
}

function tokensOf(details: readonly ModalityTokenCount[], modality: MediaModality): number {
  return details
    .filter((detail) => detail.modality === modality)
    .reduce((total, detail) => total + (detail.tokenCount ?? 0), 0);
}

interface Side {
  readonly total: number;
  readonly details: readonly ModalityTokenCount[];
  readonly rates: Rates;
  readonly unbroken: Rate;
}

function priceSide(side: Side, rate: (name: Rate) => number): Priced {
  const { total, details, rates, unbroken } = side;
  let micros = 0;
  let explained = 0;
  for (const detail of details) {
    const name = detail.modality === undefined ? undefined : rates.get(detail.modality);
    if (name === undefined) {
      continue;
    }
    const tokens = detail.tokenCount ?? 0;
    micros += tokens * rate(name);
    explained += tokens;
  }
  const rest = Math.max(0, total - explained);
  return { micros: micros + rest * rate(unbroken), estimated: rest > 0 };
}

function promptTokens(usage: UsageMetadata): number {
  return (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0);
}

function promptDetails(usage: UsageMetadata): ModalityTokenCount[] {
  return [...(usage.promptTokensDetails ?? []), ...(usage.toolUsePromptTokensDetails ?? [])];
}

function priceTurn(usage: UsageMetadata, modelId: string, pricing: AiPricing): Priced {
  const rate = (name: Rate): number => rateOf(pricing, modelId, name);
  const prompt = priceSide(
    {
      total: promptTokens(usage),
      details: promptDetails(usage),
      rates: PROMPT_RATES,
      unbroken: 'input_per_mtok',
    },
    rate,
  );
  const response = priceSide(
    {
      total: usage.responseTokenCount ?? 0,
      details: usage.responseTokensDetails ?? [],
      rates: RESPONSE_RATES,
      unbroken: 'output_per_mtok',
    },
    rate,
  );
  const thoughts = (usage.thoughtsTokenCount ?? 0) * rate('output_per_mtok');
  return {
    micros: Math.round(prompt.micros + response.micros + thoughts),
    estimated: prompt.estimated || response.estimated,
  };
}

function audioMs(tokens: number): number {
  return Math.round((tokens * 1000) / AUDIO_TOKENS_PER_SECOND);
}

function detailsOf(details: readonly ModalityTokenCount[] | undefined): Record<string, number> {
  return Object.fromEntries(
    (details ?? []).map((detail) => [detail.modality ?? 'UNSPECIFIED', detail.tokenCount ?? 0]),
  );
}

function metaOf(usage: UsageMetadata): Record<string, JsonValue> {
  return {
    total_tokens: usage.totalTokenCount ?? 0,
    prompt_tokens: usage.promptTokenCount ?? 0,
    tool_prompt_tokens: usage.toolUsePromptTokenCount ?? 0,
    prompt_details: detailsOf(usage.promptTokensDetails),
    response_details: detailsOf(usage.responseTokensDetails),
  };
}

export function recordLiveTurn(ledger: Ledger, prices: PriceBook, turn: LiveTurn): AiUsageRow {
  const { usage } = turn;
  const modelId = googleModelIdOf(turn.model);
  const priced = priceTurn(usage, modelId, prices.priceOf(modelId));
  return ledger.record({
    profile_id: turn.profileId,
    client_id: turn.clientId,
    chat_id: turn.chatId,
    message_id: turn.messageId,
    call_id: turn.callId,
    source: 'gemini_live',
    work: 'voice',
    model_id: modelId,
    tokens_in: promptTokens(usage),
    tokens_out: usage.responseTokenCount ?? 0,
    tokens_cached: usage.cachedContentTokenCount ?? 0,
    tokens_reasoning: usage.thoughtsTokenCount ?? 0,
    audio_in_ms: audioMs(tokensOf(promptDetails(usage), MediaModality.AUDIO)),
    audio_out_ms: audioMs(tokensOf(usage.responseTokensDetails ?? [], MediaModality.AUDIO)),
    cost_micros: priced.micros,
    cost_state: priced.estimated ? 'estimated' : 'reported',
    meta: metaOf(usage),
  });
}
