import { crc32, deflateRawSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { fromBuffer, fromRandomAccessReader, RandomAccessReader } from 'yauzl';
import type { Entry, ZipFile, ZipFileOptions } from 'yauzl';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

interface Part {
  readonly name: string;
  readonly data: Buffer;
  readonly deflate?: boolean;
  readonly encrypted?: boolean;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const END64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;

function littleEndian(size: number, write: (buffer: Buffer) => void): Buffer {
  const buffer = Buffer.alloc(size);
  write(buffer);
  return buffer;
}

function buildZip(parts: readonly Part[], zip64 = false): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name);
    const plain = part.deflate === true ? deflateRawSync(part.data) : part.data;
    const body = part.encrypted === true ? Buffer.concat([Buffer.alloc(12), plain]) : plain;
    const method = part.deflate === true ? 8 : 0;
    const flags = part.encrypted === true ? 1 : 0;
    const checksum = crc32(part.data);
    const local = littleEndian(30, (b) => {
      b.writeUInt32LE(LOCAL, 0);
      b.writeUInt16LE(20, 4);
      b.writeUInt16LE(flags, 6);
      b.writeUInt16LE(method, 8);
      b.writeUInt32LE(checksum, 14);
      b.writeUInt32LE(body.length, 18);
      b.writeUInt32LE(part.data.length, 22);
      b.writeUInt16LE(name.length, 26);
    });
    const entry = littleEndian(46, (b) => {
      b.writeUInt32LE(CENTRAL, 0);
      b.writeUInt16LE(20, 4);
      b.writeUInt16LE(20, 6);
      b.writeUInt16LE(flags, 8);
      b.writeUInt16LE(method, 10);
      b.writeUInt16LE(0x0021, 14);
      b.writeUInt32LE(checksum, 16);
      b.writeUInt32LE(body.length, 20);
      b.writeUInt32LE(part.data.length, 24);
      b.writeUInt16LE(name.length, 28);
      b.writeUInt32LE(offset, 42);
    });
    central.push(entry, name);
    chunks.push(local, name, body);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const tail: Buffer[] = [];
  if (zip64) {
    tail.push(
      littleEndian(56, (b) => {
        b.writeUInt32LE(END64, 0);
        b.writeBigUInt64LE(44n, 4);
        b.writeUInt16LE(45, 12);
        b.writeUInt16LE(45, 14);
        b.writeBigUInt64LE(BigInt(parts.length), 24);
        b.writeBigUInt64LE(BigInt(parts.length), 32);
        b.writeBigUInt64LE(BigInt(directory.length), 40);
        b.writeBigUInt64LE(BigInt(offset), 48);
      }),
      littleEndian(20, (b) => {
        b.writeUInt32LE(LOCATOR64, 0);
        b.writeBigUInt64LE(BigInt(offset + directory.length), 8);
        b.writeUInt32LE(1, 16);
      }),
    );
  }
  tail.push(
    littleEndian(22, (b) => {
      b.writeUInt32LE(END, 0);
      b.writeUInt16LE(zip64 ? 0xffff : parts.length, 8);
      b.writeUInt16LE(zip64 ? 0xffff : parts.length, 10);
      b.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12);
      b.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
    }),
  );
  return Buffer.concat([...chunks, directory, ...tail]);
}

function open(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error !== null) {
        reject(error);
      } else {
        resolve(zip);
      }
    });
  });
}

async function entriesOf(zip: ZipFile): Promise<readonly Entry[]> {
  const entries: Entry[] = [];
  return new Promise((resolve, reject) => {
    zip.on('entry', (entry: Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.on('end', () => {
      resolve(entries);
    });
    zip.on('error', reject);
    zip.readEntry();
  });
}

async function collect(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) {
    parts.push(Buffer.isBuffer(part) ? part : Buffer.from(String(part)));
  }
  return Buffer.concat(parts);
}

function read(zip: ZipFile, entry: Entry, range: ZipFileOptions | undefined): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, stream: Readable): void => {
      if (error !== null) {
        reject(error);
      } else {
        collect(stream).then(resolve, reject);
      }
    };
    if (range === undefined) zip.openReadStream(entry, done);
    else zip.openReadStream(entry, range, done);
  });
}

const TEXT = Buffer.from('hello from the archive '.repeat(20));

const PARTS: readonly Part[] = [
  { name: 'docs/', data: Buffer.alloc(0) },
  { name: 'docs/readme.txt', data: TEXT, deflate: true },
  { name: 'image.bin', data: Buffer.from('0123456789abcdef') },
  { name: 'secret.txt', data: Buffer.from('locked'), encrypted: true },
];

