import { createHash } from 'node:crypto';
import { MissingGeminiKeyError, type LiveOptions } from './gemini';

const RETRY_STEPS_MS = [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000] as const;
const RETRY_SLOW_MS = 300_000;
const RETRY_JITTER = 0.2;
const HANDLE_GONE = /session not found|expired/i;
const REFUSED = /api key|permission|unauthenticated|unauthorized|model.*not (found|supported)/i;
const SHORT_HASH = 12;

export type WarmPart =
  | 'model'
  | 'voice'
  | 'instruction'
  | 'tools'
  | 'webSearch'
  | 'automatic'
  | 'window'
  | 'resolution'
  | 'pauseMs';

export type WarmParts = Readonly<Record<WarmPart, string>>;

export class WarmConnectClosedError extends Error {
  override readonly name = 'WarmConnectClosedError';

  constructor(
    readonly reason: string,
    readonly code: number,
  ) {
    super(`Gemini closed the session before it was ready (${String(code)} ${reason})`);
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function shortHash(value: string): string {
  return digest(value).slice(0, SHORT_HASH);
}

export function partsOf(options: LiveOptions): WarmParts {
  return {
    model: options.model,
    voice: options.voice,
    instruction: digest(options.system),
    tools: digest(options.tools),
    webSearch: String(options.webSearch),
    automatic: String(options.automatic),
    window: digest(options.window),
    resolution: options.resolution ?? 'none',
    pauseMs: String(options.pauseMs ?? 'default'),
  };
}

export function changedParts(held: WarmParts, wanted: WarmParts): WarmPart[] {
  const names: readonly WarmPart[] = [
    'model',
    'voice',
    'instruction',
    'tools',
    'webSearch',
    'automatic',
    'window',
    'resolution',
    'pauseMs',
  ];
  return names.filter((name) => held[name] !== wanted[name]);
}

export function retryDelayMs(attempt: number, random: () => number): number {
  const step = RETRY_STEPS_MS[attempt] ?? RETRY_SLOW_MS;
  return Math.round(step * (1 + (random() * 2 - 1) * RETRY_JITTER));
}

export function refusedFor(cause: unknown): string | null {
  if (cause instanceof MissingGeminiKeyError) {
    return 'missing_key';
  }
  const message =
    cause instanceof WarmConnectClosedError
      ? cause.reason
      : cause instanceof Error
        ? cause.message
        : '';
  return !HANDLE_GONE.test(message) && REFUSED.test(message) ? 'refused' : null;
}

export class WarmSupersededError extends Error {
  override readonly name = 'WarmSupersededError';

  constructor() {
    super('A newer Gemini connection replaced this one');
  }
}
