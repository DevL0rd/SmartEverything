import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { z } from 'zod';
import { DiscordInputError } from './errors';
import { mimeOf, safeFileName, type Downloader } from './media-download';
import type { OutFile } from './outgoing';
import { messageOf } from '@smarteverything/logging';

export const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const NAME_MAX = 100;

export const SEND_FILE = z.union([
  z.strictObject({
    path: z.string().min(1).max(1024).describe('Absolute path of a file on the machine.'),
    machine: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Machine name or id from list_machines that holds the file; omit for the home hub’s own machine.',
      ),
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
]);

export type SendFile = z.output<typeof SEND_FILE>;

function limitText(maxBytes: number): string {
  return `${String(Math.round(maxBytes / 1024))} KiB file limit in the plugin settings`;
}

async function packed(
  data: Buffer,
  raw: string,
  maxBytes: number,
  provided?: string | null,
): Promise<OutFile> {
  const name = safeFileName(raw);
  if (data.length > maxBytes) {
    throw new DiscordInputError(`${name} is larger than the ${limitText(maxBytes)}`);
  }
  return { data, name, contentType: await mimeOf(data, provided) };
}

export async function pathFile(path: string, maxBytes: number): Promise<OutFile> {
  if (!isAbsolute(path)) {
    throw new DiscordInputError(`Path must be absolute: ${path}`);
  }
  const real = await realpath(path).catch((cause: unknown) => {
    throw new DiscordInputError(
      `File not found or unreadable: ${basename(path)} (${messageOf(cause)})`,
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

export async function urlFile(
  address: string,
  name: string | undefined,
  maxBytes: number,
  download: Downloader,
): Promise<OutFile> {
  const url = new URL(address);
  const { data, type } = await download(address, maxBytes).catch((cause: unknown) => {
    throw new DiscordInputError(
      `Download of ${url.host}${url.pathname} failed: ${messageOf(cause)}`,
    );
  });
  return packed(
    data,
    name ?? (decodeURIComponent(url.pathname.split('/').at(-1) ?? '') || 'download'),
    maxBytes,
    type,
  );
}

export async function machineFile(
  file: { readonly machine: string; readonly path: string },
  read: () => Promise<{ readonly data: Buffer; readonly name: string } | null>,
  maxBytes: number,
): Promise<OutFile | null> {
  const found = await read().catch((cause: unknown) => {
    throw new DiscordInputError(
      `Could not read ${file.path} on ${file.machine}: ${messageOf(cause)}`,
    );
  });
  return found === null ? null : packed(found.data, found.name, maxBytes);
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
