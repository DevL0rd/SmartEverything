import { IppEncodeError } from './errors';
import {
  isStringValue,
  type IppAttribute,
  type IppGroup,
  type IppMessage,
  type IppValue,
} from './model';
import { GROUP_TAG, OUT_OF_BAND_TAGS, STRING_TAGS, VALUE_TAG } from './tags';

const MAX_FIELD = 0xffff;
const UTF8 = new TextEncoder();
const INITIAL_SIZE = 1024;

class Writer {
  #bytes = new Uint8Array(INITIAL_SIZE);
  #view = new DataView(this.#bytes.buffer);
  #length = 0;

  #reserve(count: number): void {
    if (this.#length + count <= this.#bytes.length) return;
    const grown = new Uint8Array(Math.max(this.#bytes.length * 2, this.#length + count));
    grown.set(this.#bytes.subarray(0, this.#length));
    this.#bytes = grown;
    this.#view = new DataView(grown.buffer);
  }

  u8(value: number): void {
    this.#reserve(1);
    this.#view.setUint8(this.#length, value);
    this.#length += 1;
  }

  u16(value: number): void {
    this.#reserve(2);
    this.#view.setUint16(this.#length, value);
    this.#length += 2;
  }

  i32(value: number): void {
    this.#reserve(4);
    this.#view.setInt32(this.#length, value);
    this.#length += 4;
  }

  bytes(value: Uint8Array): void {
    this.#reserve(value.length);
    this.#bytes.set(value, this.#length);
    this.#length += value.length;
  }

  result(): Uint8Array {
    return this.#bytes.slice(0, this.#length);
  }
}

function sized(field: string, bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_FIELD) {
    throw new IppEncodeError(
      field,
      `at most ${String(MAX_FIELD)} bytes`,
      `${String(bytes.length)} bytes`,
    );
  }
  return bytes;
}

function put(writer: Writer, tag: number, name: string, value: Uint8Array): void {
  writer.u8(tag);
  const nameBytes = sized('an attribute name', UTF8.encode(name));
  writer.u16(nameBytes.length);
  writer.bytes(nameBytes);
  writer.u16(sized('a value', value).length);
  writer.bytes(value);
}

function integerBytes(...values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    view.setInt32(index * 4, value);
  });
  return bytes;
}

function dateTimeBytes(iso: string): Uint8Array {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new IppEncodeError('a dateTime', 'an ISO 8601 timestamp', iso);
  }
  const bytes = new Uint8Array(11);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, date.getUTCFullYear());
  view.setUint8(2, date.getUTCMonth() + 1);
  view.setUint8(3, date.getUTCDate());
  view.setUint8(4, date.getUTCHours());
  view.setUint8(5, date.getUTCMinutes());
  view.setUint8(6, date.getUTCSeconds());
  view.setUint8(7, Math.floor(date.getUTCMilliseconds() / 100));
  view.setUint8(8, '+'.charCodeAt(0));
  return bytes;
}

function resolutionBytes(x: number, y: number, units: number): Uint8Array {
  const bytes = new Uint8Array(9);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, x);
  view.setInt32(4, y);
  view.setInt8(8, units);
  return bytes;
}

function writeCollection(writer: Writer, members: readonly IppAttribute[]): void {
  for (const member of members) {
    put(writer, VALUE_TAG.memberAttrName, '', sized('a member name', UTF8.encode(member.name)));
    for (const value of member.values) writeValue(writer, value, '');
  }
  put(writer, VALUE_TAG.endCollection, '', new Uint8Array(0));
}

type NumericValue = Extract<IppValue, { kind: 'integer' | 'enum' | 'boolean' | 'range' }>;

function numericLeaf(value: NumericValue): readonly [number, Uint8Array] {
  switch (value.kind) {
    case 'integer':
      return [VALUE_TAG.integer, integerBytes(value.value)];
    case 'enum':
      return [VALUE_TAG.enum, integerBytes(value.value)];
    case 'boolean':
      return [VALUE_TAG.boolean, Uint8Array.of(value.value ? 1 : 0)];
    case 'range':
      return [VALUE_TAG.rangeOfInteger, integerBytes(value.lower, value.upper)];
  }
}

function leaf(value: Exclude<IppValue, { kind: 'collection' }>): readonly [number, Uint8Array] {
  if (isStringValue(value)) return [STRING_TAGS[value.kind], UTF8.encode(value.value)];
  if (value.kind === 'octets') return [value.tag, value.value];
  if (value.kind === 'dateTime') return [VALUE_TAG.dateTime, dateTimeBytes(value.value)];
  if (value.kind === 'resolution') {
    return [VALUE_TAG.resolution, resolutionBytes(value.x, value.y, value.units)];
  }
  if (value.kind === 'outOfBand') return [OUT_OF_BAND_TAGS[value.value], new Uint8Array(0)];
  return numericLeaf(value);
}

function writeValue(writer: Writer, value: IppValue, name: string): void {
  if (value.kind === 'collection') {
    put(writer, VALUE_TAG.beginCollection, name, new Uint8Array(0));
    writeCollection(writer, value.members);
    return;
  }
  const [tag, bytes] = leaf(value);
  put(writer, tag, name, bytes);
}

function writeAttribute(writer: Writer, attribute: IppAttribute): void {
  if (attribute.values.length === 0) {
    throw new IppEncodeError(attribute.name, 'at least one value', 'none');
  }
  attribute.values.forEach((value, index) => {
    writeValue(writer, value, index === 0 ? attribute.name : '');
  });
}

function writeGroup(writer: Writer, group: IppGroup): void {
  writer.u8(group.tag);
  for (const attribute of group.attributes) writeAttribute(writer, attribute);
}

export function encodeMessage(message: IppMessage): Uint8Array {
  const writer = new Writer();
  writer.u8(message.major);
  writer.u8(message.minor);
  writer.u16(message.code);
  writer.i32(message.requestId);
  for (const group of message.groups) writeGroup(writer, group);
  writer.u8(GROUP_TAG.end);
  writer.bytes(message.data);
  return writer.result();
}
