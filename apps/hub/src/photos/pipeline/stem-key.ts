import { posix } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { DriveMediaRepository } from '../../store/repositories/drive-media';

export type StemKeyed = Pick<DriveItem, 'id' | 'rootId' | 'relPath'>;

export function stemKeyOf(item: Pick<DriveItem, 'rootId' | 'relPath'>): string {
  const folder = posix.dirname(item.relPath);
  const name = posix.basename(item.relPath);
  const stem = posix.parse(name).name;
  const base = (stem.length > 0 ? stem : name).toLowerCase();
  return `${item.rootId}:${folder === '.' ? '' : `${folder}/`}${base}`;
}

export function recordStemKey(media: Pick<DriveMediaRepository, 'update'>, item: StemKeyed): void {
  media.update(item.id, { stem_key: stemKeyOf(item) });
}
