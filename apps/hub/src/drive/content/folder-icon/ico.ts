import sharp from 'sharp';
import { isPng } from './icns';

const DIRECTORY_BYTES = 6;

const ENTRY_BYTES = 16;

const INFO_BYTES = 40;

const SUPPORTED_DEPTHS = [1, 4, 8, 24, 32];

interface Entry {
  readonly width: number;
  readonly height: number;
  readonly bitCount: number;
  readonly size: number;
  readonly offset: number;
}

export class IcoError extends Error {
  override readonly name = 'IcoError';
}

function entriesOf(view: DataView): readonly Entry[] {
  const reserved = view.byteLength >= DIRECTORY_BYTES ? view.getUint16(0, true) : 1;
  const type = view.byteLength >= DIRECTORY_BYTES ? view.getUint16(2, true) : 0;
  if (reserved !== 0 || type !== 1) {
    throw new IcoError('The file is not an icon.');
  }
  const count = view.getUint16(4, true);
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = DIRECTORY_BYTES + index * ENTRY_BYTES;
    if (at + ENTRY_BYTES > view.byteLength) break;
    entries.push({
      width: view.getUint8(at) === 0 ? 256 : view.getUint8(at),
      height: view.getUint8(at + 1) === 0 ? 256 : view.getUint8(at + 1),
      bitCount: view.getUint16(at + 6, true),
      size: view.getUint32(at + 8, true),
      offset: view.getUint32(at + 12, true),
    });
  }
  return entries;
}

function area(entry: Entry): number {
  return entry.width * entry.height;
}

function better(entry: Entry, current: Entry): boolean {
  return (
    area(entry) > area(current) ||
    (area(entry) === area(current) && entry.bitCount > current.bitCount)
  );
}

function largest(entries: readonly Entry[]): Entry {
  const [first, ...rest] = entries;
  if (first === undefined) throw new IcoError('The icon holds no images.');
  return rest.reduce((current, entry) => (better(entry, current) ? entry : current), first);
}

function bit(row: Uint8Array, column: number): number {
  return ((row[column >> 3] ?? 0) >> (7 - (column & 7))) & 1;
}

interface Header {
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly bits: number;
  readonly paletteSize: number;
}

function headerOf(data: Uint8Array): Header {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < INFO_BYTES || view.getUint32(0, true) < INFO_BYTES) {
    throw new IcoError('The icon image header is not a bitmap header.');
  }
  const bits = view.getUint16(14, true);
  const colours = view.getUint32(32, true);
  const width = view.getInt32(4, true);
  const height = Math.trunc(Math.abs(view.getInt32(8, true)) / 2);
  if (view.getUint32(16, true) !== 0) {
    throw new IcoError('Compressed bitmap icons are not supported.');
  }
  if (!SUPPORTED_DEPTHS.includes(bits)) {
    throw new IcoError(`A ${String(bits)}-bit bitmap icon is not supported.`);
  }
  if (width <= 0 || height <= 0) throw new IcoError('The icon image has no size.');
  const paletteSize = bits <= 8 ? (colours === 0 ? 1 << bits : colours) : 0;
  return { size: view.getUint32(0, true), width, height, bits, paletteSize };
}

type Rgb = readonly [number, number, number];

function colourReader(
  data: Uint8Array,
  header: Header,
): (row: Uint8Array, x: number) => readonly [...Rgb, number] {
  const { bits } = header;
  if (bits >= 24) {
    return (row, x) => {
      const at = x * (bits / 8);
      return [
        row[at + 2] ?? 0,
        row[at + 1] ?? 0,
        row[at] ?? 0,
        bits === 32 ? (row[at + 3] ?? 0) : 255,
      ];
    };
  }
  return (row, x) => {
    const index =
      bits === 8
        ? (row[x] ?? 0)
        : bits === 4
          ? ((row[x >> 1] ?? 0) >> (x & 1 ? 0 : 4)) & 0x0f
          : bit(row, x);
    const at = header.size + index * 4;
    return [data[at + 2] ?? 0, data[at + 1] ?? 0, data[at] ?? 0, 255];
  };
}

interface Dib {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

function maskAlpha(data: Uint8Array, header: Header, maskAt: number): Uint8Array {
  const { width, height } = header;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = maskAt + (height - 1 - y) * maskRowBytes;
    const mask = start + maskRowBytes <= data.length ? data.subarray(start) : null;
    for (let x = 0; x < width; x += 1) {
      alpha[y * width + x] = mask !== null && bit(mask, x) === 1 ? 0 : 255;
    }
  }
  return alpha;
}

function decodeDib(data: Uint8Array): Dib {
  const header = headerOf(data);
  const { width, height, bits } = header;
  const pixelsAt = header.size + header.paletteSize * 4;
  const rowBytes = Math.ceil((width * bits) / 32) * 4;
  const maskAt = pixelsAt + rowBytes * height;
  if (maskAt > data.length) throw new IcoError('The icon image is cut short.');
  const colourAt = colourReader(data, header);
  const rgba = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y += 1) {
    const row = data.subarray(pixelsAt + (height - 1 - y) * rowBytes);
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = colourAt(row, x);
      anyAlpha ||= bits === 32 && alpha !== 0;
      rgba.set([red, green, blue, alpha], (y * width + x) * 4);
    }
  }
  if (bits !== 32 || !anyAlpha) {
    const alpha = maskAlpha(data, header, maskAt);
    for (let index = 0; index < alpha.length; index += 1) rgba[index * 4 + 3] = alpha[index] ?? 255;
  }
  return { width, height, rgba };
}

export async function icoImagePng(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entry = largest(entriesOf(view));
  const data = bytes.subarray(entry.offset, entry.offset + entry.size);
  if (data.length < entry.size) throw new IcoError('The icon image is cut short.');
  if (isPng(data)) return data;
  const { width, height, rgba } = decodeDib(data);
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
