import { Decoder, Encoder } from 'cbor-x';
import { describe, expect, it } from 'vitest';
import { declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

const OPTIONS = {
  useRecords: false,
  mapsAsObjects: false,
  tagUint8Array: false,
  variableMapSize: false,
  useTag259ForMaps: false,
  structuredClone: false,
} as const;

const encoder = new Encoder(OPTIONS);
const decoder = new Decoder(OPTIONS);

function decode(bytes: Uint8Array): unknown {
  return decoder.decode(bytes);
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

describe('cbor-x contract', () => {
  it('is declared at the installed version by the domain package', () => {
    expect(declaredVersion('packages/domain/package.json', 'cbor-x')).toBe(
      installedVersion('cbor-x'),
    );
  });

  it('writes a map with integer keys in the order given, with definite lengths and no tags', () => {
    const bytes = new Uint8Array(
      encoder.encode(
        new Map<number, unknown>([
          [1, 'a'],
          [16, 3],
          [300, new Uint8Array([1, 2])],
        ]),
      ),
    );
    expect(hex(bytes)).toBe('a3016161100319012c420102');
  });

  it('reads integer keys back as numbers in a Map', () => {
    const decoded = decode(Buffer.from('a2010a1802f5', 'hex'));
    if (!(decoded instanceof Map)) throw new Error('not a map');
    expect([...decoded]).toEqual([
      [1, 10],
      [2, true],
    ]);
  });

  it('writes integers in their shortest form', () => {
    const shortest = (value: number): string => hex(new Uint8Array(encoder.encode(value)));
    expect(shortest(23)).toBe('17');
    expect(shortest(24)).toBe('1818');
    expect(shortest(255)).toBe('18ff');
    expect(shortest(256)).toBe('190100');
    expect(shortest(65_536)).toBe('1a00010000');
    expect(shortest(-1)).toBe('20');
  });

  it('keeps 64 bit integers exact as bigint', () => {
    const bytes = new Uint8Array(encoder.encode(0xdead_beef_cafe_f00dn));
    expect(hex(bytes)).toBe('1bdeadbeefcafef00d');
    expect(decode(bytes)).toBe(0xdead_beef_cafe_f00dn);
    const negative = new Uint8Array(encoder.encode(-0x8000_0000_0000_0000n));
    expect(hex(negative)).toBe('3b7fffffffffffffff');
    expect(decode(negative)).toBe(-0x8000_0000_0000_0000n);
  });

  it('writes bytes as a byte string and reads them back as bytes', () => {
    const bytes = new Uint8Array(encoder.encode(new Uint8Array([9, 8, 7])));
    expect(hex(bytes)).toBe('43090807');
    expect(decode(bytes)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('writes null, booleans and text, and nested arrays', () => {
    const value = [null, false, 'é', [1, [2]]];
    const bytes = new Uint8Array(encoder.encode(value));
    expect(hex(bytes)).toBe('84f6f462c3a982018102');
    expect(decode(bytes)).toEqual(value);
  });

  it('refuses truncated input', () => {
    expect(() => decode(Buffer.from('a30161', 'hex'))).toThrow();
  });
});
