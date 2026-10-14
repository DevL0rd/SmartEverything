import { z } from 'zod';

const MAX_CHUNKS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;

export class HarnessDiscoverySourceError extends Error {
  override readonly name = 'HarnessDiscoverySourceError';
  constructor(
    readonly source: string,
    readonly reason: string,
  ) {
    super(`${source}: ${reason}`);
  }
}

export async function readDiscoverySource(
  url: string,
  limit: number,
  source: string,
  optionalMissing = false,
): Promise<Buffer | null> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(url, { signal, redirect: 'error' });
  if (optionalMissing && response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok || response.body === null)
    throw new HarnessDiscoverySourceError(
      source,
      `Expected readable HTTP 200; received ${String(response.status)}.`,
    );
  return readBoundedBody(response.body, limit, source, signal);
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  limit: number,
  source: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (let index = 0; index <= MAX_CHUNKS; index += 1) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) return Buffer.concat(chunks);
      const bytes = z.instanceof(Uint8Array).parse(part.value);
      length += bytes.byteLength;
      if (length > limit || chunks.length >= MAX_CHUNKS)
        throw new HarnessDiscoverySourceError(source, 'Response exceeds the bounded byte limit.');
      chunks.push(bytes);
    }
    throw new HarnessDiscoverySourceError(source, 'Response exceeds the bounded chunk limit.');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function readDiscoveryJson(
  url: string,
  limit: number,
  source: string,
): Promise<unknown> {
  const bytes = await readDiscoverySource(url, limit, source);
  if (bytes === null) throw new HarnessDiscoverySourceError(source, 'Expected a JSON document.');
  return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
}
