import { HarnessRuntimeError } from '../host/errors';
import { z } from 'zod';

const MAX_HTTP_CHUNKS = 16_384;

export async function readSkillSourceHttp(
  url: string,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'error', signal });
  if (!response.ok || response.body === null)
    throw new HarnessRuntimeError('operation_failed', 'Pinned skill source is unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (!signal.aborted) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes = z.instanceof(Uint8Array).parse(chunk.value);
      size += bytes.byteLength;
      if (size > limit || chunks.length >= MAX_HTTP_CHUNKS)
        throw new HarnessRuntimeError(
          'operation_failed',
          'Pinned skill source exceeds the bounded byte limit.',
        );
      chunks.push(bytes);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
