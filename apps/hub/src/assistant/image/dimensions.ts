import { Logger, messageOf } from '@smarteverything/logging';
import sharp from 'sharp';

const log = new Logger('hub.assistant');

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export async function imageSize(bytes: Buffer): Promise<ImageSize | null> {
  try {
    const { width, height } = await sharp(bytes).metadata();
    return width > 0 && height > 0 ? { width, height } : null;
  } catch (cause) {
    log.warn('image.size_unreadable', {
      reason: messageOf(cause),
    });
    return null;
  }
}
