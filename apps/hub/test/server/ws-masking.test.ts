import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mask, unmask } from '../../src/server/ws-masking';

function expected(source: Uint8Array, key: Uint8Array): Uint8Array {
  return Uint8Array.from(source, (byte, index) => byte ^ (key[index % 4] ?? 0));
}

const LENGTHS = [0, 1, 3, 4, 5, 31, 1000, 4099];

describe('WebSocket masking', () => {
  it('unmasks every length at every alignment', () => {
    const key = randomBytes(4);
    for (const offset of [0, 1, 2, 3]) {
      for (const length of LENGTHS) {
        const buffer = randomBytes(length + 8).subarray(offset, offset + length);
        const original = Uint8Array.from(buffer);
        unmask(buffer, key);
        expect(Uint8Array.from(buffer)).toEqual(expected(original, key));
      }
    }
  });

  it('masks into the output at its offset and leaves the rest untouched', () => {
    const key = randomBytes(4);
    for (const at of [0, 1, 2, 3]) {
      for (const length of LENGTHS) {
        const source = randomBytes(length + 4).subarray(at, at + length);
        const output = new Uint8Array(length + 10);
        mask(source, key, output, 3, length);
        expect(Uint8Array.from(output.subarray(3, 3 + length))).toEqual(expected(source, key));
        expect([...output.subarray(0, 3), ...output.subarray(3 + length)]).toEqual(
          new Array<number>(10).fill(0),
        );
      }
    }
  });
});
