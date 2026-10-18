import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { DiscordInputError } from './errors';

const TIMEOUT_MS = 30_000;

interface Download {
  readonly data: Buffer;
  readonly type: string | null;
}

export type Downloader = (url: string, maxBytes: number) => Promise<Download>;

function tooLarge(maxBytes: number): DiscordInputError {
  return new DiscordInputError(
    `the file is larger than the ${String(Math.round(maxBytes / 1024))} KiB limit in the plugin settings`,
  );
}

async function bounded(response: Response, maxBytes: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    throw tooLarge(maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  for (
    let part = await reader?.read();
    part !== undefined && !part.done;
    part = await reader?.read()
  ) {
    const value = z.instanceof(Uint8Array).parse(part.value);
    size += value.byteLength;
    if (size > maxBytes) {
      await reader?.cancel();
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function downloader(fetcher: typeof fetch = fetch): Downloader {
  return async (url, maxBytes) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new DiscordInputError(
        `the download of ${new URL(url).host} answered HTTP ${String(response.status)}`,
      );
    }
    return { data: await bounded(response, maxBytes), type: response.headers.get('content-type') };
  };
}

export async function mimeOf(data: Buffer, provided: string | null | undefined): Promise<string> {
  const detected = await fileTypeFromBuffer(data);
  return (
    detected?.mime ?? provided?.split(';')[0]?.trim().toLowerCase() ?? 'application/octet-stream'
  );
}

export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}_. -]/gu, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^\p{L}\p{N}_]+/u, '');
  return cleaned.slice(-100) || 'file';
}
