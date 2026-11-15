import { PassThrough, Transform, type Readable } from 'node:stream';
import type { DriveZipEntry, DriveZipTotals } from '@smarteverything/domain';
import { classify } from '../scanner-commit';
import {
  closeZip,
  isFolderEntry,
  openEntryStream,
  openZip,
  visitEntries,
  type Entry,
  type ZipFile,
} from './zip-file';

const STORED = 0;

export class ZipEntryError extends Error {
  override readonly name = 'ZipEntryError';

  constructor(
    readonly failure: 'missing' | 'folder' | 'encrypted',
    message: string,
  ) {
    super(message);
  }
}

export interface ZipListing {
  readonly items: readonly DriveZipEntry[];
  readonly totals: DriveZipTotals;
  readonly next: number | null;
}

function pathOf(entry: Entry): string {
  return isFolderEntry(entry) ? entry.fileName.slice(0, -1) : entry.fileName;
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function modifiedOf(entry: Entry): string | null {
  const moment = entry.getLastModDate({ timezone: 'UTC' });
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
}

function describe(entry: Entry, index: number): DriveZipEntry | null {
  const path = pathOf(entry);
  const name = nameOf(path);
  if (path === '' || name === '') return null;
  const folder = isFolderEntry(entry);
  return {
    index,
    path,
    name,
    folder,
    bytes: entry.uncompressedSize,
    compressedBytes: entry.compressedSize,
    modifiedAt: modifiedOf(entry),
    encrypted: entry.isEncrypted(),
    kind: folder ? 'folder' : classify(name).kind,
  };
}

export async function listZip(path: string, after: number, limit: number): Promise<ZipListing> {
  const zip = await openZip(path);
  try {
    const items: DriveZipEntry[] = [];
    let files = 0;
    let folders = 0;
    let bytes = 0;
    let compressedBytes = 0;
    let next: number | null = null;
    await visitEntries(zip, (entry, index) => {
      const described = describe(entry, index);
      if (described === null) return 'next';
      if (described.folder) folders += 1;
      else files += 1;
      bytes += described.bytes;
      compressedBytes += described.compressedBytes;
      if (index < after) return 'next';
      if (items.length < limit) items.push(described);
      else next ??= index;
      return 'next';
    });
    return { items, totals: { files, folders, bytes, compressedBytes }, next };
  } finally {
    closeZip(zip);
  }
}

export interface ZipEntrySource {
  readonly name: string;
  readonly bytes: number;
  readonly entry: DriveZipEntry;
  readonly stream: (range?: { readonly start: number; readonly end: number }) => Readable;
}

function sliced(source: Readable, start: number, end: number): Readable {
  let position = 0;
  const slicer = new Transform({
    transform(chunk: Buffer, _encoding, done): void {
      const first = position;
      position += chunk.length;
      const from = Math.max(start - first, 0);
      const to = Math.min(end + 1 - first, chunk.length);
      done(null, from < to ? chunk.subarray(from, to) : undefined);
    },
  });
  source.on('error', (cause: Error) => slicer.destroy(cause));
  return source.pipe(slicer);
}

async function entryAt(zip: ZipFile, index: number): Promise<Entry> {
  let found: Entry | undefined;
  await visitEntries(zip, (entry, current) => {
    if (current !== index) return 'next';
    found = entry;
    return 'stop';
  });
  if (found === undefined) {
    throw new ZipEntryError('missing', `The archive has no entry number ${String(index)}.`);
  }
  return found;
}

async function openRange(
  zip: ZipFile,
  entry: Entry,
  range: { readonly start: number; readonly end: number } | undefined,
): Promise<Readable> {
  if (range === undefined) return openEntryStream(zip, entry);
  if (entry.compressionMethod === STORED) {
    return openEntryStream(zip, entry, { start: range.start, end: range.end + 1 });
  }
  return sliced(await openEntryStream(zip, entry), range.start, range.end);
}

function checked(entry: Entry, index: number): DriveZipEntry {
  const described = describe(entry, index);
  if (described === null) {
    throw new ZipEntryError('missing', `The archive has no entry number ${String(index)}.`);
  }
  if (described.folder) {
    throw new ZipEntryError('folder', 'A folder inside an archive has no bytes to read.');
  }
  if (described.encrypted) {
    throw new ZipEntryError('encrypted', 'This entry is password protected.');
  }
  return described;
}

async function describeEntry(path: string, index: number): Promise<DriveZipEntry> {
  const zip = await openZip(path);
  try {
    return checked(await entryAt(zip, index), index);
  } finally {
    closeZip(zip);
  }
}

function streamEntry(
  path: string,
  index: number,
  range: { readonly start: number; readonly end: number } | undefined,
): Readable {
  const out = new PassThrough();
  const opened = openZip(path).then(async (zip) => {
    out.on('close', () => {
      closeZip(zip);
    });
    const entry = await entryAt(zip, index);
    checked(entry, index);
    return openRange(zip, entry, range);
  });
  opened.then(
    (inner) => {
      inner.on('error', (cause: Error) => out.destroy(cause));
      inner.pipe(out);
    },
    (cause: unknown) => {
      out.destroy(cause instanceof Error ? cause : new Error(String(cause)));
    },
  );
  return out;
}

export async function locateZipEntry(path: string, index: number): Promise<ZipEntrySource> {
  const entry = await describeEntry(path, index);
  return {
    name: entry.name,
    bytes: entry.bytes,
    entry,
    stream: (range) => streamEntry(path, index, range),
  };
}
