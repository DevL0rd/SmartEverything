import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { DERIVED_LONG_EDGE } from './derived-paths';
import type { DecodeOutcome, PreviewDecoder, PreviewFile } from './preview';

export interface RangeReader {
  readonly size: number;
  readonly read: (offset: number, length: number) => Promise<Buffer>;
}

export interface RawPreview {
  readonly offset: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly orientation: number | null;
}

export type RawPreviewOutcome =
  | { readonly kind: 'found'; readonly preview: RawPreview }
  | { readonly kind: 'none'; readonly reason: string };

interface ByteOrder {
  readonly u16: (data: Buffer, at: number) => number;
  readonly u32: (data: Buffer, at: number) => number;
}

interface Entry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly field: Buffer;
}

interface Region {
  readonly offset: number;
  readonly length: number;
}

const LITTLE: ByteOrder = {
  u16: (data, at) => data.readUInt16LE(at),
  u32: (data, at) => data.readUInt32LE(at),
};

const BIG: ByteOrder = {
  u16: (data, at) => data.readUInt16BE(at),
  u32: (data, at) => data.readUInt32BE(at),
};

const TIFF_MAGICS: ReadonlySet<number> = new Set([0x2a, 0x55, 0x4f52, 0x5352]);

const TYPE_SIZE: Readonly<Record<number, number>> = { 1: 1, 3: 2, 4: 4, 7: 1, 13: 4 };

const ENTRY_BYTES = 12;

const TAG = {
  orientation: 0x0112,
  compression: 0x0103,
  stripOffsets: 0x0111,
  stripByteCounts: 0x0117,
  subIfds: 0x014a,
  jpegOffset: 0x0201,
  jpegLength: 0x0202,
  exifIfd: 0x8769,
  makerNote: 0x927c,
  panasonicJpeg: 0x002e,
  sonyPreview: 0x2001,
} as const;

const JPEG_COMPRESSIONS: ReadonlySet<number> = new Set([6, 7]);

const SONY_MAKER_NOTE = 'SONY DSC ';

const SONY_MAKER_NOTE_HEADER = 12;

const FUJI_MAGIC = 'FUJIFILMCCD-RAW';

const FUJI_JPEG_FIELDS = 84;

const SOF_MARKERS: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2]);

const START_OF_SCAN = 0xda;

const RAW_EXTENSIONS: ReadonlySet<string> = new Set(
  'dng arw srf sr2 cr2 nef nrw orf rw2 pef srw raf 3fr erf kdc dcr mrw rwl iiq cr3'.split(' '),
);

export async function withFileReader<T>(
  path: string,
  use: (reader: RangeReader) => Promise<T>,
): Promise<T> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    return await use({
      size,
      read: async (offset, length) => {
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, offset);
        return chunk.subarray(0, bytesRead);
      },
    });
  } finally {
    await handle.close();
  }
}

async function readExactly(reader: RangeReader, offset: number, length: number): Promise<Buffer> {
  if (offset < 0 || offset + length > reader.size) {
    throw new RangeError(`the range ${String(offset)}+${String(length)} is outside the file`);
  }
  return reader.read(offset, length);
}

async function readIfd(
  reader: RangeReader,
  order: ByteOrder,
  offset: number,
): Promise<{ readonly entries: readonly Entry[]; readonly next: number }> {
  const count = order.u16(await readExactly(reader, offset, 2), 0);
  const body = await readExactly(reader, offset + 2, count * ENTRY_BYTES + 4);
  const entries = Array.from({ length: count }, (_, index): Entry => {
    const at = index * ENTRY_BYTES;
    return {
      tag: order.u16(body, at),
      type: order.u16(body, at + 2),
      count: order.u32(body, at + 4),
      field: body.subarray(at + 8, at + ENTRY_BYTES),
    };
  });
  return { entries, next: order.u32(body, count * ENTRY_BYTES) };
}

function entryOf(entries: readonly Entry[], tag: number): Entry | undefined {
  return entries.find((entry) => entry.tag === tag);
}

function readNumber(order: ByteOrder, data: Buffer, type: number, at: number): number {
  const size = TYPE_SIZE[type];
  if (size === 2) return order.u16(data, at);
  if (size === 4) return order.u32(data, at);
  return data.readUInt8(at);
}

