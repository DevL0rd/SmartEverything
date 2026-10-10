import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { DiscordInputError } from './errors';
import { outgoingType } from './media-formats';
import { safeFileName } from './media-service';
import type { OutFile } from './outgoing';

export const MAX_FILES = 10;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const NAME_MAX = 100;

export const SEND_FILE = z.union([
  z.strictObject({
    path: z.string().min(1).max(1024).describe('Absolute path of any local file the hub can read.'),
  }),
  z.strictObject({
    url: z.url({ protocol: /^https?$/ }).describe('An http or https URL to download and attach.'),
    name: z
      .string()
      .min(1)
      .max(NAME_MAX)
      .optional()
      .describe('File name to use instead of the URL’s.'),
  }),
  z.strictObject({
    name: z.string().min(1).max(NAME_MAX).describe('File name including its extension.'),
    text: z.string().min(1).describe('Inline text content of the file.'),
  }),
  z.strictObject({
    name: z.string().min(1).max(NAME_MAX).describe('File name including its extension.'),
    base64: z.base64().min(1).describe('Inline file content as base64.'),
  }),
  z.strictObject({ uploadId: z.uuid().describe('A sealed upload from the upload tool.') }),
]);

export type SendFile = z.output<typeof SEND_FILE>;

function limitText(maxBytes: number): string {
  return `${String(Math.round(maxBytes / 1024))} KiB file limit in the plugin settings`;
}

function describeFile(data: Buffer, name: string, contentType: string): OutFile {
  return { data, name, contentType, sha256: createHash('sha256').update(data).digest('hex') };
}

function cleanName(raw: string): string {
  const name = safeFileName(raw);
  if (name === '') {
    throw new DiscordInputError(`"${raw}" has no usable file name; pass a name with an extension`);
  }
  return name;
}

async function packed(
  data: Buffer,
  raw: string,
  maxBytes: number,
  provided?: string,
): Promise<OutFile> {
  const name = cleanName(raw);
  if (data.length === 0) {
    throw new DiscordInputError(`${name} is empty`);
  }
  if (data.length > maxBytes) {
    throw new DiscordInputError(`${name} is larger than the ${limitText(maxBytes)}`);
  }
  return describeFile(data, name, await outgoingType(data, name, provided));
}

export async function pathFile(path: string, maxBytes: number): Promise<OutFile> {
  if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new DiscordInputError(`Path must be absolute: ${path}`);
  }
  const real = await realpath(path).catch((cause: unknown) => {
    throw new DiscordInputError(
      `File not found or unreadable: ${basename(path)} (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  });
  const info = await stat(real);
  if (!info.isFile()) {
    throw new DiscordInputError(`${basename(real)} is not a regular file`);
  }
  if (info.size > maxBytes) {
    throw new DiscordInputError(`${basename(real)} is larger than the ${limitText(maxBytes)}`);
  }
  return packed(await readFile(real), basename(real), maxBytes);
}

async function body(response: Response, maxBytes: number, shown: string): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    throw new DiscordInputError(`${shown} is larger than the ${limitText(maxBytes)}`);
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
      throw new DiscordInputError(`${shown} is larger than the ${limitText(maxBytes)}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function urlName(url: URL, type: string | null): string {
  const last = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
  if (last !== '') {
    return last;
  }
  return type === 'image/png' ? 'image.png' : 'download';
}

export type UrlFetch = (url: string, signal: AbortSignal) => Promise<Response>;

export async function urlFile(
  address: string,
  name: string | undefined,
  maxBytes: number,
  fetchUrl: UrlFetch,
): Promise<OutFile> {
  const url = new URL(address);
  const shown = `${url.host}${url.pathname}`;
  const response = await fetchUrl(address, AbortSignal.timeout(FETCH_TIMEOUT_MS)).catch(
    (cause: unknown) => {
      throw new DiscordInputError(
        `Download of ${shown} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    },
  );
  if (!response.ok) {
    throw new DiscordInputError(`Download of ${shown} failed with HTTP ${String(response.status)}`);
  }
  const type = response.headers.get('content-type');
  const data = await body(response, maxBytes, shown);
  return packed(data, name ?? urlName(url, type), maxBytes, type ?? undefined);
}

export function inlineFile(
  file:
    | { readonly name: string; readonly text: string }
    | { readonly name: string; readonly base64: string },
  maxBytes: number,
): Promise<OutFile> {
  const data = 'text' in file ? Buffer.from(file.text, 'utf8') : Buffer.from(file.base64, 'base64');
  return packed(data, file.name, maxBytes);
}

export function assertTotal(files: readonly OutFile[]): void {
  const total = files.reduce((sum, file) => sum + file.data.length, 0);
  if (total > MAX_TOTAL_BYTES) {
    throw new DiscordInputError(
      `The files total ${String(Math.round(total / 1024))} KiB, over Discord’s ${String(MAX_TOTAL_BYTES / 1024)} KiB limit per message; send them in several messages`,
    );
  }
}
