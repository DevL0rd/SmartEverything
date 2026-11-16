import {
  photoFolderKindOf,
  photoFolderPlaceOf,
  type NativeHubRestoreTarget,
  type PhotoFolderOrigin,
} from '@smarteverything/domain';
import { count } from '../../../format/number';

export type SavePlatform = 'android' | 'desktop';

export const SAVE_LABEL = 'Save to this device';

const GALLERY_TOPS: Readonly<Record<'image' | 'video', readonly string[]>> = {
  image: ['DCIM', 'Pictures'],
  video: ['DCIM', 'Pictures', 'Movies'],
};

export class SaveOriginMismatchError extends Error {
  override readonly name = 'SaveOriginMismatchError';

  constructor(key: string, platform: SavePlatform) {
    super(
      `The origin ${key} is not a folder on this ${platform === 'android' ? 'phone' : 'computer'}.`,
    );
  }
}

function galleryAllows(path: string, video: boolean): boolean {
  const top = path.split('/').find((part) => part.length > 0);
  return top !== undefined && GALLERY_TOPS[video ? 'video' : 'image'].includes(top);
}

export function saveTargetOf(
  platform: SavePlatform,
  origin: PhotoFolderOrigin | null,
  mime: string,
): NativeHubRestoreTarget {
  if (origin === null) return { kind: 'restored' };
  const kind = photoFolderKindOf(origin.key);
  if (kind !== (platform === 'android' ? 'phone' : 'computer'))
    throw new SaveOriginMismatchError(origin.key, platform);
  const folder = photoFolderPlaceOf(origin.key);
  if (platform === 'android' && !galleryAllows(folder, mime.startsWith('video/')))
    return { kind: 'restored' };
  return { kind: 'origin', folder };
}

export interface SaveTally {
  readonly saved: number;
  readonly present: number;
  readonly failed: number;
}

function things(total: number): string {
  return total === 1 ? 'photo' : 'photos';
}

export function doneLine(tally: SaveTally): string {
  const parts: string[] = [];
  if (tally.saved > 0) parts.push(`Saved ${count(tally.saved)} ${things(tally.saved)}`);
  if (tally.present > 0)
    parts.push(
      tally.saved === 0 && tally.present === 1
        ? 'Already on this device'
        : `${count(tally.present)} already on this device`,
    );
  return parts.join(' · ');
}

export function failedLine(failed: number): string {
  return failed === 1
    ? 'A photo could not be saved to this device'
    : `${count(failed)} could not be saved to this device`;
}
