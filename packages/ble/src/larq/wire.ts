import { uint8, uint32 } from '../bytes';
import { LarqFrameError } from './errors';

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_BYTES = 2;
const WIRE_FIXED32 = 5;
const FIXED64_BYTES = 8;
const MAX_VARINT_BYTES = 10;
const VARINT_PAYLOAD = 0x7f;
const VARINT_CONTINUES = 0x80;
const VARINT_RADIX = 128;
const TAG_WIRE_MASK = 7;
const FIELD_NUMBER_DIVISOR = 8;

export type WireField =
  | { readonly field: number; readonly kind: 'varint'; readonly value: number }
  | { readonly field: number; readonly kind: 'fixed32'; readonly value: number }
  | { readonly field: number; readonly kind: 'bytes'; readonly value: Uint8Array };

interface Read {
  readonly value: number;
  readonly next: number;
}

function readVarintAt(bytes: Uint8Array, start: number): Read {
  let value = 0;
  let scale = 1;
  for (let offset = start; offset < bytes.length; offset += 1) {
    if (offset - start >= MAX_VARINT_BYTES) {
      break;
    }
    const byte = uint8(bytes, offset);
    value += (byte & VARINT_PAYLOAD) * scale;
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new LarqFrameError(
        `A number at byte ${String(start)} does not fit in 53 bits; the frame is not from the cap.`,
      );
    }
    if ((byte & VARINT_CONTINUES) === 0) {
      return { value, next: offset + 1 };
    }
    scale *= VARINT_RADIX;
  }
  throw new LarqFrameError(`A number at byte ${String(start)} never ends.`);
}

function readFieldAt(bytes: Uint8Array, start: number): { field: WireField | null; next: number } {
  const tag = readVarintAt(bytes, start);
  const field = Math.floor(tag.value / FIELD_NUMBER_DIVISOR);
  const wire = tag.value & TAG_WIRE_MASK;
  if (field === 0) {
    throw new LarqFrameError(`Field number 0 at byte ${String(start)} is not valid.`);
  }
  if (wire === WIRE_VARINT) {
    const read = readVarintAt(bytes, tag.next);
    return { field: { field, kind: 'varint', value: read.value }, next: read.next };
  }
  if (wire === WIRE_FIXED32) {
    return {
      field: { field, kind: 'fixed32', value: uint32(bytes, tag.next) },
      next: tag.next + 4,
    };
  }
  if (wire === WIRE_FIXED64) {
    return { field: null, next: skip(bytes, tag.next, FIXED64_BYTES) };
  }
  if (wire === WIRE_BYTES) {
    const length = readVarintAt(bytes, tag.next);
    const end = skip(bytes, length.next, length.value);
    return { field: { field, kind: 'bytes', value: bytes.subarray(length.next, end) }, next: end };
  }
  throw new LarqFrameError(
    `Field ${String(field)} at byte ${String(start)} has wire type ${String(wire)}, which the cap never sends.`,
  );
}

function skip(bytes: Uint8Array, from: number, length: number): number {
  const end = from + length;
  if (end > bytes.length) {
    throw new LarqFrameError(
      `A field at byte ${String(from)} claims ${String(length)} bytes but only ${String(bytes.length - from)} remain.`,
    );
  }
  return end;
}

export function fieldsOf(bytes: Uint8Array): readonly WireField[] {
  const fields: WireField[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const read = readFieldAt(bytes, offset);
    if (read.field !== null) {
      fields.push(read.field);
    }
    offset = read.next;
  }
  return fields;
}

function lastOf(fields: readonly WireField[], number: number): WireField | undefined {
  return fields.findLast((field) => field.field === number);
}

function mismatch(number: number, expected: string, found: WireField): LarqFrameError {
  return new LarqFrameError(
    `Field ${String(number)} should be ${expected} but arrived as ${found.kind}.`,
  );
}

