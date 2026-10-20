import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/functions/sha256';

function reference(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with node crypto around every padding boundary', () => {
    for (let length = 0; length < 140; length += 1) {
      const text = 'a'.repeat(length);
      expect(sha256Hex(text)).toBe(reference(text));
    }
  });

  it('agrees with node crypto for any text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => sha256Hex(text) === reference(text)),
    );
  });
});
