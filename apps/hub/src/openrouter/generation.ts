import type { GenerationStats } from './chat-types';
import type { OpenRouterClient } from './client';
import { OpenRouterError } from './errors';

const FIRST_WAIT_MS = 2000;
const WAIT_CEILING_MS = 30_000;

export async function settledGeneration(
  client: OpenRouterClient,
  id: string,
  sleep: (milliseconds: number) => Promise<void>,
  attempts: number = Number.POSITIVE_INFINITY,
): Promise<GenerationStats | null> {
  let wait = FIRST_WAIT_MS;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(wait);
    try {
      return await client.generation(id);
    } catch (cause) {
      const pending =
        cause instanceof OpenRouterError && (cause.code === 'not_found' || cause.retryable);
      if (!pending) {
        throw cause;
      }
      wait = Math.max(cause.retryAfterMs ?? 0, Math.min(wait * 2, WAIT_CEILING_MS));
    }
  }
  return null;
}
