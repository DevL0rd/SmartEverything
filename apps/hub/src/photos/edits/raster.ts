import sharp, { type Sharp } from 'sharp';
import { UNLIMITED_PIXELS } from '../../media/sharp-input';

export const CHANNELS = 4;

export interface Raster {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

export async function rasterOf(image: Sharp): Promise<Raster> {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function imageOf(raster: Raster): Sharp {
  return sharp(raster.data, {
    ...UNLIMITED_PIXELS,
    raw: { width: raster.width, height: raster.height, channels: CHANNELS },
  });
}
