import { IppEncodeError } from './errors';

export type RasterSpace = 'srgb' | 'sgray';

export const SHEET_BACKS = ['normal', 'flipped', 'rotated', 'manual-tumble'] as const;

export type SheetBack = (typeof SHEET_BACKS)[number];

export type Flip = 1 | -1;

export interface PageTransform {
  readonly crossFeed: Flip;
  readonly feed: Flip;
}

const UNCHANGED: PageTransform = { crossFeed: 1, feed: 1 };
const TURNED: PageTransform = { crossFeed: -1, feed: -1 };

export function backTransform(sheetBack: SheetBack, tumble: boolean): PageTransform {
  switch (sheetBack) {
    case 'normal':
      return UNCHANGED;
    case 'manual-tumble':
      return tumble ? TURNED : UNCHANGED;
    case 'rotated':
      return tumble ? UNCHANGED : TURNED;
    case 'flipped':
      return tumble ? { crossFeed: 1, feed: -1 } : { crossFeed: -1, feed: 1 };
  }
}

export interface RasterPage {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly space: RasterSpace;
  readonly pixels: Uint8Array;
  readonly pageSizeName: string;
  readonly quality: number;
  readonly copies: number;
  readonly duplex: boolean;
  readonly tumble: boolean;
  readonly transform: PageTransform;
}

const SYNC_WORD = 'RaS2';
const HEADER_LENGTH = 1796;
const POINTS_PER_INCH = 72;
const MAX_RUN = 128;
const MAX_REPEAT = 256;
const SPACES = {
  srgb: { colorSpace: 19, colors: 3 },
  sgray: { colorSpace: 18, colors: 1 },
} as const;
const OFFSET = {
  mediaClass: 0,
  duplex: 272,
  resolution: 276,
  copies: 340,
  pageSize: 352,
  tumble: 368,
  width: 372,
  height: 376,
  bitsPerColor: 384,
  bitsPerPixel: 388,
  bytesPerLine: 392,
  colorOrder: 396,
  colorSpace: 400,
  numColors: 420,
  imageBoxRight: 472,
  imageBoxBottom: 476,
  crossFeedTransform: 456,
  feedTransform: 460,
  quality: 484,
  pageSizeName: 1732,
} as const;
const TEXT_FIELD_LENGTH = 64;

function ascii(header: Uint8Array, offset: number, text: string): void {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length >= TEXT_FIELD_LENGTH) {
    throw new IppEncodeError('a raster text field', 'at most 63 characters', text);
  }
  header.set(bytes, offset);
}

function headerOf(page: RasterPage): Uint8Array {
  const header = new Uint8Array(HEADER_LENGTH);
  const view = new DataView(header.buffer);
  const space = SPACES[page.space];
  ascii(header, OFFSET.mediaClass, 'PwgRaster');
  ascii(header, OFFSET.pageSizeName, page.pageSizeName);
  view.setUint32(OFFSET.duplex, page.duplex ? 1 : 0);
  view.setUint32(OFFSET.resolution, page.dpi);
  view.setUint32(OFFSET.resolution + 4, page.dpi);
  view.setUint32(OFFSET.copies, page.copies);
  view.setUint32(OFFSET.pageSize, Math.round((page.width / page.dpi) * POINTS_PER_INCH));
  view.setUint32(OFFSET.pageSize + 4, Math.round((page.height / page.dpi) * POINTS_PER_INCH));
  view.setUint32(OFFSET.tumble, page.tumble ? 1 : 0);
  view.setUint32(OFFSET.width, page.width);
  view.setUint32(OFFSET.height, page.height);
  view.setUint32(OFFSET.bitsPerColor, 8);
  view.setUint32(OFFSET.bitsPerPixel, 8 * space.colors);
  view.setUint32(OFFSET.bytesPerLine, page.width * space.colors);
  view.setUint32(OFFSET.colorOrder, 0);
  view.setUint32(OFFSET.colorSpace, space.colorSpace);
  view.setUint32(OFFSET.numColors, space.colors);
  view.setUint32(OFFSET.imageBoxRight, page.width);
  view.setUint32(OFFSET.imageBoxBottom, page.height);
  view.setInt32(OFFSET.crossFeedTransform, page.transform.crossFeed);
  view.setInt32(OFFSET.feedTransform, page.transform.feed);
  view.setUint32(OFFSET.quality, page.quality);
  return header;
}

