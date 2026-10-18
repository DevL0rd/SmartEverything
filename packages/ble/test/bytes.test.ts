import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, macBytes, macOf, uint8, uint16, uint32 } from '../src/bytes';

describe('hex and byte helpers', () => {
  it('turns hex text into bytes and back, in either letter case', () => {
    expect(hexToBytes('00ff10')).toStrictEqual(new Uint8Array([0, 255, 16]));
    expect(hexToBytes('ABcd')).toStrictEqual(new Uint8Array([0xab, 0xcd]));
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe('00ff10');
  });

  it('refuses hex text that is odd or not hex', () => {
    expect(() => hexToBytes('abc')).toThrow(SyntaxError);
    expect(() => hexToBytes('zz')).toThrow(SyntaxError);
  });

  it('reads a Bluetooth address as bytes in the order written', () => {
    expect(macBytes('AA:BB:CC:DD:EE:01')).toStrictEqual(
      new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]),
    );
  });

  it('refuses a Bluetooth address that is not six colon-separated bytes', () => {
    expect(() => macBytes('AA:BB:CC:DD:EE')).toThrow();
    expect(() => macBytes('not a mac')).toThrow();
  });

  it('writes bytes as an upper-case Bluetooth address', () => {
    expect(macOf(new Uint8Array([0x0a, 0xbb, 0x01, 0xdd, 0xee, 0xff]))).toBe('0A:BB:01:DD:EE:FF');
  });

  it('reads little-endian numbers at an offset', () => {
    const bytes = new Uint8Array([0x34, 0x12, 0x78, 0x56, 0x9a]);
    expect(uint8(bytes, 4)).toBe(0x9a);
    expect(uint16(bytes, 0)).toBe(0x1234);
    expect(uint16(bytes, 2)).toBe(0x5678);
    expect(uint32(bytes, 0)).toBe(0x56781234);
    expect(uint32(bytes, 1)).toBe(0x9a567812);
    expect(uint32(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 0)).toBe(0xffffffff);
  });

  it('reads a view into a larger buffer from the view start', () => {
    const view = new Uint8Array([9, 9, 0x34, 0x12, 0x78, 0x56]).subarray(2);
    expect(uint16(view, 0)).toBe(0x1234);
    expect(uint32(view, 0)).toBe(0x56781234);
  });

  it('refuses to read past the end of the bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(() => uint8(bytes, 3)).toThrow(RangeError);
    expect(() => uint16(bytes, 2)).toThrow(RangeError);
    expect(() => uint32(bytes, 0)).toThrow(RangeError);
  });
});
