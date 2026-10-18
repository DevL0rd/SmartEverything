import { setTimeout as delay } from 'node:timers/promises';
import { TRANSIENT_MESSAGE, transientDelayMs } from '@smarteverything/harness';
import { OpenRouterError } from './errors';

export interface TransientRetry {
  readonly signal: AbortSignal;
  readonly onRetry?: (cause: OpenRouterError, delayMs: number) => void;
}

function isTransient(cause: unknown): cause is OpenRouterError {
  return (
    cause instanceof OpenRouterError &&
    (cause.retryable || (cause.code === 'failed' && TRANSIENT_MESSAGE.test(cause.message)))
  );
}

export async function retryTransient<T>(
  run: (signal: AbortSignal) => Promise<T>,
  retry: TransientRetry,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    retry.signal.throwIfAborted();
    try {
      return await run(retry.signal);
    } catch (cause) {
      if (retry.signal.aborted) throw retry.signal.reason;
      if (!isTransient(cause)) throw cause;
      const wait = transientDelayMs(attempt, cause.retryAfterMs);
      retry.onRetry?.(cause, wait);
      await delay(wait, undefined, { signal: retry.signal }).catch(() => {
        throw retry.signal.reason;
      });
    }
  }
}