async function numbersOf(
  reader: RangeReader,
  order: ByteOrder,
  entry: Entry | undefined,
): Promise<readonly number[]> {
  const size = entry === undefined ? undefined : TYPE_SIZE[entry.type];
  if (entry === undefined || size === undefined) return [];
  const total = size * entry.count;
  const data =
    total <= 4 ? entry.field : await readExactly(reader, order.u32(entry.field, 0), total);
  return Array.from({ length: entry.count }, (_, index) =>
    readNumber(order, data, entry.type, index * size),
  );
}

function blobOf(order: ByteOrder, entry: Entry | undefined): Region | undefined {
  return entry === undefined
    ? undefined
    : { offset: order.u32(entry.field, 0), length: entry.count };
}

async function stripRegion(
  reader: RangeReader,
  order: ByteOrder,
  entries: readonly Entry[],
): Promise<Region | undefined> {
  const [compression] = await numbersOf(reader, order, entryOf(entries, TAG.compression));
  if (compression === undefined || !JPEG_COMPRESSIONS.has(compression)) return undefined;
  const offsets = await numbersOf(reader, order, entryOf(entries, TAG.stripOffsets));
  const lengths = await numbersOf(reader, order, entryOf(entries, TAG.stripByteCounts));
  const [offset] = offsets;
  const [length] = lengths;
  return offsets.length === 1 &&
    lengths.length === 1 &&
    offset !== undefined &&
    length !== undefined
    ? { offset, length }
    : undefined;
}

async function interchangeRegion(
  reader: RangeReader,
  order: ByteOrder,
  entries: readonly Entry[],
): Promise<Region | undefined> {
  const [offset] = await numbersOf(reader, order, entryOf(entries, TAG.jpegOffset));
  const [length] = await numbersOf(reader, order, entryOf(entries, TAG.jpegLength));
  return offset !== undefined && length !== undefined ? { offset, length } : undefined;
}

async function makerNoteRegions(
  reader: RangeReader,
  order: ByteOrder,
  entries: readonly Entry[],
): Promise<readonly Region[]> {
  const note = blobOf(order, entryOf(entries, TAG.makerNote));
  if (note === undefined || note.length < SONY_MAKER_NOTE_HEADER) return [];
  const head = await readExactly(reader, note.offset, SONY_MAKER_NOTE.length);
  if (head.toString('latin1') !== SONY_MAKER_NOTE) return [];
  const sony = await readIfd(reader, order, note.offset + SONY_MAKER_NOTE_HEADER);
  const preview = blobOf(order, entryOf(sony.entries, TAG.sonyPreview));
  return preview === undefined ? [] : [preview];
}

async function regionsOf(
  reader: RangeReader,
  order: ByteOrder,
  entries: readonly Entry[],
): Promise<readonly Region[]> {
  const found = [
    await interchangeRegion(reader, order, entries),
    await stripRegion(reader, order, entries),
    blobOf(order, entryOf(entries, TAG.panasonicJpeg)),
  ];
  return [
    ...found.filter((region): region is Region => region !== undefined),
    ...(await makerNoteRegions(reader, order, entries)),
  ];
}

async function childIfds(
  reader: RangeReader,
  order: ByteOrder,
  entries: readonly Entry[],
  next: number,
): Promise<readonly number[]> {
  const subs = await numbersOf(reader, order, entryOf(entries, TAG.subIfds));
  const exif = await numbersOf(reader, order, entryOf(entries, TAG.exifIfd));
  return [...subs, ...exif, next];
}

export async function jpegSize(
  reader: RangeReader,
  region: Region,
): Promise<{ readonly width: number; readonly height: number } | undefined> {
  if (region.length < 4 || region.offset + region.length > reader.size) return undefined;
  const start = await reader.read(region.offset, 2);
  if (start[0] !== 0xff || start[1] !== 0xd8) return undefined;
  let at = region.offset + 2;
  const end = region.offset + region.length;
  while (at + 4 <= end) {
    const head = await reader.read(at, 4);
    const marker = head[1];
    if (head[0] !== 0xff || marker === undefined || marker === START_OF_SCAN) return undefined;
    if (SOF_MARKERS.has(marker)) {
      const frame = await reader.read(at + 4, 5);
      return { height: frame.readUInt16BE(1), width: frame.readUInt16BE(3) };
    }
    at += 2 + head.readUInt16BE(2);
  }
  return undefined;
}

