import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { readDriveSettings } from '../../drive/settings';
import type { Store } from '../../store/store';
import { bound, type Routes } from '../router';
import { driveAlbumRoutes } from './drive-albums';
import { refusing } from './drive-errors';
import { driveGrantRoutes } from './drive-grants';
import { driveLibraryRoutes } from './drive-library';
import { actorOf, callerOf, type DriveServices } from './drive-services';
import { driveStorageRoutes } from './drive-storage';

type DriveReadRoute =
  | 'listRoots'
  | 'browseFolder'
  | 'readItem'
  | 'readRecent'
  | 'readDriveSettings'
  | 'updateDriveSettings';

function driveReadRoutes(store: Store, services: DriveServices): Routes<DriveReadRoute> {
  const { read } = services;
  return {
    listRoots: bound(E.listRoots, ({ caller }) => read.listRoots(actorOf(store, caller))),
    browseFolder: bound(E.browseFolder, ({ query, caller }) =>
      refusing(() => read.browseFolder(actorOf(store, caller), query)),
    ),
    readItem: bound(E.readItem, ({ params, caller }) =>
      refusing(() => read.readItem(actorOf(store, caller), params.itemId)),
    ),
    readRecent: bound(E.readRecent, ({ query, caller }) =>
      refusing(() => read.readRecent(actorOf(store, caller), query)),
    ),
    readDriveSettings: bound(E.readDriveSettings, () => readDriveSettings(store)),
    updateDriveSettings: bound(E.updateDriveSettings, ({ body, caller }) =>
      refusing(() => services.write.updateSettings(callerOf(store, caller), body)),
    ),
  };
}

export function driveRoutes(
  store: Store,
  services: DriveServices,
): ReturnType<typeof driveReadRoutes> &
  ReturnType<typeof driveLibraryRoutes> &
  ReturnType<typeof driveAlbumRoutes> &
  ReturnType<typeof driveGrantRoutes> &
  ReturnType<typeof driveStorageRoutes> {
  return {
    ...driveReadRoutes(store, services),
    ...driveLibraryRoutes(store, services),
    ...driveAlbumRoutes(store, services),
    ...driveGrantRoutes(store, services.grants),
    ...driveStorageRoutes(store, services),
  };
}
