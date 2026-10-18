import {
  SIGHT_SAMPLING,
  SIGHT_TOKENS_PER_FRAME,
  UnknownGoogleModelError,
  googleModelIdOf,
  googleModelOf,
  sightEstimate,
  type SightEstimate,
  type SightMode,
  type SightSource,
} from '@smarteverything/domain';
import type { Money } from '../../../region';

const TOKENS_PER_THOUSAND = 1000;
const CENTS_PER_DOLLAR = 100;

export function videoPriceOf(apiModel: string): number | null {
  try {
    return googleModelOf(googleModelIdOf(apiModel)).pricing.video_in_per_mtok;
  } catch (error) {
    if (error instanceof UnknownGoogleModelError) {
      return null;
    }
    throw error;
  }
}

function approxCostText(dollars: number, money: Money): string {
  const text = money.dollars(dollars);
  return text.startsWith('<') ? `under ${text.slice(1)}` : `about ${text}`;
}

function tokensText(tokens: number): string {
  return tokens < TOKENS_PER_THOUSAND
    ? `${String(tokens)} tokens`
    : `${(tokens / TOKENS_PER_THOUSAND).toFixed(1)}k tokens`;
}

export function memoryText(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0
    ? `${String(seconds / 60)} min`
    : `${String(seconds)} s`;
}

export interface CallCostInput {
  readonly mode: SightMode;
  readonly memorySeconds: number;
  readonly source: SightSource;
  readonly dollarsPerMtok: number | null;
  readonly money: Money;
}

export interface CallCost {
  readonly estimate: SightEstimate;
  readonly rate: string;
}

export function callCostOf(input: CallCostInput): CallCost | null {
  if (input.dollarsPerMtok === null) {
    return null;
  }
  const resolution = SIGHT_SAMPLING[input.source].resolution;
  const estimate = sightEstimate({
    mode: input.mode,
    memorySeconds: input.memorySeconds,
    resolution,
    dollarsPerMtok: input.dollarsPerMtok,
  });
  return {
    estimate,
    rate:
      input.mode === 'live'
        ? `${approxCostText(estimate.centsPerMinute / CENTS_PER_DOLLAR, input.money)} a minute`
        : `${approxCostText(estimate.centsPerStill / CENTS_PER_DOLLAR, input.money)} a still`,
  };
}

export function memoryTokensText(source: SightSource, seconds: number): string {
  return tokensText(seconds * SIGHT_TOKENS_PER_FRAME[SIGHT_SAMPLING[source].resolution]);
}
