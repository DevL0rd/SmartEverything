export class LayoutRejected extends Error {
  override readonly name = 'LayoutRejected';
}

export function reject(reason: string): never {
  throw new LayoutRejected(reason);
}

export interface StripResult {
  readonly exif: boolean;
  readonly xmpProperties: number;
}

const TYPE_SIZE: ReadonlyMap<number, number> = new Map([
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 4],
  [5, 8],
  [6, 1],
  [7, 1],
  [8, 2],
  [9, 4],
  [10, 8],
  [11, 4],
  [12, 8],
  [13, 4],
]);
const GPS_POINTER = 0x8825;
const SUB_IFDS = 0x014a;
const ENTRY_SIZE = 12;
const XMP_NAMES =
  '(?:GPS[A-Za-z]*|City|State|Country|CountryCode|Location|Sublocation|LocationCreated|LocationShown)';
const XMP_ATTRIBUTE = new RegExp(String.raw`\s[A-Za-z0-9]+:${XMP_NAMES}="[^"]*"`, 'g');
const XMP_ELEMENT = new RegExp(
  String.raw`<([A-Za-z0-9]+:${XMP_NAMES})(?:\s[^>]*)?>[\s\S]*?</\1>`,
  'g',
);
const XMP_OPEN = '<x:xmpmeta';
const XMP_CLOSE = '</x:xmpmeta>';

export function isTiffHeader(buf: Buffer, at: number): boolean {
  const head = buf.toString('latin1', at, at + 4);
  return head === 'II*\0' || head === 'MM\0*';
}

export class Tiff {
  private readonly little: boolean;
  private readonly visited = new Set<number>();

  constructor(
    private readonly buf: Buffer,
    private readonly base: number,
  ) {
    if (!isTiffHeader(buf, base)) reject('the TIFF header is missing');
    this.little = buf.toString('latin1', base, base + 2) === 'II';
  }

  private span(offset: number, length: number): number {
    if (offset < 0 || length < 0 || offset + length > this.buf.length) {
      reject('an offset points outside the file');
    }
    return offset;
  }

  private u16(offset: number): number {
    this.span(offset, 2);
    return this.little ? this.buf.readUInt16LE(offset) : this.buf.readUInt16BE(offset);
  }

  private u32(offset: number): number {
    this.span(offset, 4);
    return this.little ? this.buf.readUInt32LE(offset) : this.buf.readUInt32BE(offset);
  }

  private put16(offset: number, value: number): void {
    if (this.little) this.buf.writeUInt16LE(value, offset);
    else this.buf.writeUInt16BE(value, offset);
  }

  private put32(offset: number, value: number): void {
    if (this.little) this.buf.writeUInt32LE(value, offset);
    else this.buf.writeUInt32BE(value, offset);
  }

  private wipeGpsIfd(gps: number): void {
    const count = this.u16(gps);
    const end = gps + 2 + count * ENTRY_SIZE + 4;
    this.span(gps, end - gps);
    for (let index = 0; index < count; index++) {
      const entry = gps + 2 + index * ENTRY_SIZE;
      const unit = TYPE_SIZE.get(this.u16(entry + 2));
      if (unit === undefined) reject('a GPS entry has an unknown type');
      const size = unit * this.u32(entry + 4);
      if (size <= 4) continue;
      const value = this.span(this.base + this.u32(entry + 8), size);
      this.buf.fill(0, value, value + size);
    }
    this.buf.fill(0, gps, end);
  }

  private dropGps(ifd: number, count: number, index: number): void {
    const entry = ifd + 2 + index * ENTRY_SIZE;
    if (this.u16(entry + 2) !== 4 || this.u32(entry + 4) !== 1) {
      reject('the GPS pointer is not a single LONG');
    }
    this.wipeGpsIfd(this.base + this.u32(entry + 8));
    const end = ifd + 2 + count * ENTRY_SIZE;
    const next = this.u32(end);
    this.buf.copy(this.buf, entry, entry + ENTRY_SIZE, end);
    this.put16(ifd, count - 1);
    this.put32(end - ENTRY_SIZE, next);
    this.buf.fill(0, end - ENTRY_SIZE + 4, end + 4);
  }

  private subIfds(entry: number): readonly number[] {
    const count = this.u32(entry + 4);
    const where = count === 1 ? entry + 8 : this.base + this.u32(entry + 8);
    this.span(where, count * 4);
    return Array.from({ length: count }, (_, index) => this.u32(where + index * 4));
  }

  private stripIfd(relative: number, queue: number[]): boolean {
    const ifd = this.span(this.base + relative, 2);
    const count = this.u16(ifd);
    this.span(ifd, 2 + count * ENTRY_SIZE + 4);
    let gps = -1;
    for (let index = 0; index < count; index++) {
      const entry = ifd + 2 + index * ENTRY_SIZE;
      const tag = this.u16(entry);
      if (tag === GPS_POINTER) gps = index;
      else if (tag === SUB_IFDS) queue.push(...this.subIfds(entry));
    }
    if (gps >= 0) this.dropGps(ifd, count, gps);
    const remaining = gps >= 0 ? count - 1 : count;
    const next = this.u32(ifd + 2 + remaining * ENTRY_SIZE);
    if (next !== 0) queue.push(next);
    return gps >= 0;
  }

  removeGps(): boolean {
    const queue = [this.u32(this.base + 4)];
    let removed = false;
    for (const relative of queue) {
      if (this.visited.has(relative)) continue;
      this.visited.add(relative);
      removed = this.stripIfd(relative, queue) || removed;
    }
    return removed;
  }
}

export function stripXmpLocation(packet: Buffer): number {
  let removed = 0;
  const blank = (match: string): string => {
    removed += 1;
    return ' '.repeat(match.length);
  };
  const result = packet
    .toString('latin1')
    .replace(XMP_ATTRIBUTE, blank)
    .replace(XMP_ELEMENT, blank);
  packet.write(result, 0, 'latin1');
  return removed;
}

export function stripXmpPackets(buf: Buffer): number {
  let total = 0;
  let from = 0;
  for (;;) {
    const start = buf.indexOf(XMP_OPEN, from);
    if (start < 0) return total;
    const close = buf.indexOf(XMP_CLOSE, start);
    if (close < 0) reject('an XMP packet is not closed');
    const end = close + XMP_CLOSE.length;
    total += stripXmpLocation(buf.subarray(start, end));
    from = end;
  }
}

export function stripTiff(buf: Buffer): StripResult {
  return { exif: new Tiff(buf, 0).removeGps(), xmpProperties: stripXmpPackets(buf) };
}
