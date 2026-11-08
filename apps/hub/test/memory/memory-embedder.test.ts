import { describe, expect, it } from 'vitest';
import { MEMORY_EMBEDDING_MODEL, OpenRouterMemoryEmbedder } from '../../src/memory/embedder';
import { OpenRouterClient } from '../../src/openrouter/client';

describe('the memory embedder', () => {
  it('uses an embedding model that is not served by OpenAI or Google', () => {
    expect(MEMORY_EMBEDDING_MODEL).toBe('qwen/qwen3-embedding-8b');
  });

  it('sends the texts with that model and returns the vectors in input order', async () => {
    const sent: unknown[] = [];
    const transport: typeof fetch = (_input, init) => {
      sent.push(JSON.parse(typeof init?.body === 'string' ? init.body : ''));
      return Promise.resolve(
        Response.json({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      );
    };
    const embedder = new OpenRouterMemoryEmbedder(
      new OpenRouterClient({ fetch: transport, key: (): string => 'key' }),
    );

    const vectors = await embedder.embed(['first', 'second']);

    expect(sent).toStrictEqual([{ model: 'qwen/qwen3-embedding-8b', input: ['first', 'second'] }]);
    expect(vectors.map((vector) => [...vector])).toStrictEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it.each([{ indexes: [0] }, { indexes: [0, 0] }, { indexes: [0, 2] }])(
    'refuses mismatched embedding indexes $indexes',
    async ({ indexes }) => {
      const transport: typeof fetch = () =>
        Promise.resolve(
          Response.json({ data: indexes.map((index) => ({ index, embedding: [1] })) }),
        );
      const embedder = new OpenRouterMemoryEmbedder(
        new OpenRouterClient({ fetch: transport, key: (): string => 'key' }),
      );

      await expect(embedder.embed(['first', 'second'])).rejects.toMatchObject({
        name: 'MemoryEmbeddingBatchError',
      });
    },
  );
});
