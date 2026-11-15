import { constants } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RELEASE_FILES_DIRECTORY,
  RELEASE_FILE_PATH,
  RELEASE_MANIFEST_FILE,
  RELEASE_SIGNATURE_FILE,
} from '@smarteverything/domain';
import { ReleaseVerificationError } from './verify';

const BLOCK = 512;

const COPY_BYTES = 1024 * 1024;

const EXTENDED_HEADER_MAX = 1024 * 1024;

const TOP_LEVEL_FILES: ReadonlySet<string> = new Set([
  RELEASE_MANIFEST_FILE,
  RELEASE_SIGNATURE_FILE,
]);

const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

type Handle = Awaited<ReturnType<typeof open>>;

interface Extended {
  readonly path?: string;
  readonly size?: number;
}

interface Entry {
  readonly type: string;
  readonly raw: string;
  readonly size: number;
  readonly executable: boolean;
}

function refuse(message: string): never {
  throw new ReleaseVerificationError('layout', message);
}

function unsafe(message: string): never {
  throw new ReleaseVerificationError('unsafe_path', message);
}

function codeOf(cause: unknown): unknown {
  return cause instanceof Error && 'code' in cause ? cause.code : undefined;
}

function textField(header: Buffer, start: number, length: number): string {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function octalField(header: Buffer, start: number, length: number, shown: string): number {
  const text = textField(header, start, length).trim();
  if (!/^[0-7]{1,12}$/u.test(text)) refuse(`The bundle has an unreadable ${shown} field`);
  return Number.parseInt(text, 8);
}

function checksumMatches(header: Buffer): boolean {
  const expected = octalField(header, 148, 8, 'checksum');
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1)
    sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  return sum === expected;
}

function zeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0);
}

function extendedRecord(
  records: Buffer,
  offset: number,
): { readonly key: string; readonly value: string; readonly next: number } {
  const space = records.indexOf(0x20, offset);
  const length = space === -1 ? Number.NaN : Number(records.subarray(offset, space).toString());
  if (!Number.isSafeInteger(length) || length <= space - offset || offset + length > records.length)
    refuse('The bundle has an unreadable extended header');
  const record = records.subarray(space + 1, offset + length - 1).toString('utf8');
  const equals = record.indexOf('=');
  if (equals === -1) refuse('The bundle has an unreadable extended header');
  return { key: record.slice(0, equals), value: record.slice(equals + 1), next: offset + length };
}

function extendedOf(records: Buffer): Extended {
  let path: string | undefined;
  let size: number | undefined;
  let offset = 0;
  while (offset < records.length) {
    const { key, value, next } = extendedRecord(records, offset);
    if (key === 'path') path = value;
    if (key === 'size') {
      if (!/^[0-9]{1,16}$/u.test(value)) refuse('The bundle has an unreadable file size');
      size = Number(value);
    }
    offset = next;
  }
  return { ...(path === undefined ? {} : { path }), ...(size === undefined ? {} : { size }) };
}

function headerEntry(header: Buffer, extended: Extended): Entry {
  if (textField(header, 257, 6) !== 'ustar' || header.subarray(263, 265).toString() !== '00')
    refuse('The bundle is not a POSIX tar archive');
  if (!checksumMatches(header)) refuse('The bundle has a damaged entry header');
  const prefix = textField(header, 345, 155);
  const name = textField(header, 0, 100);
  return {
    type: String.fromCharCode(header[156] ?? 0),
    raw: extended.path ?? (prefix === '' ? name : `${prefix}/${name}`),
    size: extended.size ?? octalField(header, 124, 12, 'size'),
    executable: (octalField(header, 100, 8, 'mode') & 0o111) !== 0,
  };
}

function entryPath(raw: string): string | null {
  const trimmed = raw.replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, '');
  if (trimmed === '' || trimmed === '.') return null;
  const parsed = RELEASE_FILE_PATH.safeParse(trimmed);
  if (!parsed.success) unsafe(`The bundle holds an unsafe path ${JSON.stringify(raw)}`);
  return parsed.data;
}

