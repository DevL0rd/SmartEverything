import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { imageSize } from '../../../assistant/image-size';
import { DiscordInputError } from './errors';

const MAX_SIDE = 8192;
const MAX_PIXELS = 32_000_000;
const CONTROL_LIMIT = 32;

export const FILE_NAME = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => /^[\p{L}\p{N}_][\p{L}\p{N}_. -]*\.[a-zA-Z0-9]{1,8}$/u.test(value),
    'Invalid file name',
  )
  .refine(
    (value) => !value.includes('..') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value),
  );

const BINARY: ReadonlyMap<string, readonly string[]> = new Map([
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/gif', ['gif']],
  ['image/webp', ['webp']],
  ['application/pdf', ['pdf']],
  ['audio/mpeg', ['mp3']],
  ['audio/ogg', ['ogg']],
  ['audio/wav', ['wav']],
  ['audio/flac', ['flac']],
  ['video/mp4', ['mp4']],
  ['video/webm', ['webm']],
]);

const TEXTUAL: ReadonlyMap<string, string> = new Map([
  ['txt', 'text/plain'],
  ['md', 'text/markdown'],
  ['csv', 'text/csv'],
  ['json', 'application/json'],
]);

const UPLOAD_MIMES: ReadonlySet<string> = new Set([...BINARY.keys(), ...TEXTUAL.values()]);

export const UPLOAD_MIME = z
  .string()
  .refine((value) => UPLOAD_MIMES.has(value), 'Unsupported file format')
  .describe(`One of ${[...UPLOAD_MIMES].join(', ')}.`);

function resolveMime(
  provided: string | undefined,
  detected: string | undefined,
  extension: string,
): string {
  const mime = provided?.split(';')[0]?.trim().toLowerCase() ?? detected ?? TEXTUAL.get(extension);
  if (mime === undefined) {
    throw new DiscordInputError('Unsupported file format');
  }
  return mime;
}

function hasControlBytes(text: string): boolean {
  for (const character of text) {
    if (character.charCodeAt(0) < CONTROL_LIMIT && !'\t\n\r'.includes(character)) {
      return true;
    }
  }
  return false;
}

function inspectText(bytes: Buffer, extension: string, mime: string): void {
  if (TEXTUAL.get(extension) !== mime) {
    throw new DiscordInputError('Unsupported file format');
  }
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (hasControlBytes(decoded)) {
    throw new DiscordInputError('Text contains binary control bytes');
  }
  if (extension === 'json') {
    try {
      JSON.parse(decoded);
    } catch (cause) {
      throw new DiscordInputError(
        `Invalid JSON file: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

function inspectImage(bytes: Buffer): void {
  const size = imageSize(bytes);
  if (
    size === null ||
    size.width > MAX_SIDE ||
    size.height > MAX_SIDE ||
    size.width * size.height > MAX_PIXELS
  ) {
    throw new DiscordInputError('Image dimensions exceed limits');
  }
}

export async function inspectFile(bytes: Buffer, name: string, provided?: string): Promise<string> {
  FILE_NAME.parse(name);
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const detected = await fileTypeFromBuffer(bytes);
  const mime = resolveMime(provided, detected?.mime, extension);
  if (detected === undefined) {
    inspectText(bytes, extension, mime);
    return mime;
  }
  if (detected.mime !== mime || BINARY.get(mime)?.includes(extension) !== true) {
    throw new DiscordInputError('File format, MIME and extension must agree');
  }
  if (mime.startsWith('image/')) {
    inspectImage(bytes);
  }
  return mime;
}

export async function outgoingType(
  bytes: Buffer,
  name: string,
  provided?: string,
): Promise<string> {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const detected = await fileTypeFromBuffer(bytes);
  return (
    provided?.split(';')[0]?.trim().toLowerCase() ??
    detected?.mime ??
    TEXTUAL.get(extension) ??
    'application/octet-stream'
  );
}
