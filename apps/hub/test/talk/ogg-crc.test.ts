import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { oggCrc } from '../../src/talk/ogg';

function bitwiseCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    }
    crc >>>= 0;
  }
  return crc;
}

describe('Ogg page checksum', () => {
  it('matches the bit-by-bit definition on fixed pages', () => {
    const header = Buffer.from('OggS\u0000\u0002', 'latin1');
    const page = Uint8Array.from({ length: 4096 }, (_, index) => (index * 31 + 7) % 256);
    for (const bytes of [new Uint8Array(0), header, page, new Uint8Array(255).fill(255)]) {
      expect(oggCrc(bytes)).toBe(bitwiseCrc(bytes));
    }
  });

  it('matches the bit-by-bit definition on any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
        expect(oggCrc(bytes)).toBe(bitwiseCrc(bytes));
      }),
    );
  });
});
