import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LarqFrameError } from '../../src';
import {
  EMPTY,
  concatBytes,
  encodeBytes,
  encodeFixed32,
  encodeFloat,
  encodeMessage,
  encodeString,
  encodeVarint,
  fieldsOf,
  floatOfBits,
  readBool,
  readBytes,
  readFixed32,
  readFloat,
  readMessage,
  readMessages,
  readNumber,
  readSint,
  readVarint,
  varintBytes,
} from '../../src/larq/wire';

describe('LARQ protobuf wire format', () => {
  it('writes a number below 128 as one byte and larger numbers with continuation bits', () => {
    expect([...varintBytes(0)]).toStrictEqual([0]);
    expect([...varintBytes(127)]).toStrictEqual([0x7f]);
    expect([...varintBytes(128)]).toStrictEqual([0x80, 0x01]);
    expect([...varintBytes(300)]).toStrictEqual([0xac, 0x02]);
  });

  it('reads back every number it writes, up to the largest safe integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (value) => {
        expect(readVarint(fieldsOf(encodeVarint(1, value)), 1)).toBe(value);
      }),
    );
  });

  it('refuses to write a negative or fractional number', () => {
    expect(() => varintBytes(-1)).toThrow(LarqFrameError);
    expect(() => varintBytes(1.5)).toThrow(LarqFrameError);
  });

  it('leaves out a field that holds its protobuf default', () => {
    expect(encodeVarint(1, 0)).toStrictEqual(EMPTY);
    expect(encodeFixed32(2, 0)).toStrictEqual(EMPTY);
    expect(encodeFloat(3, 0)).toStrictEqual(EMPTY);
    expect(encodeBytes(4, EMPTY)).toStrictEqual(EMPTY);
    expect(encodeString(5, '')).toStrictEqual(EMPTY);
  });

  it('keeps an empty message field, because the receiver treats it as set', () => {
    expect([...encodeMessage(2, EMPTY)]).toStrictEqual([0x12, 0x00]);
  });

  it('reads varint, fixed32 and length-delimited fields in order', () => {
    const bytes = concatBytes(
      encodeVarint(1, 300),
      encodeFixed32(2, 0xdeadbeef),
      encodeString(3, 'cap'),
    );
    const fields = fieldsOf(bytes);
    expect(fields.map((field) => field.kind)).toStrictEqual(['varint', 'fixed32', 'bytes']);
    expect(readVarint(fields, 1)).toBe(300);
    expect(readFixed32(fields, 2)).toBe(0xdeadbeef);
    expect(new TextDecoder().decode(readBytes(fields, 3))).toBe('cap');
  });

  it('uses the last occurrence of a repeated scalar, as protobuf does', () => {
    const fields = fieldsOf(concatBytes(encodeVarint(1, 5), encodeVarint(1, 9)));
    expect(readVarint(fields, 1)).toBe(9);
  });

  it('answers the protobuf default for a field that is absent', () => {
    const fields = fieldsOf(encodeVarint(2, 1));
    expect(readVarint(fields, 1)).toBe(0);
    expect(readFixed32(fields, 1)).toBe(0);
    expect(readFloat(fields, 1)).toBe(0);
    expect(readBool(fields, 1)).toBe(false);
    expect(readNumber(fields, 1)).toBe(0);
    expect(readSint(fields, 1)).toBe(0);
    expect(readBytes(fields, 1)).toStrictEqual(EMPTY);
    expect(readMessage(fields, 1)).toStrictEqual([]);
    expect(readMessages(fields, 1)).toStrictEqual([]);
  });

  it('decodes a zigzag number', () => {
    const cases: readonly (readonly [number, number])[] = [
      [0, 0],
      [1, -1],
      [2, 1],
      [3, -2],
      [4_294_967_294, 2_147_483_647],
    ];
    for (const [raw, expected] of cases) {
      const field = concatBytes(new Uint8Array([0x08]), varintBytes(raw));
      expect(readSint(fieldsOf(field), 1)).toBe(expected);
    }
  });

  it('reads floats exactly, including negative values', () => {
    const fields = fieldsOf(concatBytes(encodeFloat(1, -0.5), encodeFloat(2, 10000.5)));
    expect(readFloat(fields, 1)).toBe(-0.5);
    expect(readFloat(fields, 2)).toBe(10000.5);
    expect(floatOfBits(0x3f800000)).toBe(1);
  });

  it('accepts either a varint or a fixed32 where the cap schema is not confirmed', () => {
    expect(readNumber(fieldsOf(encodeVarint(1, 77)), 1)).toBe(77);
    expect(readNumber(fieldsOf(encodeFixed32(1, 77)), 1)).toBe(77);
    expect(() => readNumber(fieldsOf(encodeString(1, 'x')), 1)).toThrow(LarqFrameError);
  });

  it('skips an unknown 64-bit field and reads the fields around it', () => {
    const skipped = new Uint8Array([0x09, 1, 2, 3, 4, 5, 6, 7, 8]);
    const fields = fieldsOf(concatBytes(encodeVarint(1, 4), skipped, encodeVarint(2, 6)));
    expect(readVarint(fields, 1)).toBe(4);
    expect(readVarint(fields, 2)).toBe(6);
    expect(fields).toHaveLength(2);
  });

  it('refuses a field read as the wrong kind', () => {
    const fields = fieldsOf(
      concatBytes(encodeFixed32(1, 5), encodeVarint(2, 5), encodeVarint(3, 5)),
    );
    expect(() => readVarint(fields, 1)).toThrow(LarqFrameError);
    expect(() => readFixed32(fields, 2)).toThrow(LarqFrameError);
    expect(() => readMessage(fields, 3)).toThrow(LarqFrameError);
    expect(() => readMessages(fields, 3)).toThrow(LarqFrameError);
    expect(() => readBytes(fields, 3)).toThrow(LarqFrameError);
  });

  it('refuses frames that are cut short or malformed', () => {
    expect(() => fieldsOf(new Uint8Array([0x0a, 0x05, 1, 2]))).toThrow(LarqFrameError);
    expect(() => fieldsOf(new Uint8Array([0x08]))).toThrow(LarqFrameError);
    expect(() => fieldsOf(new Uint8Array([0x08, 0x80]))).toThrow(LarqFrameError);
    expect(() => fieldsOf(new Uint8Array([0x00, 0x01]))).toThrow(LarqFrameError);
    expect(() => fieldsOf(new Uint8Array([0x0b, 0x01]))).toThrow(LarqFrameError);
    expect(() => fieldsOf(new Uint8Array([0x09, 1, 2]))).toThrow(LarqFrameError);
  });

  it('refuses a number that does not fit in 53 bits', () => {
    const tooBig = new Uint8Array([0x08, ...new Array<number>(9).fill(0xff), 0x01]);
    expect(() => fieldsOf(tooBig)).toThrow(LarqFrameError);
    const endless = new Uint8Array([0x08, ...new Array<number>(11).fill(0x80)]);
    expect(() => fieldsOf(endless)).toThrow(LarqFrameError);
  });

  it('reads nested messages and repeated messages', () => {
    const inner = concatBytes(encodeVarint(1, 7));
    const bytes = concatBytes(
      encodeMessage(1, inner),
      encodeMessage(2, inner),
      encodeMessage(2, inner),
    );
    const fields = fieldsOf(bytes);
    expect(readVarint(readMessage(fields, 1), 1)).toBe(7);
    expect(readMessages(fields, 2)).toHaveLength(2);
  });
});
