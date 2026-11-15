import {
  FILE_PAGE_SIZE,
  type DriveZipEntry,
  type DriveZipPage,
  type FileRange,
} from '@smarteverything/domain';
import mime from 'mime-types';
import type { Readable } from 'node:stream';
import { open as openZipFile, type Entry, type ZipFile } from 'yauzl';
import { NodeFailureError } from '../node-failure';
import { fileAt } from './home-files';

const STORED = 0;
const IDLE_EXPIRY_MS = 10 * 60_000;
const OCTET_STREAM = 'application/octet-stream';
const DOCUMENT_MIMES: readonly string[] = [
  'text/',
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.oasis.opendocument',
];

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    openZipFile(
      path,
      { lazyEntries: true, autoClose: false, strictFileNames: false, validateEntrySizes: false },
      (cause, zip) => {
        if (cause !== null) {
          reject(new NodeFailureError('failed', 'This archive could not be read.'));
        } else {
          resolve(zip);
        }
      },
    );
  });
}

async function visit(
  zip: ZipFile,
  each: (entry: Entry, index: number) => 'next' | 'stop',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let index = 0;
    zip.on('error', () => {
      reject(new NodeFailureError('failed', 'This archive could not be read.'));
    });
    zip.on('end', resolve);
    zip.on('entry', (entry: Entry) => {
      const current = index;
      index += 1;
      if (each(entry, current) === 'stop') {
        resolve();
      } else {
        zip.readEntry();
      }
    });
    zip.readEntry();
  });
}

function isFolder(entry: Entry): boolean {
  return entry.fileName.endsWith('/');
}

function mimeOfName(name: string): string {
  const found = mime.lookup(name);
  return found === false ? OCTET_STREAM : found;
}

function kindOf(name: string, folder: boolean): DriveZipEntry['kind'] {
  if (folder) {
    return 'folder';
  }
  const type = mimeOfName(name);
  if (type.startsWith('image/')) {
    return 'image';
  }
  if (type.startsWith('video/')) {
    return 'video';
  }
  if (type.startsWith('audio/')) {
    return 'audio';
  }
  return DOCUMENT_MIMES.some((prefix) => type.startsWith(prefix)) ? 'document' : 'other';
}

function describe(entry: Entry, index: number): DriveZipEntry | null {
  const folder = isFolder(entry);
  const path = folder ? entry.fileName.slice(0, -1) : entry.fileName;
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name === '') {
    return null;
  }
  const moment = entry.getLastModDate({ timezone: 'UTC' });
  return {
    index,
    path,
    name,
    folder,
    bytes: entry.uncompressedSize,
    compressedBytes: entry.compressedSize,
    modifiedAt: Number.isNaN(moment.getTime()) ? null : moment.toISOString(),
    encrypted: entry.isEncrypted(),
    kind: kindOf(name, folder),
  };
}

function entryStream(
  zip: ZipFile,
  entry: Entry,
  range?: { readonly start: number; readonly end: number },
): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const done = (cause: Error | null, stream: Readable): void => {
      if (cause === null) {
        resolve(stream);
      } else {
        reject(new NodeFailureError('failed', 'That entry could not be read.'));
      }
    };
    if (range === undefined) {
      zip.openReadStream(entry, done);
    } else {
      zip.openReadStream(entry, { start: range.start, end: range.end }, done);
    }
  });
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

interface EntryMeta {
  readonly name: string;
  readonly size: number;
}

class InflatedReader {
  private readonly chunks: AsyncIterator<unknown>;
  private parts: Buffer[] = [];
  private held = 0;
  private position = 0;
  private ended = false;
  private timer: NodeJS.Timeout | null = null;
  private turn: Promise<void> = Promise.resolve();

  constructor(
    private readonly zip: ZipFile,
    private readonly stream: Readable,
    readonly meta: EntryMeta,
    private readonly expired: () => void,
  ) {
    this.chunks = stream[Symbol.asyncIterator]();
    this.arm();
  }

  get next(): number {
    return this.position;
  }

  async take(start: number, end: number): Promise<Buffer> {
    const before = this.turn;
    let release = (): void => undefined;
    this.turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      return await this.pull(start, end);
    } finally {
      release();
    }
  }

  close(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stream.destroy();
    this.zip.close();
  }

  private arm(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.expired();
      this.close();
    }, IDLE_EXPIRY_MS);
    this.timer.unref();
  }

  private async pull(start: number, end: number): Promise<Buffer> {
    this.arm();
    while (this.position + this.held < end && !this.ended) {
      const step = await this.chunks.next();
      if (step.done === true) {
        this.ended = true;
        break;
      }
      const chunk = Buffer.isBuffer(step.value) ? step.value : Buffer.from(String(step.value));
      this.parts.push(chunk);
      this.held += chunk.length;
      if (this.position + this.held <= start) {
        this.position += this.held;
        this.parts = [];
        this.held = 0;
      }
    }
    const joined = Buffer.concat(this.parts);
    const cut = Math.min(Math.max(end - this.position, 0), joined.length);
    const out = joined.subarray(Math.min(Math.max(start - this.position, 0), cut), cut);
    const rest = joined.subarray(cut);
    this.parts = rest.length === 0 ? [] : [rest];
    this.held = rest.length;
    this.position += cut;
    return out;
  }
}

