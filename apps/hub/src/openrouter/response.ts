import { z } from 'zod';
import { openRouterError } from './errors';

export async function responseText(response: Response, limit?: number): Promise<string> {
  if (limit === undefined) return response.text();
  if (response.body === null) throw openRouterError('unreadable', 'empty response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString('utf8');
      const chunk = z.instanceof(Uint8Array).parse(next.value);
      bytes += chunk.byteLength;
      if (bytes > limit) throw openRouterError('unreadable', 'response exceeds its byte limit');
      chunks.push(chunk);
    }
  } finally {
    await reader.cancel();
  }
}
