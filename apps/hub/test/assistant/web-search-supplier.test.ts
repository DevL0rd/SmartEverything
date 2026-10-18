import { describe, expect, it } from 'vitest';
import { groundedTurn } from '../../src/assistant/web-search-supplier';
import { OpenRouterClient } from '../../src/openrouter/client';
import { withSignal } from '../../src/server/request-signal';

const REQUEST = {
  model: 'm',
  effort: null,
  messages: [{ role: 'user' as const, content: 'q' }],
  webSearch: true,
};

function clientOf(fetcher: typeof fetch): OpenRouterClient {
  return new OpenRouterClient({ key: (): string => 'k', fetch: fetcher });
}

describe('web search cancellation', () => {
  it('ends a stalled search as soon as the tool call is cancelled', async () => {
    const client = clientOf(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const controller = new AbortController();
    const search = withSignal(controller.signal, () => groundedTurn(client, REQUEST));
    setTimeout(() => {
      controller.abort(new Error('stopped'));
    }, 20);
    await expect(search).rejects.toThrow('stopped');
  });

  it('stops retrying a busy supplier when the tool call is cancelled', async () => {
    let calls = 0;
    const client = clientOf(() => {
      calls += 1;
      return Promise.resolve(
        Response.json(
          { error: { code: 429, message: 'Provider returned error' } },
          { status: 429, headers: { 'retry-after': '30' } },
        ),
      );
    });
    const controller = new AbortController();
    const search = withSignal(controller.signal, () => groundedTurn(client, REQUEST));
    setTimeout(() => {
      controller.abort(new Error('stopped'));
    }, 50);
    await expect(search).rejects.toThrow('stopped');
    expect(calls).toBe(1);
  });
});
