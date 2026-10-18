import { crc32, createDeflateRaw } from 'node:zlib';
import { open } from 'node:fs/promises';
import { pipeline, Readable } from 'node:stream';
import { z } from 'zod';

const ZIP64_FROM = 0xf0000000;
const UINT32 = 0xffffffff;
const UINT16 = 0xffff;
const FLAGS = 0x0808;
const NAME_FLAG = 0x0800;
const DESCRIPTOR_FLAG = 0x0008;
const STORE = 0;
const DEFLATE = 8;
const UNIX_MADE_BY = 3 << 8;
const READ_BYTES = 256 * 1024;
const BUFFER = z.instanceof(Buffer);

interface ZipFileEntry {
  readonly kind: 'file';
  readonly name: string;
  readonly source: string;
  readonly size: number;
  readonly mtime: Date;
  readonly mode: number;
  readonly compress: boolean;
}

interface ZipFolderEntry {
  readonly kind: 'folder';
  readonly name: string;
  readonly mtime: Date;
  readonly mode: number;
}

interface ZipBufferEntry {
  readonly kind: 'text';
  readonly name: string;
  readonly text: string;
  readonly mtime: Date;
}

export type ZipEntry = ZipFileEntry | ZipFolderEntry | ZipBufferEntry;

interface Written {
  readonly name: Buffer;
  readonly method: number;
  readonly flags: number;
  readonly crc: number;
  readonly compressed: number;
  readonly size: number;
  readonly offset: number;
  readonly time: number;
  readonly date: number;
  readonly attributes: number;
  readonly big: boolean;
}

class Tally {
  crc = 0;
  size = 0;

  add(part: Buffer): void {
    this.crc = crc32(part, this.crc);
    this.size += part.length;
  }
}

function dosStamp(date: Date): { readonly time: number; readonly date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function uint64(value: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function zip64Extra(values: readonly number[]): Buffer {
  return Buffer.concat([
    Buffer.from([0x01, 0x00, values.length * 8, 0x00]),
    ...values.map((value) => uint64(value)),
  ]);
}

function localHeader(entry: Written, extra: Buffer): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(entry.big ? 45 : 20, 4);
  header.writeUInt16LE(entry.flags, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.time, 10);
  header.writeUInt16LE(entry.date, 12);
  if ((entry.flags & DESCRIPTOR_FLAG) === 0) {
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed, 18);
    header.writeUInt32LE(entry.size, 22);
  }
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, entry.name, extra]);
}

function dataDescriptor(crc: number, compressed: number, size: number, big: boolean): Buffer {
  const out = Buffer.alloc(big ? 24 : 16);
  out.writeUInt32LE(0x08074b50, 0);
  out.writeUInt32LE(crc, 4);
  if (big) {
    out.writeBigUInt64LE(BigInt(compressed), 8);
    out.writeBigUInt64LE(BigInt(size), 16);
  } else {
    out.writeUInt32LE(compressed, 8);
    out.writeUInt32LE(size, 12);
  }
  return out;
}