async function locate(
  zip: ZipFile,
  index: number,
): Promise<{ readonly entry: Entry; readonly described: DriveZipEntry }> {
  let found: Entry | undefined;
  await visit(zip, (entry, current) => {
    if (current !== index) {
      return 'next';
    }
    found = entry;
    return 'stop';
  });
  const described = found === undefined ? null : describe(found, index);
  if (found === undefined || described === null) {
    throw new NodeFailureError('not_found', 'The archive has no such entry.');
  }
  if (described.folder) {
    throw new NodeFailureError('not_supported', 'A folder inside an archive has no bytes.');
  }
  if (described.encrypted) {
    throw new NodeFailureError('not_supported', 'This entry is password protected.');
  }
  return { entry: found, described };
}

export class ZipEntries {
  private readonly readers = new Map<string, InflatedReader>();

  async list(path: string, cursor: string | null): Promise<DriveZipPage> {
    const after = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(after) || after < 0) {
      throw new NodeFailureError('failed', 'That page of the archive does not exist.');
    }
    const { file } = await fileAt(path);
    const zip = await openZip(file);
    try {
      const items: DriveZipEntry[] = [];
      let files = 0;
      let folders = 0;
      let bytes = 0;
      let compressedBytes = 0;
      const overflow: number[] = [];
      await visit(zip, (entry, index) => {
        const described = describe(entry, index);
        if (described === null) {
          return 'next';
        }
        if (described.folder) {
          folders += 1;
        } else {
          files += 1;
        }
        bytes += described.bytes;
        compressedBytes += described.compressedBytes;
        if (index < after) {
          return 'next';
        }
        if (items.length < FILE_PAGE_SIZE) {
          items.push(described);
        } else {
          if (overflow.length === 0) {
            overflow.push(index);
          }
        }
        return 'next';
      });
      return {
        items,
        next: overflow[0] === undefined ? null : String(overflow[0]),
        totals: { files, folders, bytes, compressedBytes },
      };
    } finally {
      zip.close();
    }
  }

  async range(path: string, index: number, start: number, length: number): Promise<FileRange> {
    const { file, stats } = await fileAt(path);
    const key = `${file}\0${String(index)}\0${String(stats.size)}\0${String(stats.mtimeMs)}`;
    const held = this.readers.get(key);
    if (held !== undefined) {
      if (start >= held.next) {
        return this.answer(key, held, start, length);
      }
      this.drop(key);
    }
    const zip = await openZip(file);
    let reader: InflatedReader | null = null;
    try {
      const { entry, described } = await locate(zip, index);
      const meta = { name: described.name, size: described.bytes };
      if (entry.compressionMethod === STORED) {
        const last = Math.min(start + length, described.bytes);
        const stream = start >= last ? null : await entryStream(zip, entry, { start, end: last });
        return this.described(meta, stream === null ? Buffer.alloc(0) : await collect(stream));
      }
      reader = new InflatedReader(zip, await entryStream(zip, entry), meta, () => {
        this.readers.delete(key);
      });
      this.readers.set(key, reader);
      return await this.answer(key, reader, start, length);
    } finally {
      if (reader === null) {
        zip.close();
      }
    }
  }

  private drop(key: string): void {
    this.readers.get(key)?.close();
    this.readers.delete(key);
  }

  private async answer(
    key: string,
    reader: InflatedReader,
    start: number,
    length: number,
  ): Promise<FileRange> {
    const { size } = reader.meta;
    const last = Math.min(start + length, size);
    try {
      const data = start >= last ? Buffer.alloc(0) : await reader.take(start, last);
      return this.described(reader.meta, data);
    } catch (cause) {
      this.drop(key);
      throw cause instanceof NodeFailureError
        ? cause
        : new NodeFailureError('failed', 'That entry could not be read.');
    } finally {
      if (last >= size) {
        this.drop(key);
      }
    }
  }

  private described(meta: EntryMeta, data: Buffer): FileRange {
    return {
      name: meta.name,
      size: meta.size,
      mimeType: mimeOfName(meta.name),
      data: data.toString('base64'),
    };
  }
}
