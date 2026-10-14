import { ImageOperationError } from '../assistant/image/errors';
import { IMAGE_RESPONSE_LIMIT } from './image-response';

export async function* imageStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let bytes = 0;
  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done)
        throw new ImageOperationError(
          'unknown',
          'The image stream ended without its terminal marker.',
        );
      bytes += next.value.length;
      if (bytes > IMAGE_RESPONSE_LIMIT)
        throw new ImageOperationError('limit', 'The image stream exceeded its byte limit.');
      pending = (pending + decoder.decode(next.value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = pending.indexOf('\n\n');
      while (boundary >= 0) {
        const event = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data !== '') yield data;
        if (data === '[DONE]') return;
        boundary = pending.indexOf('\n\n');
      }
    }
    signal.throwIfAborted();
  } finally {
    await reader.cancel();
  }
}
