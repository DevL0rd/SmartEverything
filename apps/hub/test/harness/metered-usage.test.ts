import { describe, expect, it, vi } from 'vitest';
import { MeteredUsageStream, type SupplierUsageSnapshot } from '../../src/harness/metered-usage';

async function drain(response: Response): Promise<void> {
  await response.text();
}

const frame = (body: unknown): string => `data: ${JSON.stringify(body)}\n\n`;

describe('MeteredUsageStream', () => {
  it('carries the inline cost of the final chunk', async () => {
    const seen: SupplierUsageSnapshot[] = [];
    const body =
      frame({ id: 'gen-9', model: 'm', choices: [] }) +
      frame({
        id: 'gen-9',
        model: 'm',
        usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.25 },
      });
    await drain(
      new MeteredUsageStream((snapshot): void => {
        seen.push(snapshot);
      }).response(new Response(body)),
    );

    expect(seen.at(-1)?.generationId).toBe('gen-9');
    expect(seen.at(-1)?.usage?.cost).toBe(0.25);
  });

  it('reads a supplier frame larger than the old two megabyte limit without failing the reply', async () => {
    const seen: SupplierUsageSnapshot[] = [];
    const filler = 'x'.repeat(3 * 1024 * 1024);
    const body =
      frame({ id: 'gen-1', model: 'm', choices: [{ delta: { content: filler } }] }) +
      frame({ id: 'gen-1', model: 'm', usage: { prompt_tokens: 1, completion_tokens: 1 } });

    const text = await new MeteredUsageStream((snapshot): void => {
      seen.push(snapshot);
    })
      .response(new Response(body))
      .text();

    expect(text).toBe(body);
    expect(seen.at(-1)?.usage?.prompt_tokens).toBe(1);
  });

  it('ignores comment lines and the end marker and passes every byte on', async () => {
    const seen: SupplierUsageSnapshot[] = [];
    const body =
      ': OPENROUTER PROCESSING\n\n' +
      frame({ id: 'gen-2', model: 'm', usage: { prompt_tokens: 2, completion_tokens: 3 } }) +
      'data: [DONE]\n\n';

    const text = await new MeteredUsageStream((snapshot): void => {
      seen.push(snapshot);
    })
      .response(new Response(body))
      .text();

    expect(text).toBe(body);
    expect(seen).toHaveLength(1);
  });

  it('keeps the reply flowing when one frame is not what the supplier promised', async () => {
    const seen: SupplierUsageSnapshot[] = [];
    const body =
      'data: {not json}\n\n' +
      frame({ id: 7 }) +
      frame({ id: 'gen-3', model: 'm', usage: { prompt_tokens: 4, completion_tokens: 1 } });

    const text = await new MeteredUsageStream((snapshot): void => {
      seen.push(snapshot);
    })
      .response(new Response(body))
      .text();

    expect(text).toBe(body);
    expect(seen.at(-1)?.generationId).toBe('gen-3');
  });

  it('merges usage details that arrive in separate frames of one generation', async () => {
    const seen: SupplierUsageSnapshot[] = [];
    const body =
      frame({
        id: 'gen-4',
        model: 'm',
        usage: {
          prompt_tokens: 5,
          completion_tokens: 1,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }) +
      frame({
        id: 'gen-4',
        model: 'm',
        usage: {
          prompt_tokens: 5,
          completion_tokens: 1,
          prompt_tokens_details: { cache_write_tokens: 1 },
          completion_tokens_details: { reasoning_tokens: 1 },
        },
      }) +
      frame({ id: 'gen-4', model: 'm', choices: [] });

    await new MeteredUsageStream((snapshot): void => {
      seen.push(snapshot);
    })
      .response(new Response(body))
      .text();

    expect(seen).toHaveLength(2);
    expect(seen.at(-1)?.usage).toMatchObject({
      prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 1 },
      completion_tokens_details: { reasoning_tokens: 1 },
    });
  });

  it('does not touch a failed supplier response', () => {
    const failed = new Response('nope', { status: 500 });

    expect(new MeteredUsageStream(vi.fn()).response(failed)).toBe(failed);
  });
});
