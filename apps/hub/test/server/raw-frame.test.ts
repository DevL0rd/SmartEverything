import { describe, expect, it } from 'vitest';
import { frameBytes, frameText } from '../../src/server/raw-frame';

describe('web socket frame reading', () => {
  const text = 'héllo';
  const bytes = Buffer.from(text, 'utf8');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  it('reads a single buffer, fragments and an array buffer as the same text', () => {
    expect(frameText(bytes)).toBe(text);
    expect(frameText([bytes.subarray(0, 2), bytes.subarray(2)])).toBe(text);
    expect(frameText(buffer)).toBe(text);
  });

  it('gives back the very same buffer when the frame already is one', () => {
    expect(frameBytes(bytes)).toBe(bytes);
    expect(frameBytes([bytes, bytes]).byteLength).toBe(bytes.byteLength * 2);
  });
});