describe('yauzl contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'yauzl')).toBe(installedVersion('yauzl'));
  });

  it('lists the central directory in archive order with sizes, methods and folders', async () => {
    const zip = await open(buildZip(PARTS));
    expect(zip.entryCount).toBe(4);
    const entries = await entriesOf(zip);
    expect(entries.map((entry) => entry.fileName)).toStrictEqual([
      'docs/',
      'docs/readme.txt',
      'image.bin',
      'secret.txt',
    ]);
    expect(entries.map((entry) => entry.fileName.endsWith('/'))).toStrictEqual([
      true,
      false,
      false,
      false,
    ]);
    const readme = entries[1];
    expect(readme?.uncompressedSize).toBe(TEXT.length);
    expect(readme?.compressedSize).toBeLessThan(TEXT.length);
    expect(readme?.compressionMethod).toBe(8);
    expect(entries[2]?.compressionMethod).toBe(0);
    expect(entries[3]?.isEncrypted()).toBe(true);
    expect(entries[2]?.isEncrypted()).toBe(false);
  });

  it('streams a deflated entry decompressed and a stored entry as it is', async () => {
    const zip = await open(buildZip(PARTS));
    const entries = await entriesOf(zip);
    const [, readme, image] = entries;
    if (readme === undefined || image === undefined) {
      throw new Error('The archive lost its entries');
    }
    expect((await read(zip, readme, undefined)).equals(TEXT)).toBe(true);
    expect((await read(zip, image, undefined)).toString()).toBe('0123456789abcdef');
  });

  it('reads a byte range of a stored entry and refuses a range of a deflated one', async () => {
    const zip = await open(buildZip(PARTS));
    const entries = await entriesOf(zip);
    const [, readme, image] = entries;
    if (readme === undefined || image === undefined) {
      throw new Error('The archive lost its entries');
    }
    const range = await read(zip, image, { start: 4, end: 10 });
    expect(range.toString()).toBe('456789');
    await expect(read(zip, readme, { start: 1, end: 5 })).rejects.toThrow(/decodeFileData/u);
  });

  it('reports where the data of an entry starts inside the archive', async () => {
    const archive = buildZip(PARTS);
    const zip = await open(archive);
    const image = (await entriesOf(zip))[2];
    if (image === undefined) throw new Error('The archive lost its entries');
    const start = await new Promise<number>((resolve, reject) => {
      zip.readLocalFileHeader(image, { minimal: true }, (error, header) => {
        if (error === null) resolve(header.fileDataStart);
        else reject(error);
      });
    });
    expect(archive.subarray(start, start + image.compressedSize).toString()).toBe(
      '0123456789abcdef',
    );
  });

  it('reads a zip64 central directory', async () => {
    const zip = await open(buildZip(PARTS, true));
    expect(zip.entryCount).toBe(4);
    expect((await entriesOf(zip)).map((entry) => entry.fileName)).toContain('image.bin');
  });

  it('reads a large archive through random access without asking for every byte', async () => {
    const big = Buffer.alloc(2_000_000, 7);
    const archive = buildZip([
      { name: 'big.bin', data: big },
      { name: 'small.txt', data: Buffer.from('tiny') },
    ]);
    const requested: number[] = [];

    class Counting extends RandomAccessReader {
      override _readStreamForRange(start: number, end: number): Readable {
        requested.push(end - start);
        return Readable.from([archive.subarray(start, end)]);
      }
    }

    const zip = await new Promise<ZipFile>((resolve, reject) => {
      fromRandomAccessReader(
        new Counting(),
        archive.length,
        { lazyEntries: true, autoClose: false },
        (error, opened) => {
          if (error !== null) {
            reject(error);
          } else {
            resolve(opened);
          }
        },
      );
    });
    const entries = await entriesOf(zip);
    const small = entries[1];
    if (small === undefined) {
      throw new Error('The archive lost its small entry');
    }
    expect((await read(zip, small, undefined)).toString()).toBe('tiny');
    expect(requested.reduce((total, size) => total + size, 0)).toBeLessThan(archive.length / 4);
  });

  it('refuses bytes that are not a zip archive', async () => {
    await expect(open(Buffer.from('this is not a zip archive at all'))).rejects.toThrow(
      /end of central directory record signature not found/iu,
    );
  });
});
