import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';

export const THUMBHASH_EDGE = 100;

export async function thumbHashOf(image: Uint8Array): Promise<Uint8Array> {
  const { data, info } = await sharp(image)
    .resize({ width: THUMBHASH_EDGE, height: THUMBHASH_EDGE, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return rgbaToThumbHash(info.width, info.height, data);
}
