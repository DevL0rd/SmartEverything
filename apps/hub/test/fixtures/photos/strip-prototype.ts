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
]);
const GPS_POINTER = 0x8825;
const XMP_NAMES =
  '(?:GPS[A-Za-z]*|City|State|Country|CountryCode|Location|Sublocation|LocationCreated|LocationShown)';
const XMP_ATTRIBUTE = new RegExp(String.raw`\s[A-Za-z0-9]+:${XMP_NAMES}="[^"]*"`, 'g');
const XMP_ELEMENT = new RegExp(
  String.raw`<([A-Za-z0-9]+:${XMP_NAMES})(?:\s[^>]*)?>[\s\S]*?</\1>`,
  'g',
);
const XMP_APP1 = 'http://ns.adobe.com/xap/1.0/\0';
const EXIF_APP1 = 'Exif\0\0';

export interface StripResult {
  readonly exif: boolean;
  readonly xmpProperties: number;
}

class Tiff {
  private readonly little: boolean;

  constructor(
    private readonly buf: Buffer,
    private readonly base: number,
  ) {
    this.little = buf.toString('latin1', base, base + 2) === 'II';
  }

  private u16(offset: number): number {
    return this.little ? this.buf.readUInt16LE(offset) : this.buf.readUInt16BE(offset);
  }

  private u32(offset: number): number {
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
    for (let index = 0; index < count; index++) {
      const entry = gps + 2 + index * 12;
      const size = (TYPE_SIZE.get(this.u16(entry + 2)) ?? 1) * this.u32(entry + 4);
      const value = this.base + this.u32(entry + 8);
      if (size > 4) this.buf.fill(0, value, value + size);
    }
    this.buf.fill(0, gps, gps + 2 + count * 12 + 4);
  }

  private dropEntry(ifd: number, count: number, entry: number): void {
    const end = ifd + 2 + count * 12;
    const next = this.u32(end);
    this.buf.copy(this.buf, entry, entry + 12, end);
    this.put16(ifd, count - 1);
    this.put32(end - 12, next);
    this.buf.fill(0, end - 8, end + 4);
  }

  removeGps(): boolean {
    const ifd = this.base + this.u32(this.base + 4);
    const count = this.u16(ifd);
    for (let index = 0; index < count; index++) {
      const entry = ifd + 2 + index * 12;
      if (this.u16(entry) !== GPS_POINTER) continue;
      this.wipeGpsIfd(this.base + this.u32(entry + 8));
      this.dropEntry(ifd, count, entry);
      return true;
    }
    return false;
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

export function stripJpeg(buf: Buffer): StripResult {
  let position = 2;
  let exif = false;
  let xmpProperties = 0;
  while (position + 4 <= buf.length && buf.readUInt8(position) === 0xff) {
    const marker = buf.readUInt8(position + 1);
    if (marker === 0xda) break;
    const length = buf.readUInt16BE(position + 2);
    const body = position + 4;
    if (marker === 0xe1 && buf.toString('latin1', body, body + 6) === EXIF_APP1) {
      exif = new Tiff(buf, body + 6).removeGps();
    }
    if (marker === 0xe1 && buf.toString('latin1', body, body + XMP_APP1.length) === XMP_APP1) {
      xmpProperties += stripXmpLocation(buf.subarray(body, position + 2 + length));
    }
    position += 2 + length;
  }
  return { exif, xmpProperties };
}

function stripXmpPackets(buf: Buffer): number {
  let total = 0;
  let from = 0;
  for (;;) {
    const start = buf.indexOf('<?xpacket begin', from);
    if (start < 0) return total;
    const end = buf.indexOf('<?xpacket end', start);
    total += stripXmpLocation(buf.subarray(start, end));
    from = end;
  }
}

function isTiffHeader(buf: Buffer, at: number): boolean {
  const head = buf.toString('latin1', at, at + 4);
  return head === 'II*\0' || head === 'MM\0*';
}

export function stripTiff(buf: Buffer): StripResult {
  return { exif: new Tiff(buf, 0).removeGps(), xmpProperties: stripXmpPackets(buf) };
}

export function stripIsoBmffStill(buf: Buffer): StripResult {
  let exif = false;
  let from = 0;
  for (;;) {
    const at = buf.indexOf(EXIF_APP1, from);
    if (at < 0) break;
    const tiff = at + EXIF_APP1.length;
    if (isTiffHeader(buf, tiff)) exif = new Tiff(buf, tiff).removeGps() || exif;
    from = tiff;
  }
  return { exif, xmpProperties: stripXmpPackets(buf) };
}