export function readVarint(fields: readonly WireField[], number: number): number {
  const found = lastOf(fields, number);
  if (found === undefined) {
    return 0;
  }
  if (found.kind !== 'varint') {
    throw mismatch(number, 'a varint', found);
  }
  return found.value;
}

export function readFixed32(fields: readonly WireField[], number: number): number {
  const found = lastOf(fields, number);
  if (found === undefined) {
    return 0;
  }
  if (found.kind !== 'fixed32') {
    throw mismatch(number, 'a 32-bit value', found);
  }
  return found.value;
}

export function readNumber(fields: readonly WireField[], number: number): number {
  const found = lastOf(fields, number);
  if (found === undefined) {
    return 0;
  }
  if (found.kind === 'bytes') {
    throw mismatch(number, 'a number', found);
  }
  return found.value;
}

export function floatOfBits(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}

export function readFloat(fields: readonly WireField[], number: number): number {
  return floatOfBits(readFixed32(fields, number));
}

export function readBool(fields: readonly WireField[], number: number): boolean {
  return readVarint(fields, number) !== 0;
}

export function readSint(fields: readonly WireField[], number: number): number {
  const raw = readVarint(fields, number);
  return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
}

export function readMessage(fields: readonly WireField[], number: number): readonly WireField[] {
  const found = lastOf(fields, number);
  if (found === undefined) {
    return [];
  }
  if (found.kind !== 'bytes') {
    throw mismatch(number, 'a message', found);
  }
  return fieldsOf(found.value);
}

export function readMessages(
  fields: readonly WireField[],
  number: number,
): readonly (readonly WireField[])[] {
  return fields
    .filter((field) => field.field === number)
    .map((field) => {
      if (field.kind !== 'bytes') {
        throw mismatch(number, 'a message', field);
      }
      return fieldsOf(field.value);
    });
}

export function readBytes(fields: readonly WireField[], number: number): Uint8Array {
  const found = lastOf(fields, number);
  if (found === undefined) {
    return EMPTY;
  }
  if (found.kind !== 'bytes') {
    throw mismatch(number, 'bytes', found);
  }
  return found.value;
}

export const EMPTY: Uint8Array = new Uint8Array(0);

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

export function varintBytes(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LarqFrameError(`Cannot write ${String(value)} as an unsigned number.`);
  }
  const out: number[] = [];
  let rest = value;
  while (rest >= VARINT_RADIX) {
    out.push((rest % VARINT_RADIX) | VARINT_CONTINUES);
    rest = Math.floor(rest / VARINT_RADIX);
  }
  out.push(rest);
  return Uint8Array.from(out);
}

function tagBytes(field: number, wire: number): Uint8Array {
  return varintBytes(field * FIELD_NUMBER_DIVISOR + wire);
}

function fixed32Bytes(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

export function encodeVarint(field: number, value: number): Uint8Array {
  return value === 0 ? EMPTY : concatBytes(tagBytes(field, WIRE_VARINT), varintBytes(value));
}

export function encodeFixed32(field: number, value: number): Uint8Array {
  return value === 0 ? EMPTY : concatBytes(tagBytes(field, WIRE_FIXED32), fixed32Bytes(value));
}

export function encodeFloat(field: number, value: number): Uint8Array {
  if (value === 0) {
    return EMPTY;
  }
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return encodeFixed32(field, view.getUint32(0, true));
}

export function encodeBytes(field: number, value: Uint8Array): Uint8Array {
  return value.length === 0
    ? EMPTY
    : concatBytes(tagBytes(field, WIRE_BYTES), varintBytes(value.length), value);
}

export function encodeString(field: number, value: string): Uint8Array {
  return encodeBytes(field, new TextEncoder().encode(value));
}

export function encodeMessage(field: number, value: Uint8Array): Uint8Array {
  return concatBytes(tagBytes(field, WIRE_BYTES), varintBytes(value.length), value);
}
