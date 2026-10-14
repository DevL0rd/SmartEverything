import { z } from 'zod';
import { IMAGE_REQUEST_BYTES_MAX, IMAGE_OUTPUT_BYTES_MAX } from '@smarteverything/domain';
import { ImageOperationError } from '../assistant/image/errors';

export const IMAGE_RESPONSE_LIMIT = Math.ceil(IMAGE_OUTPUT_BYTES_MAX / 3) * 4 + 1024 * 1024;
export async function boundedText(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<string> {
  if (response.body === null)
    throw new ImageOperationError('unknown', 'The image provider returned no body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (!signal.aborted) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString('utf8');
      const chunk = z.instanceof(Uint8Array).parse(next.value);
      bytes += chunk.length;
      if (bytes > limit)
        throw new ImageOperationError('limit', 'The image response exceeded its byte limit.');
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    throw new ImageOperationError('cancelled', 'The image read was cancelled.');
  } finally {
    await reader.cancel();
  }
}
export function boundedBody(body: unknown): string {
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > IMAGE_REQUEST_BYTES_MAX)
    throw new ImageOperationError('limit', 'The image request exceeds its encoded byte limit.');
  return encoded;
}
export function parseImageJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ImageOperationError(
      'unknown',
      cause instanceof SyntaxError
        ? 'The image provider returned invalid JSON syntax.'
        : 'The image provider JSON could not be read.',
    );
  }
}
