import { IppDecodeError } from './errors';
import type { IppAttribute, IppGroup, IppMessage, IppValue } from './model';
import { GROUP_TAG, OUT_OF_BAND_OF_TAG, STRING_KIND_OF_TAG, VALUE_TAG } from './tags';

const FIRST_VALUE_TAG = 0x10;
const HEADER_LENGTH = 8;
const DATE_TIME_LENGTH = 11;
const RESOLUTION_LENGTH = 9;
const RANGE_LENGTH = 8;
const INTEGER_LENGTH = 4;
const MAX_SECOND = 60;
const MAX_MINUTE = 59;
const MAX_HOUR = 23;
const UTF8 = new TextDecoder('utf-8', { fatal: false });

function hex(value: number): string {
  return `0x${value.toString(16).padStart(2, '0')}`;
}

class Cursor {
  readonly #view: DataView;
  #position = 0;

  constructor(readonly bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position(): number {
    return this.#position;
  }

  get remaining(): number {
    return this.bytes.length - this.#position;
  }

  need(count: number, what: string): void {
    if (this.remaining < count) {
      throw new IppDecodeError(
        this.#position,
        `${String(count)} more bytes for ${what}`,
        `${String(this.remaining)} bytes left`,
      );
    }
  }

  peek(what: string): number {
    this.need(1, what);
    return this.#view.getUint8(this.#position);
  }

  u8(what: string): number {
    const value = this.peek(what);
    this.#position += 1;
    return value;
  }

  u16(what: string): number {
    this.need(2, what);
    const value = this.#view.getUint16(this.#position);
    this.#position += 2;
    return value;
  }

  i32(what: string): number {
    this.need(INTEGER_LENGTH, what);
    const value = this.#view.getInt32(this.#position);
    this.#position += INTEGER_LENGTH;
    return value;
  }

  take(count: number, what: string): Uint8Array {
    this.need(count, what);
    const slice = this.bytes.subarray(this.#position, this.#position + count);
    this.#position += count;
    return slice;
  }

  rest(): Uint8Array {
    return this.take(this.remaining, 'the document data');
  }
}

function exactly(bytes: Uint8Array, length: number, what: string, offset: number): DataView {
  if (bytes.length !== length) {
    throw new IppDecodeError(
      offset,
      `${String(length)} bytes for ${what}`,
      `${String(bytes.length)} bytes`,
    );
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function dateTimeValue(bytes: Uint8Array, offset: number): IppValue {
  const view = exactly(bytes, DATE_TIME_LENGTH, 'a dateTime', offset);
  const month = view.getUint8(2);
  const day = view.getUint8(3);
  const hour = view.getUint8(4);
  const minute = view.getUint8(5);
  const second = view.getUint8(6);
  const fields: readonly (readonly [number, number, number])[] = [
    [month, 1, 12],
    [day, 1, 31],
    [hour, 0, MAX_HOUR],
    [minute, 0, MAX_MINUTE],
    [second, 0, MAX_SECOND],
  ];
  if (!fields.every(([value, low, high]) => value >= low && value <= high)) {
    return { kind: 'outOfBand', value: 'unknown' };
  }
  const sign = view.getUint8(8) === '-'.charCodeAt(0) ? -1 : 1;
  const offsetMinutes = sign * (view.getUint8(9) * 60 + view.getUint8(10));
  const utc = Date.UTC(
    view.getUint16(0),
    month - 1,
    day,
    hour,
    minute,
    second,
    view.getUint8(7) * 100,
  );
  return { kind: 'dateTime', value: new Date(utc - offsetMinutes * 60_000).toISOString() };
}

function scalarValue(tag: number, bytes: Uint8Array, offset: number): IppValue {
  switch (tag) {
    case VALUE_TAG.integer:
    case VALUE_TAG.enum: {
      const view = exactly(bytes, INTEGER_LENGTH, 'an integer', offset);
      return { kind: tag === VALUE_TAG.integer ? 'integer' : 'enum', value: view.getInt32(0) };
    }
    case VALUE_TAG.boolean:
      return { kind: 'boolean', value: exactly(bytes, 1, 'a boolean', offset).getUint8(0) !== 0 };
    case VALUE_TAG.dateTime:
      return dateTimeValue(bytes, offset);
    case VALUE_TAG.resolution: {
      const view = exactly(bytes, RESOLUTION_LENGTH, 'a resolution', offset);
      return {
        kind: 'resolution',
        x: view.getInt32(0),
        y: view.getInt32(4),
        units: view.getInt8(8),
      };
    }
    case VALUE_TAG.rangeOfInteger: {
      const view = exactly(bytes, RANGE_LENGTH, 'a range', offset);
      return { kind: 'range', lower: view.getInt32(0), upper: view.getInt32(4) };
    }
    default:
      return { kind: 'octets', tag, value: bytes.slice() };
  }
}

function languageText(bytes: Uint8Array, offset: number): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4) {
    throw new IppDecodeError(offset, 'a language and a text', `${String(bytes.length)} bytes`);
  }
  const languageLength = view.getUint16(0);
  if (bytes.length < 4 + languageLength) {
    throw new IppDecodeError(offset, 'a text after its language', `${String(bytes.length)} bytes`);
  }
  const textLength = view.getUint16(2 + languageLength);
  const start = 4 + languageLength;
  return UTF8.decode(bytes.subarray(start, start + textLength));
}

function leafValue(tag: number, bytes: Uint8Array, offset: number): IppValue {
  const kind = STRING_KIND_OF_TAG.get(tag);
  if (kind !== undefined) return { kind, value: UTF8.decode(bytes) };
  const outOfBand = OUT_OF_BAND_OF_TAG.get(tag);
  if (outOfBand !== undefined) return { kind: 'outOfBand', value: outOfBand };
  if (tag === VALUE_TAG.textWithLanguage)
    return { kind: 'text', value: languageText(bytes, offset) };
  if (tag === VALUE_TAG.nameWithLanguage)
    return { kind: 'name', value: languageText(bytes, offset) };
  return scalarValue(tag, bytes, offset);
}

function readValue(cursor: Cursor, tag: number): IppValue {
  const length = cursor.u16('a value length');
  const offset = cursor.position;
  const bytes = cursor.take(length, 'a value');
  if (tag === VALUE_TAG.beginCollection) {
    return { kind: 'collection', members: readMembers(cursor) };
  }
  return leafValue(tag, bytes, offset);
}

function readMemberName(cursor: Cursor): string {
  const nameLength = cursor.u16('a member name length');
  if (nameLength !== 0) {
    throw new IppDecodeError(
      cursor.position,
      'an empty name before a member name',
      String(nameLength),
    );
  }
  return UTF8.decode(cursor.take(cursor.u16('a member name length'), 'a member name'));
}

function skipEmptyName(cursor: Cursor): void {
  const nameLength = cursor.u16('a name length');
  if (nameLength !== 0) {
    throw new IppDecodeError(
      cursor.position,
      'an empty name inside a collection',
      String(nameLength),
    );
  }
}

function readMembers(cursor: Cursor): readonly IppAttribute[] {
  const members: IppAttribute[] = [];
  for (;;) {
    const tag = cursor.u8('a collection member tag');
    if (tag === VALUE_TAG.endCollection) {
      cursor.take(4, 'the end of a collection');
      return members;
    }
    if (tag !== VALUE_TAG.memberAttrName) {
      throw new IppDecodeError(
        cursor.position - 1,
        'a member name or the end of a collection',
        hex(tag),
      );
    }
    const name = readMemberName(cursor);
    members.push({ name, values: readMemberValues(cursor) });
  }
}

function readMemberValues(cursor: Cursor): readonly IppValue[] {
  const values: IppValue[] = [];
  for (;;) {
    const tag = cursor.u8('a member value tag');
    skipEmptyName(cursor);
    values.push(readValue(cursor, tag));
    const next = cursor.peek('the next member tag');
    if (next === VALUE_TAG.memberAttrName || next === VALUE_TAG.endCollection) return values;
  }
}

function readGroup(cursor: Cursor, tag: number): IppGroup {
  const attributes: { name: string; values: IppValue[] }[] = [];
  for (;;) {
    const next = cursor.peek('an attribute tag');
    if (next < FIRST_VALUE_TAG) return { tag, attributes };
    cursor.u8('an attribute tag');
    const name = UTF8.decode(cursor.take(cursor.u16('a name length'), 'an attribute name'));
    const value = readValue(cursor, next);
    const last = attributes.at(-1);
    if (name === '') {
      if (last === undefined) {
        throw new IppDecodeError(
          cursor.position,
          'a named attribute first in a group',
          'an additional value',
        );
      }
      last.values.push(value);
    } else {
      attributes.push({ name, values: [value] });
    }
  }
}

export function decodeMessage(bytes: Uint8Array): IppMessage {
  if (bytes.length < HEADER_LENGTH + 1) {
    throw new IppDecodeError(
      0,
      `at least ${String(HEADER_LENGTH + 1)} bytes`,
      `${String(bytes.length)} bytes`,
    );
  }
  const cursor = new Cursor(bytes);
  const major = cursor.u8('the major version');
  const minor = cursor.u8('the minor version');
  const code = cursor.u16('the operation or status code');
  const requestId = cursor.i32('the request id');
  const groups: IppGroup[] = [];
  for (;;) {
    const tag = cursor.u8('a group tag');
    if (tag === GROUP_TAG.end)
      return { major, minor, code, requestId, groups, data: cursor.rest() };
    if (tag >= FIRST_VALUE_TAG) {
      throw new IppDecodeError(cursor.position - 1, 'a group delimiter', hex(tag));
    }
    groups.push(readGroup(cursor, tag));
  }
}