function centralRecord(entry: Written): Buffer {
  const overflow = entry.offset >= UINT32;
  const extra =
    entry.big || overflow
      ? zip64Extra([
          ...(entry.big ? [entry.size, entry.compressed] : []),
          ...(overflow ? [entry.offset] : []),
        ])
      : Buffer.alloc(0);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(UNIX_MADE_BY | 45, 4);
  header.writeUInt16LE(entry.big || overflow ? 45 : 20, 6);
  header.writeUInt16LE(entry.flags, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.big ? UINT32 : entry.compressed, 20);
  header.writeUInt32LE(entry.big ? UINT32 : entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt32LE(entry.attributes >>> 0, 38);
  header.writeUInt32LE(overflow ? UINT32 : entry.offset, 42);
  return Buffer.concat([header, entry.name, extra]);
}

function endRecords(count: number, size: number, offset: number): Buffer {
  const big = count >= UINT16 || size >= UINT32 || offset >= UINT32;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(big ? UINT16 : count, 8);
  end.writeUInt16LE(big ? UINT16 : count, 10);
  end.writeUInt32LE(big ? UINT32 : size, 12);
  end.writeUInt32LE(big ? UINT32 : offset, 16);
  if (!big) {
    return end;
  }
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeUInt16LE(UNIX_MADE_BY | 45, 12);
  record.writeUInt16LE(45, 14);
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(BigInt(size), 40);
  record.writeBigUInt64LE(BigInt(offset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(offset + size), 8);
  locator.writeUInt32LE(1, 16);
  return Buffer.concat([record, locator, end]);
}

function counted(source: string, tally: Tally): Readable {
  return Readable.from(
    (async function* read(): AsyncGenerator<Buffer> {
      const handle = await open(source, 'r');
      try {
        for (;;) {
          const buffer = Buffer.allocUnsafe(READ_BYTES);
          const { bytesRead } = await handle.read(buffer, 0, READ_BYTES, null);
          if (bytesRead === 0) {
            return;
          }
          const part = buffer.subarray(0, bytesRead);
          tally.add(part);
          yield part;
        }
      } finally {
        await handle.close();
      }
    })(),
  );
}

function body(source: string, compress: boolean, tally: Tally): Readable {
  const raw = counted(source, tally);
  return compress ? pipeline(raw, createDeflateRaw({ level: 6 }), () => undefined) : raw;
}

function describe(entry: ZipEntry, offset: number, zip64From: number): Written {
  const stamp = dosStamp(entry.mtime);
  const name = Buffer.from(entry.name, 'utf8');
  const base = { name, offset, time: stamp.time, date: stamp.date };
  if (entry.kind === 'folder') {
    return {
      ...base,
      method: STORE,
      flags: NAME_FLAG,
      crc: 0,
      compressed: 0,
      size: 0,
      attributes: (entry.mode << 16) | 0x10,
      big: false,
    };
  }
  if (entry.kind === 'text') {
    const text = Buffer.from(entry.text, 'utf8');
    return {
      ...base,
      method: STORE,
      flags: NAME_FLAG,
      crc: crc32(text),
      compressed: text.length,
      size: text.length,
      attributes: 0o100644 << 16,
      big: false,
    };
  }
  return {
    ...base,
    method: entry.compress ? DEFLATE : STORE,
    flags: FLAGS,
    crc: 0,
    compressed: 0,
    size: entry.size,
    attributes: entry.mode << 16,
    big: entry.size >= zip64From,
  };
}

class Cursor {
  offset = 0;

  count(part: Buffer): Buffer {
    this.offset += part.length;
    return part;
  }
}

async function* fileData(
  entry: ZipFileEntry,
  written: Written,
  zip64From: number,
  cursor: Cursor,
): AsyncGenerator<Buffer, Written> {
  const tally = new Tally();
  let compressed = 0;
  for await (const chunk of body(entry.source, entry.compress, tally)) {
    const part = BUFFER.parse(chunk);
    compressed += part.length;
    yield cursor.count(part);
  }
  if (tally.size >= zip64From && !written.big) {
    throw new Error(`${entry.source} grew past 4 GiB while it was being zipped`);
  }
  yield cursor.count(dataDescriptor(tally.crc, compressed, tally.size, written.big));
  return { ...written, crc: tally.crc, compressed, size: tally.size };
}

async function* oneEntry(
  entry: ZipEntry,
  cursor: Cursor,
  zip64From: number,
): AsyncGenerator<Buffer, Written> {
  const written = describe(entry, cursor.offset, zip64From);
  const extra = written.big ? zip64Extra([0, 0]) : Buffer.alloc(0);
  yield cursor.count(localHeader(written, extra));
  if (entry.kind === 'folder') {
    return written;
  }
  if (entry.kind === 'text') {
    yield cursor.count(Buffer.from(entry.text, 'utf8'));
    return written;
  }
  return yield* fileData(entry, written, zip64From, cursor);
}

export async function* zipChunks(
  entries: Iterable<ZipEntry>,
  zip64From: number = ZIP64_FROM,
): AsyncGenerator<Buffer> {
  const done: Written[] = [];
  const cursor = new Cursor();
  for (const entry of entries) {
    done.push(yield* oneEntry(entry, cursor, zip64From));
  }
  const directory = Buffer.concat(done.map(centralRecord));
  yield directory;
  yield endRecords(done.length, directory.length, cursor.offset);
}
