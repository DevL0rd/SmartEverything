import { modelPictureSize, type ComputerCapture } from '@smarteverything/domain';
import sharp from 'sharp';

const JPEG_QUALITY = 85;

export async function modelSized(capture: ComputerCapture): Promise<ComputerCapture> {
  const size = modelPictureSize(capture);
  if (size.width === capture.width && size.height === capture.height) return capture;
  const scaled = await sharp(Buffer.from(capture.data, 'base64'))
    .resize(size.width, size.height, { fit: 'fill' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return { ...capture, data: scaled.toString('base64'), width: size.width, height: size.height };
}
