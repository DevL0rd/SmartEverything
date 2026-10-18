import sharp from 'sharp';
import {
  IMAGE_OPERATION_PREVIEW,
  IMAGE_PIXELS_MAX,
  type ImageOperationPreview,
  type ImageOperationReceipt,
} from '@smarteverything/domain';

const PREVIEW_SIDE_MAX = 512;
const PREVIEW_QUALITY = 65;
export async function imagePreview(
  receipt: ImageOperationReceipt,
  content: Buffer,
): Promise<ImageOperationPreview> {
  const { data, info } = await sharp(content, {
    limitInputPixels: IMAGE_PIXELS_MAX,
    failOn: 'none',
  })
    .resize({
      width: PREVIEW_SIDE_MAX,
      height: PREVIEW_SIDE_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return IMAGE_OPERATION_PREVIEW.parse({
    type: 'image_operation_preview',
    operation_id: receipt.id,
    profile_id: receipt.profile_id,
    chat_id: receipt.chat_id,
    mime: 'image/webp',
    width: info.width,
    height: info.height,
    bytes: data.length,
    data: data.toString('base64'),
  });
}
