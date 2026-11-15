import { ApiError } from '@smarteverything/domain';
import sharp, { type Sharp } from 'sharp';
import type { DecodedSource, PreviewDecoders, PreviewFile } from '../pipeline/preview';
import { UNLIMITED_PIXELS } from '../../media/sharp-input';

const RGBA = 4;

export interface OpenedPhoto {
  readonly image: Sharp;
  readonly exif: Buffer | undefined;
  readonly hasAlpha: boolean;
}

function plainInput(source: DecodedSource): Sharp {
  return source.kind === 'encoded'
    ? sharp(source.path, UNLIMITED_PIXELS)
    : sharp(source.data, {
        ...UNLIMITED_PIXELS,
        raw: { width: source.width, height: source.height, channels: RGBA },
      });
}

export async function openPhoto(
  file: PreviewFile,
  decoders: PreviewDecoders,
  signal: AbortSignal,
): Promise<OpenedPhoto> {
  const decoder = decoders.find(file);
  if (decoder === undefined) {
    throw new ApiError(
      'unsupported_media_type',
      `${file.name} is not a photo format Photos can edit.`,
    );
  }
  const outcome = await decoder.decode(file, signal);
  if (outcome.kind === 'unsupported') throw new ApiError('unsupported_media_type', outcome.reason);
  const { source } = outcome;
  const metadata = await plainInput(source).metadata();
  const image =
    source.kind === 'encoded'
      ? plainInput(source).autoOrient().toColourspace('srgb')
      : plainInput(source);
  return {
    image,
    exif: source.kind === 'encoded' ? metadata.exif : undefined,
    hasAlpha: metadata.hasAlpha,
  };
}
