import { describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';
import { settledGeneration } from '../../src/openrouter/generation';

const FOUND = {
  data: {
    id: 'gen-1',
    model: 'm',
    total_cost: 0.5,
    cache_discount: null,
    upstream_inference_cost: null,
    tokens_prompt: 1,
    tokens_completion: 1,
    native_tokens_prompt: 1,
    native_tokens_completion: 1,
    native_tokens_reasoning: 0,
    native_tokens_cached: 0,
    native_tokens_completion_images: null,
    num_media_prompt: null,
    num_media_completion: null,
    num_input_audio_prompt: null,
    num_search_results: null,
    provider_name: null,
    finish_reason: null,
    latency: null,
    generation_time: null,
    created_at: '2026-10-16T00:00:00.000Z',
    is_byok: false,
  },
};

function clientOf(failures: readonly Response[]): OpenRouterClient {
  const queue = [...failures];
  return new OpenRouterClient({
    key: (): string => 'k',
    fetch: (): Promise<Response> => Promise.resolve(queue.shift() ?? Response.json(FOUND)),
  });
}

const missing = (): Response =>
  Response.json({ error: { message: 'x', code: 404 } }, { status: 404 });

describe('settledGeneration', () => {
  it('keeps asking until the provider has the generation and honours Retry-After', async () => {
    const waits: number[] = [];
    const busy = Response.json(
      { error: { message: 'x', code: 429 } },
      { status: 429, headers: { 'retry-after': '90' } },
    );
    const sleep = (ms: number): Promise<void> => {
      waits.push(ms);
      return Promise.resolve();
    };
    const failures = [...Array.from({ length: 8 }, missing), busy];

    const stats = await settledGeneration(clientOf(failures), 'gen-1', sleep);

    expect(stats?.totalCost).toBe(0.5);
    expect(waits).toHaveLength(10);
    expect(Math.max(...waits)).toBe(90_000);
    expect(waits.slice(0, 6)).toStrictEqual([2000, 4000, 8000, 16_000, 30_000, 30_000]);
  });

  it('gives up after the given attempts for refinement only', async () => {
    const stats = await settledGeneration(
      clientOf(Array.from({ length: 9 }, missing)),
      'g',
      () => Promise.resolve(),
      3,
    );

    expect(stats).toBeNull();
  });

  it('throws errors that waiting cannot fix', async () => {
    const denied = Response.json({ error: { message: 'x', code: 401 } }, { status: 401 });

    await expect(
      settledGeneration(clientOf([denied]), 'g', () => Promise.resolve()),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
