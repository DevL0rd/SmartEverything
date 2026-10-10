import type { GenerationStats } from './chat-types';
import type { OpenRouterClient } from './client';
import { OpenRouterError } from './errors';

export const GENERATION_WAITS_MS = [2000, 5000, 15_000, 45_000, 120_000] as const;

export async function settledGeneration(
  client: OpenRouterClient,
  id: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<GenerationStats | null> {
  for (const wait of GENERATION_WAITS_MS) {
    await sleep(wait);
    try {
      return await client.generation(id);
    } catch (cause) {
      const pending =
        cause instanceof OpenRouterError && (cause.code === 'not_found' || cause.retryable);
      if (!pending) {
        throw cause;
      }
    }
  }
  return null;
}
