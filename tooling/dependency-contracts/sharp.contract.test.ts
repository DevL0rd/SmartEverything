import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const BACKGROUND = { r: 255, g: 0, b: 0 };

function solid(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .png()
    .toBuffer();
}

describe('sharp contract', () => {
  it('reads the size and format of an encoded image', async () => {
    const metadata = await sharp(await solid(40, 30)).metadata();

    expect([metadata.width, metadata.height, metadata.format]).toStrictEqual([40, 30, 'png']);
  });

  it('fits a preview inside its box without enlarging a smaller image', async () => {
    const options = { fit: 'inside', withoutEnlargement: true } as const;
    const large = await sharp(await solid(400, 200))
      .resize({ width: 100, height: 100, ...options })
      .webp({ quality: 65 })
      .toBuffer({ resolveWithObject: true });
    const small = await sharp(await solid(40, 30))
      .resize({ width: 100, height: 100, ...options })
      .webp()
      .toBuffer({ resolveWithObject: true });

    expect([large.info.width, large.info.height, large.info.format]).toStrictEqual([
      100,
      50,
      'webp',
    ]);
    expect([small.info.width, small.info.height]).toStrictEqual([40, 30]);
  });

  it('refuses an image with more pixels than the configured limit', async () => {
    await expect(
      sharp(await solid(40, 30), { limitInputPixels: 100 })
        .raw()
        .toBuffer(),
    ).rejects.toThrow(/pixel limit/u);
  });

  it('rejects bytes that are not an image', async () => {
    await expect(sharp(Buffer.from('not an image')).metadata()).rejects.toThrow();
  });
});
