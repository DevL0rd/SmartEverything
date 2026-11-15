import { DERIVED_LONG_EDGE } from '../pipeline/derived-paths';
import type { OpenedPhoto } from './source';

const WEBP_QUALITY = 90;

export async function previewDataUrl(photo: OpenedPhoto): Promise<string> {
  const edge = DERIVED_LONG_EDGE.preview;
  const bytes = await photo.image
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return `data:image/webp;base64,${bytes.toString('base64')}`;
}
