import sharp from 'sharp';
import { IMAGE_PIXELS_MAX } from '@smarteverything/domain';
import { ImageOperationError } from './errors';
import { messageOf } from '@smarteverything/logging';

const MIME_BY_FORMAT = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
export interface ImageBytes {
  readonly content: Buffer;
  readonly mime: (typeof MIME_BY_FORMAT)[keyof typeof MIME_BY_FORMAT];
  readonly width: number;
  readonly height: number;
}
export async function readImage(content: Buffer): Promise<ImageBytes> {
  try {
    const decoder = sharp(content, { limitInputPixels: IMAGE_PIXELS_MAX, failOn: 'error' });
    const { format, width, height } = await decoder.metadata();
    if (format !== 'png' && format !== 'jpeg' && format !== 'webp')
      throw new ImageOperationError(
        'invalid_media',
        'Only PNG, JPEG and WebP raster images are supported.',
      );
    await decoder.stats();
    return { content, mime: MIME_BY_FORMAT[format], width, height };
  } catch (cause) {
    if (cause instanceof ImageOperationError) throw cause;
    throw new ImageOperationError(
      'invalid_media',
      `The image could not be decoded: ${messageOf(cause)}`,
    );
  }
}
export function decodeImage(encoded: string): Promise<ImageBytes> {
  return readImage(Buffer.from(encoded, 'base64'));
}
