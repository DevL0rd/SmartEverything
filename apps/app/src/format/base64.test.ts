import { describe, expect, it } from 'vitest';
import { base64Of } from './base64';

describe('base64Of', () => {
  it('encodes the chosen slice of a buffer', () => {
    const bytes = new TextEncoder().encode('xxhelloxx');
    expect(base64Of(bytes.buffer, 2, 7)).toBe(btoa('hello'));
  });

  it('encodes a buffer larger than one chunk without losing bytes', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 5).map((_, index) => index % 251);
    const decoded = Uint8Array.from(atob(base64Of(bytes.buffer, 0, bytes.length)), (c) =>
      c.charCodeAt(0),
    );
    expect(decoded).toStrictEqual(bytes);
  });
});
