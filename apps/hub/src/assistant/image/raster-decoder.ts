import sharp, { type Metadata } from 'sharp';
import {
  IMAGE_MIME,
  IMAGE_PIXELS_MAX,
  IMAGE_PREVIEW_BYTES_MAX,
  IMAGE_SIDE_MAX,
} from '@smarteverything/domain';
import { ImageOperationError } from './errors';
import type { RasterRequest, RasterResult } from './raster-protocol';

const MIME_BY_FORMAT = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const PREVIEW_SIDE_MAX = 512;
const PREVIEW_QUALITY = 65;
function imageMetadata(
  metadata: Metadata,
  declared: string | undefined,
): Extract<RasterResult, { kind: 'validated' }>['metadata'] {
  const format = metadata.format;
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp')
    throw new ImageOperationError(
      'invalid_media',
      'Only PNG, JPEG and WebP raster images are supported.',
    );
  const mime = IMAGE_MIME.parse(MIME_BY_FORMAT[format]);
  if (declared !== undefined && declared !== mime)
    throw new ImageOperationError('invalid_media', 'Image content does not match its media type.');
  admitDimensions(metadata);
  return { mime, width: metadata.width, height: metadata.height };
}
function admitDimensions(metadata: Metadata): void {
  const { width, height } = metadata;
  if (
    width > IMAGE_SIDE_MAX ||
    height > IMAGE_SIDE_MAX ||
    width * height > IMAGE_PIXELS_MAX ||
    (metadata.pages ?? 1) !== 1
  )
    throw new ImageOperationError(
      'limit',
      'Image dimensions or animation exceed the supported limit.',
    );
}
export async function decodeRaster(
  request: Exclude<RasterRequest, { kind: 'probe' }>,
): Promise<RasterResult> {
  const decoder = sharp(request.content, {
    limitInputPixels: IMAGE_PIXELS_MAX,
    failOn: 'warning',
    animated: true,
  });
  const metadata = imageMetadata(
    await decoder.metadata(),
    request.kind === 'validate' ? request.declared : undefined,
  );
  await decoder.stats();
  if (request.kind === 'validate') return { kind: 'validated', metadata };
  const { data, info } = await sharp(request.content)
    .resize({
      width: PREVIEW_SIDE_MAX,
      height: PREVIEW_SIDE_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer({ resolveWithObject: true });
  if (data.length > IMAGE_PREVIEW_BYTES_MAX)
    throw new ImageOperationError('limit', 'The image preview exceeds its byte limit.');
  return { kind: 'preview', content: data, width: info.width, height: info.height };
}
