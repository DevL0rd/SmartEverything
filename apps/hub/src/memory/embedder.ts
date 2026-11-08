import { z } from 'zod';
import type { OpenRouterClient } from '../openrouter/client';

export const MEMORY_EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';

export interface MemoryEmbedder {
  readonly model: string;
  readonly embed: (texts: readonly string[]) => Promise<Float32Array[]>;
}

const ANSWER = z.object({
  data: z.array(z.object({ index: z.int().nonnegative(), embedding: z.array(z.number()).min(1) })),
});

class MemoryEmbeddingBatchError extends Error {
  override readonly name = 'MemoryEmbeddingBatchError';

  constructor(
    readonly expected: number,
    readonly received: readonly number[],
  ) {
    super('The memory embedding response did not contain exactly one vector per input.');
  }
}

export class OpenRouterMemoryEmbedder implements MemoryEmbedder {
  readonly model = MEMORY_EMBEDDING_MODEL;

  constructor(private readonly client: OpenRouterClient) {}

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    const answer = await this.client.retrying((signal) =>
      this.client.json(
        {
          path: '/embeddings',
          method: 'POST',
          signal,
          body: { model: this.model, input: texts },
        },
        ANSWER,
        'memory embeddings',
      ),
    );
    const ordered = answer.data.toSorted((a, b) => a.index - b.index);
    if (ordered.length !== texts.length || ordered.some((row, index) => row.index !== index))
      throw new MemoryEmbeddingBatchError(
        texts.length,
        ordered.map((row) => row.index),
      );
    return ordered.map((row) => Float32Array.from(row.embedding));
  }
}
