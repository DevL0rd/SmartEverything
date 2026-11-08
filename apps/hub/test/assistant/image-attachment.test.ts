import { describe, expect, it } from 'vitest';
import { sniffImage } from '../../src/assistant/image-attachment';

describe('sniffImage', () => {
  it('names PNG, JPEG and WebP by their first bytes', () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1]))).toEqual({
      mime: 'image/png',
      extension: 'png',
    });
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({
      mime: 'image/jpeg',
      extension: 'jpg',
    });
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImage(webp)).toEqual({ mime: 'image/webp', extension: 'webp' });
  });

  it('gives nothing for bytes that are not one of those images', () => {
    expect(sniffImage(Uint8Array.from([1, 2, 3]))).toBeUndefined();
  });
});
