import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imageSize } from '../../src/assistant/image/dimensions';

const SIZE = { width: 37, height: 21 };
const BACKGROUND = { r: 200, g: 40, b: 40 };

async function encoded(format: 'png' | 'jpeg' | 'webp' | 'gif' | 'avif'): Promise<Buffer> {
  return sharp({ create: { ...SIZE, channels: 3, background: BACKGROUND } })
    .toFormat(format)
    .toBuffer();
}

describe('imageSize', () => {
  it.each(['png', 'jpeg', 'webp', 'gif', 'avif'] as const)(
    'reads the size of a %s image',
    async (format) => {
      expect(await imageSize(await encoded(format))).toEqual(SIZE);
    },
  );

  it('reads the size of an svg image', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="37" height="21"/>');
    expect(await imageSize(svg)).toEqual(SIZE);
  });

  it('gives null for bytes that are not an image', async () => {
    expect(await imageSize(Buffer.from('not an image at all'))).toBeNull();
    expect(await imageSize(Buffer.alloc(0))).toBeNull();
  });
});