function allowedEntry(path: string, folder: boolean): void {
  const top = path.split('/')[0];
  if (top === RELEASE_FILES_DIRECTORY && (folder || path !== RELEASE_FILES_DIRECTORY)) return;
  if (!folder && TOP_LEVEL_FILES.has(path)) return;
  refuse(`The bundle holds an unexpected entry ${path}`);
}

async function readExactly(handle: Handle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, position + filled);
    if (bytesRead === 0) refuse('The bundle ends in the middle of an entry');
    filled += bytesRead;
  }
  return buffer;
}

async function makeFolder(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch (cause) {
    const code = codeOf(cause);
    if (code === 'EEXIST' || code === 'ENOTDIR')
      refuse('The bundle holds a folder where a file already is');
    throw cause;
  }
}

async function copyOut(
  handle: Handle,
  position: number,
  entry: Pick<Entry, 'size' | 'executable'>,
  target: string,
): Promise<void> {
  const { size, executable } = entry;
  let output: Handle;
  try {
    output = await open(target, CREATE_FLAGS, executable ? 0o700 : 0o600);
  } catch (cause) {
    if (codeOf(cause) === 'EEXIST') refuse('The bundle holds the same entry twice');
    throw cause;
  }
  try {
    for (let copied = 0; copied < size; copied += COPY_BYTES) {
      const length = Math.min(COPY_BYTES, size - copied);
      await output.write(await readExactly(handle, position + copied, length));
    }
  } finally {
    await output.close();
  }
}

async function extract(
  into: string,
  entry: Entry,
  handle: Handle,
  position: number,
): Promise<void> {
  if (entry.type !== '5' && entry.type !== '0' && entry.type !== '\0')
    unsafe(`The bundle holds ${entry.raw}, which is not a plain file or folder`);
  const path = entryPath(entry.raw);
  if (entry.type === '5') {
    if (path === null) return;
    allowedEntry(path, true);
    await makeFolder(join(into, ...path.split('/')));
    return;
  }
  if (path === null) unsafe('The bundle holds a file without a name');
  allowedEntry(path, false);
  const segments = path.split('/');
  if (segments.length > 1) await makeFolder(join(into, ...segments.slice(0, -1)));
  await copyOut(handle, position, entry, join(into, ...segments));
}

function blocksOf(size: number): number {
  return Math.ceil(size / BLOCK) * BLOCK;
}

async function endOfArchive(handle: Handle, position: number, size: number): Promise<void> {
  if (position + BLOCK > size || !zeroBlock(await readExactly(handle, position, BLOCK)))
    refuse('The bundle has a broken end marker');
  for (let at = position + BLOCK; at < size; at += COPY_BYTES)
    if (!zeroBlock(await readExactly(handle, at, Math.min(COPY_BYTES, size - at))))
      refuse('The bundle has bytes after its end');
}

async function readEntries(handle: Handle, size: number, into: string): Promise<void> {
  let position = 0;
  let extended: Extended = {};
  for (;;) {
    if (position + BLOCK > size) refuse('The bundle ends without its end marker');
    const header = await readExactly(handle, position, BLOCK);
    position += BLOCK;
    if (zeroBlock(header)) return endOfArchive(handle, position, size);
    const entry = headerEntry(header, extended);
    if (position + entry.size > size) refuse('The bundle ends in the middle of an entry');
    if (entry.type === 'x') {
      if (
        extended.path !== undefined ||
        extended.size !== undefined ||
        entry.size > EXTENDED_HEADER_MAX
      )
        refuse('The bundle has an unreadable extended header');
      extended = extendedOf(await readExactly(handle, position, entry.size));
    } else {
      extended = {};
      await extract(into, entry, handle, position);
    }
    position += blocksOf(entry.size);
  }
}

export async function unpackReleaseTar(tar: string, into: string): Promise<void> {
  const handle = await open(tar, READ_FLAGS);
  try {
    const { size } = await handle.stat();
    await mkdir(into, { mode: 0o700 });
    await readEntries(handle, size, into);
  } finally {
    await handle.close();
  }
}
