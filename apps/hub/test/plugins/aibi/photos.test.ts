import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imageTypeOf } from '../../../src/plugins/builtin/aibi/photos';

const BACKGROUND = { r: 10, g: 120, b: 200 };

async function photo(format: 'png' | 'jpeg' | 'webp'): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: BACKGROUND } })
    .toFormat(format)
    .toBuffer();
}

describe('imageTypeOf', () => {
  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ] as const)('names a %s photo from its signature', async (format, mime) => {
    expect(await imageTypeOf(await photo(format))).toBe(mime);
  });

  it('treats bytes with no known signature as the robot’s usual jpeg', async () => {
    expect(await imageTypeOf(Buffer.from('truncated'))).toBe('image/jpeg');
  });
});
