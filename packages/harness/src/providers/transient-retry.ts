import { EMPTY_RESPONSE_CODE, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import type { LlmFailure, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';

export const RETRY_CEILING_MS = 30_000;
const RETRY_INITIAL_MS = 1000;
const RETRY_JITTER = 0.2;

const TRANSIENT_CODES: readonly string[] = [
  EMPTY_RESPONSE_CODE,
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
];

export const TRANSIENT_RETRY_POLICY: ResolvedRetryPolicy = resolveRetryPolicy(
  {
    mode: 'normal',
    maxRetries: Number.MAX_SAFE_INTEGER,
    retryableCodes: [...TRANSIENT_CODES],
    backoff: {
      initialDelayMs: RETRY_INITIAL_MS,
      maxDelayMs: RETRY_CEILING_MS,
      jitterRatio: RETRY_JITTER,
    },
  },
  'transient retry',
);

export const TRANSIENT_MESSAGE =
  /\b(?:408|425|429|500|502|503|504|529)\b|overloaded|upstream (?:error|connect|request)|provider returned error|temporarily|try again|at capacity|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

const PERMANENT_MESSAGE =
  /\b(?:400|401|402|403)\b|insufficient|credits?\b|unauthori[sz]ed|forbidden|invalid (?:api )?key|billing|payment/i;

export function retryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

export function transientDelayMs(
  attempt: number,
  retryAfter?: number | null,
  random: () => number = Math.random,
): number {
  if (retryAfter !== undefined && retryAfter !== null)
    return Math.min(retryAfter, RETRY_CEILING_MS);
  const base = Math.min(RETRY_INITIAL_MS * 2 ** attempt, RETRY_CEILING_MS);
  return Math.round(base * (1 + RETRY_JITTER * (random() * 2 - 1)));
}

export function transientFailure(failure: LlmFailure, retryAfter?: number): LlmFailure {
  const code =
    failure.code === 'PI_AI_ERROR' &&
    TRANSIENT_MESSAGE.test(failure.message) &&
    !PERMANENT_MESSAGE.test(failure.message)
      ? 'SERVER'
      : failure.code;
  const delayed =
    retryAfter !== undefined && TRANSIENT_CODES.includes(code)
      ? { providerRetryAfterMs: Math.min(retryAfter, RETRY_CEILING_MS) }
      : {};
  return { ...failure, code, ...delayed };
}

export async function* withTransientFailures(
  chunks: AsyncIterable<StreamChunk>,
  retryAfter: () => number | undefined,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of chunks) {
    if (chunk.type === 'finish' && chunk.reason.kind === 'error')
      yield {
        ...chunk,
        reason: { kind: 'error', failure: transientFailure(chunk.reason.failure, retryAfter()) },
      };
    else yield chunk;
  }
}
