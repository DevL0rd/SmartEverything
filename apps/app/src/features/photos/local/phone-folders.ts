import type * as MediaLibraryModule from 'expo-media-library';
import { Logger } from '@smarteverything/logging';
import { MEDIA_PAGE_ROWS, mediaScanCancelled } from '../backup/runner/media-library';
import { createNativeMediaPort, nativeBackupAvailable } from '../backup/runner/native-adapters';
import { phoneFolderOf, type DeviceFolder } from './folders';

type MediaLibrary = typeof MediaLibraryModule;

const log = new Logger('app.photos');

async function albumIds(
  lib: MediaLibrary,
  album: MediaLibraryModule.Album,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += MEDIA_PAGE_ROWS) {
    if (mediaScanCancelled(signal)) return ids;
    const page = await new lib.Query()
      .album(album)
      .orderBy(lib.AssetField.MODIFICATION_TIME)
      .limit(MEDIA_PAGE_ROWS)
      .offset(offset)
      .exe();
    for (const asset of page) ids.push(asset.id);
    if (page.length < MEDIA_PAGE_ROWS) return ids;
  }
}

async function folderOfAlbum(
  album: MediaLibraryModule.Album,
  ids: readonly string[],
): Promise<DeviceFolder | null> {
  const first = ids[0];
  if (first === undefined) return null;
  const [stat] = await createNativeMediaPort().statMedia([first]);
  const folder = stat === undefined ? null : phoneFolderOf(stat.relativePath);
  return folder === null ? null : { ...folder, backupId: album.id };
}

export async function phoneFoldersOf(
  lib: MediaLibrary,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, DeviceFolder>> {
  const folders = new Map<string, DeviceFolder>();
  if (!nativeBackupAvailable()) {
    log.warn('photos.device.folders_unavailable', { reason: 'the native photo module is missing' });
    return folders;
  }
  for (const album of await lib.Album.getAll()) {
    if (mediaScanCancelled(signal)) return folders;
    const ids = await albumIds(lib, album, signal);
    const folder = await folderOfAlbum(album, ids);
    if (folder === null) continue;
    for (const id of ids) {
      if (!folders.has(id)) folders.set(id, folder);
    }
  }
  return folders;
}
