import { ApkFactsError } from './apk-error';

const XML_TYPE = 0x0003;
const STRING_POOL_TYPE = 0x0001;
const RESOURCE_MAP_TYPE = 0x0180;
const START_ELEMENT_TYPE = 0x0102;
const END_ELEMENT_TYPE = 0x0103;
const CHUNK_HEADER = 8;
const UTF8_FLAG = 0x100;
const NO_INDEX = 0xffffffff;
const ATTRIBUTE_SIZE = 20;
const ELEMENT_EXTENSION = 20;

const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_BOOLEAN = 0x12;

export type XmlValue =
  | { readonly kind: 'string'; readonly text: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'reference'; readonly id: number }
  | { readonly kind: 'other'; readonly type: number; readonly data: number };

export interface XmlAttribute {
  readonly namespace: string | null;
  readonly name: string;
  readonly resourceId: number | null;
  readonly value: XmlValue;
}

export interface XmlElement {
  readonly name: string;
  readonly attributes: readonly XmlAttribute[];
  readonly children: XmlElement[];
}

function broken(message: string): never {
  throw new ApkFactsError('manifest', `The binary AndroidManifest.xml is malformed: ${message}.`);
}

function need(bytes: Buffer, at: number, length: number): void {
  if (at < 0 || length < 0 || at + length > bytes.length) broken('a record runs past its chunk');
}

function u16(bytes: Buffer, at: number): number {
  need(bytes, at, 2);
  return bytes.readUInt16LE(at);
}

function u32(bytes: Buffer, at: number): number {
  need(bytes, at, 4);
  return bytes.readUInt32LE(at);
}

function utf8Length(bytes: Buffer, at: number): { readonly value: number; readonly next: number } {
  need(bytes, at, 1);
  const first = bytes.readUInt8(at);
  if ((first & 0x80) === 0) return { value: first, next: at + 1 };
  need(bytes, at, 2);
  return { value: ((first & 0x7f) << 8) | bytes.readUInt8(at + 1), next: at + 2 };
}

function utf16Length(bytes: Buffer, at: number): { readonly value: number; readonly next: number } {
  const first = u16(bytes, at);
  if ((first & 0x8000) === 0) return { value: first, next: at + 2 };
  return { value: ((first & 0x7fff) << 16) | u16(bytes, at + 2), next: at + 4 };
}

function stringAt(pool: Buffer, at: number, utf8: boolean): string {
  if (utf8) {
    const characters = utf8Length(pool, at);
    const length = utf8Length(pool, characters.next);
    need(pool, length.next, length.value);
    return pool.toString('utf8', length.next, length.next + length.value);
  }
  const length = utf16Length(pool, at);
  need(pool, length.next, length.value * 2);
  return pool.toString('utf16le', length.next, length.next + length.value * 2);
}

function stringPool(chunk: Buffer, headerSize: number): readonly string[] {
  const count = u32(chunk, 8);
  const flags = u32(chunk, 16);
  const stringsStart = u32(chunk, 20);
  need(chunk, headerSize, count * 4);
  if (count > 0) need(chunk, stringsStart, 0);
  const strings: string[] = [];
  for (let index = 0; index < count; index += 1)
    strings.push(
      stringAt(chunk, stringsStart + u32(chunk, headerSize + index * 4), (flags & UTF8_FLAG) !== 0),
    );
  return strings;
}

function resourceMap(chunk: Buffer, headerSize: number): readonly number[] {
  const ids: number[] = [];
  for (let at = headerSize; at + 4 <= chunk.length; at += 4) ids.push(chunk.readUInt32LE(at));
  return ids;
}

class Strings {
  constructor(
    private readonly strings: readonly string[],
    private readonly ids: readonly number[],
  ) {}

  text(index: number): string {
    const value = this.strings[index];
    if (value === undefined) broken(`the string index ${String(index)} is not in the pool`);
    return value;
  }

