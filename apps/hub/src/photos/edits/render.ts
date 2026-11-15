import { compileRecipe, type PhotoRecipe } from '@smarteverything/domain';
import { embedExif, uprightExif } from './exif';
import { applyGeometry, type PatchLoader } from './geometry';
import type { ColourRunner } from './colour-runner';
import { CHANNELS, imageOf, rasterOf } from './raster';
import type { OpenedPhoto } from './source';

export const OUTPUT_FORMATS = {
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
  webp: { mime: 'image/webp', extension: 'webp' },
} as const;

export type OutputFormat = keyof typeof OUTPUT_FORMATS;

export const OUTPUT_QUALITY = 92;

export interface RenderedPhoto {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
}

export interface RenderRequest {
  readonly photo: OpenedPhoto;
  readonly recipe: PhotoRecipe;
  readonly format: OutputFormat;
  readonly patch: PatchLoader;
  readonly colour: ColourRunner;
}

export async function renderPhoto(request: RenderRequest): Promise<RenderedPhoto> {
  const compiled = compileRecipe(request.recipe);
  const start = await rasterOf(request.photo.image);
  const placed = await applyGeometry(start, compiled.steps, request.patch);
  const pixels = await request.colour.run(Uint8Array.from(placed.data), CHANNELS, compiled);
  const coloured = imageOf({
    data: Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    width: placed.width,
    height: placed.height,
  });
  const keepsAlpha = request.photo.hasAlpha && request.format !== 'jpeg';
  const flat = keepsAlpha ? coloured : coloured.removeAlpha();
  const encoded =
    request.format === 'jpeg'
      ? flat.jpeg({ quality: OUTPUT_QUALITY })
      : request.format === 'png'
        ? flat.png()
        : flat.webp({ quality: OUTPUT_QUALITY });
  const bytes = await encoded.toBuffer();
  const exif = request.photo.exif;
  return {
    bytes:
      request.format === 'jpeg' && exif !== undefined ? embedExif(bytes, uprightExif(exif)) : bytes,
    width: placed.width,
    height: placed.height,
  };
}