async function walk(
  reader: RangeReader,
  order: ByteOrder,
  first: number,
): Promise<{ readonly regions: readonly Region[]; readonly orientation: number | null }> {
  const visited = new Set<number>();
  const queue = [first];
  const regions: Region[] = [];
  let orientation: number | null = null;
  for (let offset = queue.shift(); offset !== undefined; offset = queue.shift()) {
    if (offset <= 0 || offset + 2 > reader.size || visited.has(offset)) continue;
    visited.add(offset);
    const { entries, next } = await readIfd(reader, order, offset);
    if (visited.size === 1) {
      [orientation = null] = await numbersOf(reader, order, entryOf(entries, TAG.orientation));
    }
    regions.push(...(await regionsOf(reader, order, entries)));
    queue.push(...(await childIfds(reader, order, entries, next)));
  }
  return { regions, orientation };
}

async function largestJpeg(
  reader: RangeReader,
  regions: readonly Region[],
  orientation: number | null,
): Promise<RawPreviewOutcome> {
  let best: RawPreview | undefined;
  for (const region of regions) {
    const size = await jpegSize(reader, region);
    if (size === undefined) continue;
    const area = size.width * size.height;
    if (best === undefined || area > best.width * best.height) {
      best = { ...region, ...size, orientation };
    }
  }
  return best === undefined
    ? { kind: 'none', reason: 'this RAW file has no embedded preview' }
    : { kind: 'found', preview: best };
}

async function findFujiPreview(reader: RangeReader): Promise<RawPreviewOutcome> {
  const fields = await readExactly(reader, FUJI_JPEG_FIELDS, 8);
  const region = { offset: BIG.u32(fields, 0), length: BIG.u32(fields, 4) };
  const size = await jpegSize(reader, region);
  return size === undefined
    ? { kind: 'none', reason: 'this RAW file has no embedded preview' }
    : { kind: 'found', preview: { ...region, ...size, orientation: null } };
}

export async function findRawPreview(reader: RangeReader): Promise<RawPreviewOutcome> {
  const head = await readExactly(reader, 0, Math.min(reader.size, FUJI_MAGIC.length));
  if (head.toString('latin1') === FUJI_MAGIC) return findFujiPreview(reader);
  const label = head.toString('latin1', 0, 2);
  const order = label === 'II' ? LITTLE : BIG;
  if ((label !== 'II' && label !== 'MM') || !TIFF_MAGICS.has(order.u16(head, 2))) {
    return { kind: 'none', reason: 'this RAW container is not one the preview reader knows' };
  }
  const { regions, orientation } = await walk(reader, order, order.u32(head, 4));
  return largestJpeg(reader, regions, orientation);
}

function oriented(image: Sharp, orientation: number): Sharp {
  switch (orientation) {
    case 2:
      return image.flop();
    case 3:
      return image.rotate(180);
    case 4:
      return image.flip();
    case 5:
      return image.flop().rotate(270);
    case 6:
      return image.rotate(90);
    case 7:
      return image.flop().rotate(90);
    case 8:
      return image.rotate(270);
    default:
      return image;
  }
}

export async function renderRawPreview(
  jpeg: Buffer,
  rawOrientation: number | null,
): Promise<{ readonly data: Uint8Array; readonly width: number; readonly height: number }> {
  const image = sharp(jpeg);
  const { orientation } = await image.metadata();
  const upright =
    orientation === undefined || orientation === 1
      ? oriented(image, rawOrientation ?? 1)
      : image.autoOrient();
  const { data, info } = await upright
    .resize({
      width: DERIVED_LONG_EDGE.preview,
      height: DERIVED_LONG_EDGE.preview,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function decodeRaw(file: PreviewFile): Promise<DecodeOutcome> {
  const outcome = await withFileReader(file.path, async (reader) => {
    const found = await findRawPreview(reader);
    if (found.kind === 'none') return found;
    const { preview } = found;
    return {
      kind: 'found' as const,
      preview,
      jpeg: await readExactly(reader, preview.offset, preview.length),
    };
  });
  if (outcome.kind === 'none') return { kind: 'unsupported', reason: outcome.reason };
  const pixels = await renderRawPreview(outcome.jpeg, outcome.preview.orientation);
  return { kind: 'decoded', source: { kind: 'pixels', ...pixels } };
}

export const RAW_DECODER: PreviewDecoder = {
  id: 'raw',
  accepts: (file) => RAW_EXTENSIONS.has(extname(file.name).slice(1).toLowerCase()),
  decode: (file) => decodeRaw(file),
};