  optional(index: number): string | null {
    return index === NO_INDEX ? null : this.text(index);
  }

  resourceId(index: number): number | null {
    return this.ids[index] ?? null;
  }
}

function valueOf(chunk: Buffer, at: number, strings: Strings): XmlValue {
  const raw = u32(chunk, at + 8);
  const type = chunk.readUInt8(at + 15);
  const data = u32(chunk, at + 16);
  if (type === TYPE_STRING)
    return { kind: 'string', text: strings.text(raw === NO_INDEX ? data : raw) };
  if (type === TYPE_BOOLEAN) return { kind: 'boolean', value: data !== 0 };
  if (type === TYPE_INT_DEC || type === TYPE_INT_HEX) return { kind: 'integer', value: data };
  if (type === TYPE_REFERENCE) return { kind: 'reference', id: data };
  return { kind: 'other', type, data };
}

function element(chunk: Buffer, headerSize: number, strings: Strings): XmlElement {
  const extension = headerSize;
  need(chunk, extension, ELEMENT_EXTENSION);
  const name = strings.text(u32(chunk, extension + 4));
  const attributeStart = u16(chunk, extension + 8);
  const attributeSize = u16(chunk, extension + 10);
  const attributeCount = u16(chunk, extension + 12);
  if (attributeCount > 0 && attributeSize < ATTRIBUTE_SIZE)
    broken('an attribute record is too short');
  const attributes: XmlAttribute[] = [];
  for (let index = 0; index < attributeCount; index += 1) {
    const at = extension + attributeStart + index * attributeSize;
    need(chunk, at, ATTRIBUTE_SIZE);
    const nameIndex = u32(chunk, at + 4);
    attributes.push({
      namespace: strings.optional(u32(chunk, at)),
      name: strings.text(nameIndex),
      resourceId: strings.resourceId(nameIndex),
      value: valueOf(chunk, at, strings),
    });
  }
  return { name, attributes, children: [] };
}

class Document {
  private pool: readonly string[] = [];
  private strings = new Strings([], []);
  private root: XmlElement | null = null;
  private readonly open: XmlElement[] = [];

  read(type: number, chunk: Buffer, headerSize: number): void {
    if (type === STRING_POOL_TYPE) {
      this.pool = stringPool(chunk, headerSize);
      this.strings = new Strings(this.pool, []);
    } else if (type === RESOURCE_MAP_TYPE)
      this.strings = new Strings(this.pool, resourceMap(chunk, headerSize));
    else if (type === START_ELEMENT_TYPE) this.start(element(chunk, headerSize, this.strings));
    else if (type === END_ELEMENT_TYPE && this.open.pop() === undefined)
      broken('an element ends that never started');
  }

  finished(): XmlElement {
    if (this.root === null || this.open.length > 0) broken('the elements are not closed');
    return this.root;
  }

  private start(started: XmlElement): void {
    const parent = this.open.at(-1);
    if (parent !== undefined) parent.children.push(started);
    else if (this.root === null) this.root = started;
    else broken('it has more than one root element');
    this.open.push(started);
  }
}

export function parseBinaryXml(bytes: Buffer): XmlElement {
  if (u16(bytes, 0) !== XML_TYPE) broken('it is not a binary XML document');
  const headerSize = u16(bytes, 2);
  const size = u32(bytes, 4);
  if (size > bytes.length || headerSize < CHUNK_HEADER) broken('the document header is wrong');
  const document = new Document();
  for (let at = headerSize; at < size;) {
    const chunkHeader = u16(bytes, at + 2);
    const chunkSize = u32(bytes, at + 4);
    if (chunkSize < CHUNK_HEADER || chunkHeader > chunkSize || at + chunkSize > size)
      broken('a chunk has a wrong size');
    document.read(u16(bytes, at), bytes.subarray(at, at + chunkSize), chunkHeader);
    at += chunkSize;
  }
  return document.finished();
}
