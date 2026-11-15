import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { appleDoubleIconPng } from './apple-double';
import { largestIcnsPng } from './icns';
import { icoImagePng } from './ico';

export const ICON_EDGE = 128;

const ICO_MAGIC = [0x00, 0x00, 0x01, 0x00];

const ICNS_MAGIC = 'icns';

const APPLE_DOUBLE_MAGIC = [0x00, 0x05, 0x16, 0x07];

export class IconImageError extends Error {
  override readonly name = 'IconImageError';

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

async function decoded(bytes: Uint8Array): Promise<Uint8Array> {
  if (startsWith(bytes, ICO_MAGIC)) return icoImagePng(bytes);
  if (Buffer.from(bytes.subarray(0, 4)).toString('latin1') === ICNS_MAGIC) {
    const png = largestIcnsPng(bytes);
    if (png === null) throw new IconImageError('The icns file holds no PNG image.');
    return png;
  }
  if (startsWith(bytes, APPLE_DOUBLE_MAGIC)) {
    const png = appleDoubleIconPng(bytes);
    if (png === null) throw new IconImageError('The resource fork holds no icon.');
    return png;
  }
  return bytes;
}

export interface RenderedIcon {
  readonly sha256: string;
  readonly png: Buffer;
}

export async function renderFolderIcon(bytes: Uint8Array): Promise<RenderedIcon> {
  try {
    const source = await decoded(bytes);
    const png = await sharp(source, { failOn: 'error' })
      .rotate()
      .resize(ICON_EDGE, ICON_EDGE, { fit: 'inside' })
      .png()
      .toBuffer();
    return { sha256: createHash('sha256').update(bytes).digest('hex'), png };
  } catch (cause) {
    throw cause instanceof IconImageError
      ? cause
      : new IconImageError('The file is not an image the hub can read.', cause);
  }
}
