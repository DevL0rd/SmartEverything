import type { DriveItem } from '@smarteverything/domain';
import { driveVersionFileUrl } from '../../../api/drive';
import { driveLinks } from '../data/links';
import type { VersionEntry } from './versions-model';

export function driveVersionLink(item: DriveItem, entry: VersionEntry): Promise<string | null> {
  return entry.versionId === null
    ? driveLinks.resolve(item.id, item.rev, 'file')
    : driveVersionFileUrl(item.id, entry.versionId);
}