function samePixel(row: Uint8Array, left: number, right: number, size: number): boolean {
  for (let byte = 0; byte < size; byte += 1) {
    if (row[left * size + byte] !== row[right * size + byte]) return false;
  }
  return true;
}

function runLength(row: Uint8Array, start: number, count: number, size: number): number {
  let length = 1;
  while (
    start + length < count &&
    length < MAX_RUN &&
    samePixel(row, start, start + length, size)
  ) {
    length += 1;
  }
  return length;
}

function literalLength(row: Uint8Array, start: number, count: number, size: number): number {
  let length = 1;
  while (
    start + length < count &&
    length < MAX_RUN &&
    !(start + length + 1 < count && samePixel(row, start + length, start + length + 1, size))
  ) {
    length += 1;
  }
  return length;
}

class ByteSink {
  #bytes = new Uint8Array(65_536);
  #length = 0;

  #reserve(extra: number): void {
    if (this.#length + extra <= this.#bytes.length) return;
    const grown = new Uint8Array(Math.max(this.#bytes.length * 2, this.#length + extra));
    grown.set(this.#bytes.subarray(0, this.#length));
    this.#bytes = grown;
  }

  byte(value: number): void {
    this.#reserve(1);
    this.#bytes[this.#length] = value;
    this.#length += 1;
  }

  bytes(values: Uint8Array): void {
    this.#reserve(values.length);
    this.#bytes.set(values, this.#length);
    this.#length += values.length;
  }

  result(): Uint8Array {
    return this.#bytes.subarray(0, this.#length);
  }
}

function packRow(row: Uint8Array, size: number, sink: ByteSink): void {
  const count = row.length / size;
  let index = 0;
  while (index < count) {
    const run = runLength(row, index, count, size);
    if (run > 1 || index + 1 === count) {
      sink.byte(run - 1);
      sink.bytes(row.subarray(index * size, (index + 1) * size));
      index += run;
    } else {
      const literal = literalLength(row, index, count, size);
      sink.byte(257 - literal);
      sink.bytes(row.subarray(index * size, (index + literal) * size));
      index += literal;
    }
  }
}

function rowsEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(left, right) === 0;
}

function repeatedRows(page: RasterPage, row: number, stride: number): number {
  const current = page.pixels.subarray(row * stride, (row + 1) * stride);
  let repeat = 1;
  while (
    row + repeat < page.height &&
    repeat < MAX_REPEAT &&
    rowsEqual(current, page.pixels.subarray((row + repeat) * stride, (row + repeat + 1) * stride))
  ) {
    repeat += 1;
  }
  return repeat;
}

function pageBody(page: RasterPage, sink: ByteSink): void {
  const size = SPACES[page.space].colors;
  const stride = page.width * size;
  if (page.pixels.length !== stride * page.height) {
    throw new IppEncodeError(
      'raster pixels',
      `${String(stride * page.height)} bytes`,
      `${String(page.pixels.length)} bytes`,
    );
  }
  let row = 0;
  while (row < page.height) {
    const repeat = repeatedRows(page, row, stride);
    sink.byte(repeat - 1);
    packRow(page.pixels.subarray(row * stride, (row + 1) * stride), size, sink);
    row += repeat;
  }
}

export function pwgRasterSync(): Uint8Array {
  return new TextEncoder().encode(SYNC_WORD);
}

export function pwgRasterPage(page: RasterPage): Uint8Array {
  const sink = new ByteSink();
  sink.bytes(headerOf(page));
  pageBody(page, sink);
  return sink.result();
}

export function pwgRaster(pages: readonly RasterPage[]): Uint8Array {
  const sink = new ByteSink();
  sink.bytes(pwgRasterSync());
  for (const page of pages) sink.bytes(pwgRasterPage(page));
  return sink.result();
}
