import { OpenRouterEmbeddings } from '../openrouter/embeddings';
import type { OpenRouterClient } from '../openrouter/client';

export const MEMORY_EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';

export interface MemoryEmbedder {
  readonly model: string;
  readonly embed: (texts: readonly string[]) => Promise<Float32Array[]>;
}

export class OpenRouterMemoryEmbedder implements MemoryEmbedder {
  readonly model = MEMORY_EMBEDDING_MODEL;
  private readonly embeddings: OpenRouterEmbeddings;

  constructor(client: OpenRouterClient) {
    this.embeddings = new OpenRouterEmbeddings(client);
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    return (await this.embeddings.embed({ model: this.model, input: texts })).vectors;
  }
}
