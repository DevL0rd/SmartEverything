import type { StreamChunk } from '@deepseek-ai/dsh-llm';

export function piUsageChunk(chunk: StreamChunk): StreamChunk {
  if (chunk.type !== 'usage' || chunk.usage.cacheReadTokens !== undefined) return chunk;
  return { ...chunk, usage: { ...chunk.usage, cacheReadTokens: 0 } };
}

export async function* piUsageChunks(
  chunks: AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of chunks) yield piUsageChunk(chunk);
}
