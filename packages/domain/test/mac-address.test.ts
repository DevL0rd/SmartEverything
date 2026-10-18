import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BLE_ADVERT, BLUETOOTH_MAC, MAC_ADDRESS, PROVIDER_CREDENTIALS, macBytes } from '../src';
import { NODE_INTERFACE } from '../src/node/frames';

const CANONICAL = 'a1:b2:c3:d4:e5:f6';

describe('MAC_ADDRESS', () => {
  it('writes every accepted spelling as lower case with colons', () => {
    for (const written of [
      'a1:b2:c3:d4:e5:f6',
      'A1:B2:C3:D4:E5:F6',
      'A1:b2:C3:d4:E5:f6',
      'a1-b2-c3-d4-e5-f6',
      'A1-B2-C3-D4-E5-F6',
      '  A1:B2:C3:D4:E5:F6\n',
    ]) {
      expect(MAC_ADDRESS.parse(written)).toBe(CANONICAL);
    }
  });

  it('refuses anything that is not six hexadecimal bytes', () => {
    for (const written of [
      '',
      'a1:b2:c3:d4:e5',
      'a1:b2:c3:d4:e5:f6:07',
      'a1:b2:c3:d4:e5:g6',
      'a1b2c3d4e5f6',
      'xa1:b2:c3:d4:e5:f6',
      'a1:b2:c3:d4:e5:f6x',
      'a1.b2.c3.d4.e5.f6',
    ]) {
      expect(MAC_ADDRESS.safeParse(written).success, written).toBe(false);
    }
  });

  it('normalises any bytes written in any case and separator to the same text', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 6, maxLength: 6 }),
        fc.constantFrom(':', '-'),
        fc.boolean(),
        (bytes, separator, upper) => {
          const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'));
          const written = hex.join(separator);
          const parsed = MAC_ADDRESS.parse(upper ? written.toUpperCase() : written);
          expect(parsed).toBe(hex.join(':'));
          expect([...macBytes(parsed)]).toStrictEqual(bytes);
        },
      ),
    );
  });
});

describe('BLUETOOTH_MAC', () => {
  it('writes the same address as upper case, the form phones and devices report', () => {
    expect(BLUETOOTH_MAC.parse('  a1-b2-c3-d4-e5-f6 ')).toBe('A1:B2:C3:D4:E5:F6');
    expect(BLUETOOTH_MAC.safeParse('a1:b2:c3').success).toBe(false);
  });
});

describe('macBytes', () => {
  it('reads the bytes of an address in either separator style', () => {
    expect([...macBytes('A1-B2-C3-D4-E5-F6')]).toStrictEqual([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6]);
    expect([...macBytes(CANONICAL)]).toStrictEqual([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6]);
  });

  it('throws on text that is not an address', () => {
    expect(() => macBytes('a1:b2:c3:d4:e5')).toThrow();
  });
});

describe('the places that carry a MAC address share the rule', () => {
  it('parses a node interface, a Samsung TV credential and a Bluetooth advert through it', () => {
    expect(
      NODE_INTERFACE.parse({ name: 'eth0', mac: 'A1:B2:C3:D4:E5:F6', addresses: [] }).mac,
    ).toBe(CANONICAL);
    expect(
      PROVIDER_CREDENTIALS.parse({
        provider: 'samsung_tv',
        host: '10.0.0.5',
        macAddress: 'A1-B2-C3-D4-E5-F6',
        name: 'TV',
      }),
    ).toMatchObject({ macAddress: CANONICAL });
    expect(
      BLE_ADVERT.parse({
        address: ' a1:b2:c3:d4:e5:f6',
        serviceUuid: '0000fe95-0000-1000-8000-00805f9b34fb',
        data: '0102030405',
        rssi: -60,
        seenAt: '2026-10-17T10:00:00Z',
      }).address,
    ).toBe('A1:B2:C3:D4:E5:F6');
  });
});
