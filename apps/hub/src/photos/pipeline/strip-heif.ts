import { Tiff, reject, stripXmpLocation, type StripResult } from './strip-tiff';

const EXIF_TYPE = 'Exif';
const MIME_TYPE = 'mime';
const XMP_CONTENT = 'application/rdf+xml';
const FILE_OFFSET = 0;

interface Box {
  readonly type: string;
  readonly body: number;
  readonly end: number;
}

interface Extent {
  readonly offset: number;
  readonly length: number;
}

interface Item {
  readonly type: string;
  readonly content: string;
}

class Cursor {
  constructor(
    private readonly buf: Buffer,
    public position: number,
    private readonly end: number,
  ) {}

  private take(length: number): number {
    const at = this.position;
    if (at + length > this.end) reject('a box ends before its fields');
    this.position += length;
    return at;
  }

  skip(length: number): void {
    this.take(length);
  }

  uint(size: number): number {
    if (size === 0) return 0;
    const at = this.take(size);
    if (size === 1) return this.buf.readUInt8(at);
    if (size === 2) return this.buf.readUInt16BE(at);
    if (size === 4) return this.buf.readUInt32BE(at);
    if (size === 8) return Number(this.buf.readBigUInt64BE(at));
    return reject(`an unsupported field size of ${String(size)}`);
  }

  fourcc(): string {
    return this.buf.toString('latin1', this.take(4), this.position);
  }

  text(): string {
    const stop = this.buf.indexOf(0, this.position);
    if (stop < 0 || stop >= this.end) reject('a string is not terminated');
    const value = this.buf.toString('utf8', this.position, stop);
    this.position = stop + 1;
    return value;
  }
}

function boxesIn(buf: Buffer, start: number, end: number): readonly Box[] {
  const found: Box[] = [];
  const cursor = new Cursor(buf, start, end);
  while (end - cursor.position >= 8) {
    const at = cursor.position;
    const declared = cursor.uint(4);
    const type = cursor.fourcc();
    const size = declared === 1 ? cursor.uint(8) : declared === 0 ? end - at : declared;
    const headerLength = cursor.position - at;
    if (size < headerLength || at + size > end) reject(`the ${type} box overruns its parent`);
    found.push({ type, body: at + headerLength, end: at + size });
    cursor.position = at + size;
  }
  return found;
}

function findBox(boxes: readonly Box[], type: string): Box {
  return boxes.find((box) => box.type === type) ?? reject(`the ${type} box is missing`);
}

function readItems(buf: Buffer, iinf: Box): ReadonlyMap<number, Item> {
  const cursor = new Cursor(buf, iinf.body, iinf.end);
  const version = cursor.uint(1);
  cursor.skip(3);
  cursor.skip(version === 0 ? 2 : 4);
  const items = new Map<number, Item>();
  for (const infe of boxesIn(buf, cursor.position, iinf.end)) {
    const entry = new Cursor(buf, infe.body, infe.end);
    const entryVersion = entry.uint(1);
    entry.skip(3);
    if (entryVersion < 2) reject('an item info entry predates version 2');
    const id = entry.uint(entryVersion === 2 ? 2 : 4);
    entry.skip(2);
    const type = entry.fourcc();
    entry.text();
    items.set(id, { type, content: type === MIME_TYPE ? entry.text() : '' });
  }
  return items;
}

function readLocations(buf: Buffer, iloc: Box): ReadonlyMap<number, readonly Extent[]> {
  const cursor = new Cursor(buf, iloc.body, iloc.end);
  const version = cursor.uint(1);
  cursor.skip(3);
  const sizes = cursor.uint(2);
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 0xf;
  const baseSize = (sizes >> 4) & 0xf;
  const indexSize = version === 1 || version === 2 ? sizes & 0xf : 0;
  const count = cursor.uint(version < 2 ? 2 : 4);
  const locations = new Map<number, readonly Extent[]>();
  for (let item = 0; item < count; item++) {
    const id = cursor.uint(version < 2 ? 2 : 4);
    const method = version === 0 ? FILE_OFFSET : cursor.uint(2) & 0xf;
    cursor.skip(2);
    const base = cursor.uint(baseSize);
    const extents: Extent[] = [];
    for (let index = cursor.uint(2); index > 0; index--) {
      cursor.skip(indexSize);
      extents.push({ offset: base + cursor.uint(offsetSize), length: cursor.uint(lengthSize) });
    }
    if (method === FILE_OFFSET) locations.set(id, extents);
  }
  return locations;
}

function singleExtent(extents: readonly Extent[], buf: Buffer): Extent {
  const only = extents.length === 1 ? extents[0] : undefined;
  if (only === undefined || only.offset + only.length > buf.length) {
    reject('an item is not one extent inside the file');
  }
  return only;
}

function stripExif(buf: Buffer, extent: Extent): boolean {
  const tiffOffset = buf.readUInt32BE(extent.offset);
  return new Tiff(buf, extent.offset + 4 + tiffOffset).removeGps();
}

export function stripIsoBmffStill(buf: Buffer): StripResult {
  const meta = findBox(boxesIn(buf, 0, buf.length), 'meta');
  const children = boxesIn(buf, meta.body + 4, meta.end);
  const items = readItems(buf, findBox(children, 'iinf'));
  const locations = readLocations(buf, findBox(children, 'iloc'));
  let exif = false;
  let xmpProperties = 0;
  for (const [id, item] of items) {
    const extents = locations.get(id);
    if (extents === undefined) continue;
    if (item.type === EXIF_TYPE) exif = stripExif(buf, singleExtent(extents, buf)) || exif;
    if (item.type === MIME_TYPE && item.content === XMP_CONTENT) {
      const extent = singleExtent(extents, buf);
      xmpProperties += stripXmpLocation(buf.subarray(extent.offset, extent.offset + extent.length));
    }
  }
  return { exif, xmpProperties };
}
