import {
  IMAGE_OPERATION_PREVIEW,
  type ImageOperationPreview,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import type { ImageBytes } from './media';
import { ImageOperationError } from './errors';
import { runRaster } from './raster-process';

export async function imagePreview(
  receipt: ImageOperationReceipt,
  image: ImageBytes,
  signal?: AbortSignal,
): Promise<ImageOperationPreview> {
  const result = await runRaster({ kind: 'preview', content: image.content }, signal);
  if (result?.kind !== 'preview')
    throw new ImageOperationError('unknown', 'Image preview returned no raster content.');
  return IMAGE_OPERATION_PREVIEW.parse({
    type: 'image_operation_preview',
    operation_id: receipt.id,
    profile_id: receipt.profile_id,
    chat_id: receipt.chat_id,
    mime: 'image/webp',
    width: result.width,
    height: result.height,
    bytes: result.content.length,
    data: result.content.toString('base64'),
  });
}
