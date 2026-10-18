import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterMediaNotes } from '../../src/openrouter/media-notes';
import { OpenRouterError } from '../../src/openrouter/errors';

const BUSY = (): Response =>
  Response.json(
    { error: { code: 429, message: 'Provider returned error' } },
    { status: 429, headers: { 'retry-after': '0.01' } },
  );
const CAPTION = (): Response =>
  Response.json({ id: 'gen-1', choices: [{ message: { content: 'a cat' } }] });

function clientOf(replies: readonly (() => Response)[]): {
  readonly client: OpenRouterClient;
  readonly calls: () => number;
} {
  const queue = [...replies];
  let calls = 0;
  const client = new OpenRouterClient({
    key: (): string => 'k',
    fetch: (): Promise<Response> => {
      calls += 1;
      return Promise.resolve((queue.shift() ?? CAPTION)());
    },
  });
  return { client, calls: (): number => calls };
}

const IMAGE = { model: 'm', prompt: 'p', mime: 'video/mp4', data: Buffer.from('x') };

describe('transient OpenRouter retries', () => {
  it('retries a busy provider until the media note succeeds', async () => {
    const { client, calls } = clientOf([BUSY, BUSY, BUSY]);
    const answer = await new OpenRouterMediaNotes(client).describe(IMAGE);
    expect(answer.text).toBe('a cat');
    expect(calls()).toBe(4);
  });

  it('retries a provider error that arrives inside a 200 body', async () => {
    const { client, calls } = clientOf([
      (): Response => Response.json({ error: { code: 502, message: 'Provider returned error' } }),
    ]);
    const answer = await new OpenRouterMediaNotes(client).describe(IMAGE);
    expect(answer.text).toBe('a cat');
    expect(calls()).toBe(2);
  });

  it('stops waiting the moment the caller aborts', async () => {
    const { client, calls } = clientOf(Array.from({ length: 50 }, () => BUSY));
    const stop = new AbortController();
    const retrying = client.retrying(
      (signal) => client.json({ path: '/x', signal }, z.unknown(), 'x'),
      stop.signal,
    );
    setTimeout(() => {
      stop.abort(new Error('stopped'));
    }, 50);
    await expect(retrying).rejects.toThrow('stopped');
    expect(calls()).toBeLessThan(50);
  });

  it('stops everything when the service shuts down', async () => {
    const shutdown = new AbortController();
    const client = new OpenRouterClient({
      key: (): string => 'k',
      fetch: (): Promise<Response> => Promise.resolve(BUSY()),
      shutdown: shutdown.signal,
    });
    const retrying = new OpenRouterMediaNotes(client).describe(IMAGE);
    setTimeout(() => {
      shutdown.abort(new Error('stopping'));
    }, 50);
    await expect(retrying).rejects.toThrow('stopping');
  });

  it('surfaces a rejected key at once with the provider message', async () => {
    const { client, calls } = clientOf([
      (): Response => Response.json({ error: { message: 'bad key' } }, { status: 401 }),
    ]);
    const failure = await new OpenRouterMediaNotes(client).describe(IMAGE).catch((c: unknown) => c);
    expect(failure).toBeInstanceOf(OpenRouterError);
    expect(failure).toMatchObject({ code: 'unauthorized' });
    expect(calls()).toBe(1);
  });
});
