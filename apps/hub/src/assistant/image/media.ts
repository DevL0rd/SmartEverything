import { IMAGE_BYTES_MAX } from '@smarteverything/domain';
import { ImageOperationError } from './errors';
import { runRaster } from './raster-process';

export interface ImageBytes {
  readonly content: Buffer;
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
}
export async function validateImage(
  content: Buffer,
  declared?: string,
  signal?: AbortSignal,
): Promise<ImageBytes> {
  if (content.length === 0 || content.length > IMAGE_BYTES_MAX)
    throw new ImageOperationError('limit', 'Image bytes exceed the supported limit.');
  const result = await runRaster(
    { kind: 'validate', content, ...(declared === undefined ? {} : { declared }) },
    signal,
  );
  if (result?.kind !== 'validated')
    throw new ImageOperationError('unknown', 'Image validation returned no raster metadata.');
  return { content, ...result.metadata };
}
export async function decodeImage(
  encoded: string,
  declared?: string,
  signal?: AbortSignal,
): Promise<ImageBytes> {
  if (encoded.length > Math.ceil(IMAGE_BYTES_MAX / 3) * 4)
    throw new ImageOperationError('limit', 'Encoded image exceeds the supported limit.');
  const content = Buffer.from(encoded, 'base64');
  if (content.toString('base64') !== encoded)
    throw new ImageOperationError(
      'invalid_media',
      'The image provider returned base64 that is not canonical.',
    );
  return validateImage(content, declared, signal);
}
