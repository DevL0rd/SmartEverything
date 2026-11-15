import { DESKTOP_PHOTO_LIBRARY, type DesktopPhotos } from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import { compareText } from '../../../format/text';
import { lastSegment } from '../local/folders';
import { listPhoneAlbums } from './phone-albums';

export interface BackupChoice {
  readonly id: string;
  readonly title: string;
  readonly place: string | null;
}

export type BackupChoiceKind = 'album' | 'folder';

export const BACKUP_CHOICES_KEY = ['window', 'photos-backup-choices'] as const;

function byTitle(a: BackupChoice, b: BackupChoice): number {
  return compareText(a.title, b.title) || compareText(a.id, b.id);
}

export async function listComputerFolders(
  photos: Pick<DesktopPhotos, 'list'>,
): Promise<readonly BackupChoice[]> {
  const library = DESKTOP_PHOTO_LIBRARY.parse(await photos.list());
  const paths = [...new Set(library.items.map((item) => item.folder))];
  return paths.map((path) => ({ id: path, title: lastSegment(path), place: path })).sort(byTitle);
}

export function backupChoiceKind(): BackupChoiceKind {
  return desktopBridge() === null ? 'album' : 'folder';
}

export async function listBackupChoices(): Promise<readonly BackupChoice[]> {
  const bridge = desktopBridge();
  if (bridge === null) {
    const albums = await listPhoneAlbums();
    return albums.map((album) => ({ id: album.id, title: album.title, place: null }));
  }
  if (bridge.photos === undefined) {
    throw new Error('Update the desktop app to choose which folders back up.');
  }
  return listComputerFolders(bridge.photos);
}
