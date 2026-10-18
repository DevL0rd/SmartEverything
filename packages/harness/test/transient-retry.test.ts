import { afterEach, describe, expect, it, vi } from 'vitest';
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry';
import type { LlmFailure, StreamChunk } from '@deepseek-ai/dsh-llm';
import {
  RETRY_CEILING_MS,
  TRANSIENT_RETRY_POLICY,
  retryAfterMs,
  transientDelayMs,
  transientFailure,
  withTransientFailures,
} from '../src/providers/transient-retry';

type Listener = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>;

function plugin(): {
  recover: (failure: LlmFailure, signal: AbortSignal) => Promise<unknown>;
  appended: string[];
} {
  const appended: string[] = [];
  let listener: Listener | undefined;
  const retries = new Map<string, unknown>();
  const ctx = {
    sessionProjections: {
      register: (): void => undefined,
      stateOf: (): Record<string, unknown> => Object.fromEntries(retries),
    },
    logger: { warn: (): void => undefined },
    on: (_name: string, fn: Listener): (() => void) => {
      listener = fn;
      return (): void => undefined;
    },
    effect: (): void => undefined,
  };
  Reflect.apply(LlmRetry.apply, undefined, [ctx]);
  const session = { append: (type: string): void => void appended.push(type) };
  return {
    appended,
    recover: (failure, signal) =>
      listener?.(
        {
          agent: { session },
          turn: 1,
          step: 1,
          provider: 'p',
          failure,
          retryPolicy: TRANSIENT_RETRY_POLICY,
          signal,
        },
        () => Promise.resolve('surfaced'),
      ) ?? Promise.resolve(undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

async function* asAsync(chunks: Iterable<StreamChunk>): AsyncGenerator<StreamChunk> {
  await Promise.resolve();
  yield* chunks;
}

describe('transient provider retry', () => {
  it('retries a transient failure and the next attempt can succeed', async () => {
    vi.useFakeTimers();
    const { recover, appended } = plugin();
    const pending = recover({ code: 'SERVER', message: 'HTTP 503' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(RETRY_CEILING_MS);
    expect(await pending).toEqual({ kind: 'retry' });
    expect(appended).toEqual(['llm/retry', 'llm/retry-started']);
  });

  it('ends the wait at once when the person presses Stop', async () => {
    vi.useFakeTimers();
    const { recover, appended } = plugin();
    const stop = new AbortController();
    const pending = recover({ code: 'RATE_LIMIT', message: '429' }, stop.signal);
    stop.abort();
    expect(await pending).toBeUndefined();
    expect(appended).toEqual(['llm/retry']);
  });

  it.each(['AUTH', 'INVALID_REQUEST', 'QUOTA_EXCEEDED', 'PI_AI_ERROR'])(
    'surfaces %s without retrying',
    async (code) => {
      const { recover, appended } = plugin();
      expect(await recover({ code, message: 'nope' }, new AbortController().signal)).toBe(
        'surfaced',
      );
      expect(appended).toEqual([]);
    },
  );

  it('waits the provider Retry-After, capped at the ceiling', async () => {
    vi.useFakeTimers();
    const { recover, appended } = plugin();
    const failure = transientFailure({ code: 'RATE_LIMIT', message: '429' }, 5000);
    const pending = recover(failure, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4999);
    expect(appended).toEqual(['llm/retry']);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: 'retry' });
    expect(transientFailure({ code: 'SERVER', message: 'x' }, 600_000).providerRetryAfterMs).toBe(
      RETRY_CEILING_MS,
    );
    expect(retryAfterMs('7')).toBe(7000);
    expect(retryAfterMs(null)).toBeUndefined();
  });
});

describe('failure classification', () => {
  it.each([
    'Provider returned error',
    'HTTP 408 Request Timeout',
    '425 Too Early',
    'The model is overloaded',
    'No endpoints available temporarily',
    'upstream error from provider',
  ])('treats "%s" as transient', (message) => {
    expect(transientFailure({ code: 'PI_AI_ERROR', message }).code).toBe('SERVER');
  });

  it('leaves permanent failures and unrelated messages alone', () => {
    expect(
      transientFailure({ code: 'PI_AI_ERROR', message: 'content policy violation' }).code,
    ).toBe('PI_AI_ERROR');
    expect(transientFailure({ code: 'AUTH', message: '401 overloaded' }).code).toBe('AUTH');
  });

  it.each([
    'Insufficient credits, please try again after adding more',
    '402 Payment required: provider returned error',
    '401 Unauthorized, provider returned error',
    'Invalid API key, try again',
  ])('never retries the permanent auth or credit failure "%s"', (message) => {
    expect(transientFailure({ code: 'PI_AI_ERROR', message }).code).toBe('PI_AI_ERROR');
  });

  it('rewrites only the terminal error chunk of a stream', async () => {
    function* source(): Generator<StreamChunk> {
      yield { type: 'text-delta', index: 0, text: 'hi' };
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: { code: 'PI_AI_ERROR', message: 'Provider returned error' },
        },
      };
    }
    const out: StreamChunk[] = [];
    for await (const chunk of withTransientFailures(asAsync(source()), () => 2000)) out.push(chunk);
    expect(out[0]).toEqual({ type: 'text-delta', index: 0, text: 'hi' });
    expect(out[1]).toMatchObject({
      reason: { failure: { code: 'SERVER', providerRetryAfterMs: 2000 } },
    });
  });
});

describe('transientDelayMs', () => {
  it('doubles to the ceiling, jittered by at most 20 percent', () => {
    expect(transientDelayMs(0, null, () => 0.5)).toBe(1000);
    expect(transientDelayMs(2, null, () => 0.5)).toBe(4000);
    expect(transientDelayMs(40, null, () => 1)).toBe(RETRY_CEILING_MS * 1.2);
    expect(transientDelayMs(1, null, () => 0)).toBe(1600);
  });

  it('honours Retry-After up to the ceiling', () => {
    expect(transientDelayMs(5, 2500)).toBe(2500);
    expect(transientDelayMs(0, 120_000)).toBe(RETRY_CEILING_MS);
  });
});
