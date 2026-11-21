import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { readDriveSettings } from '../../drive/settings';
import { runningFileIoThreads } from '../../service/file-io-threads';
import type { Store } from '../../store/store';
import { bound, type Routes } from '../router';
import { driveAlbumRoutes } from './drive-albums';
import { driveContentRoutes } from './drive-content';
import { driveDownloadRoutes } from './drive-download';
import type { DriveExtras } from './drive-extras';
import { refusing } from './drive-errors';
import { driveGrantRoutes } from './drive-grants';
import { driveLibraryRoutes } from './drive-library';
import { driveOfflineRoutes } from './drive-offline';
import { driveSharingRoutes } from './drive-sharing';
import { driveSocialRoutes } from './drive-social';
import { actorOf, callerOf, type DriveServices } from './drive-services';
import { driveStorageRoutes } from './drive-storage';

type DriveReadRoute =
  | 'listRoots'
  | 'browseFolder'
  | 'readItem'
  | 'readRecent'
  | 'readDriveSettings'
  | 'readDriveSettingsRunning'
  | 'updateDriveSettings';

function driveReadRoutes(store: Store, services: DriveServices): Routes<DriveReadRoute> {
  const { read } = services;
  return {
    listRoots: bound(E.listRoots, ({ caller }) => read.listRoots(actorOf(caller))),
    browseFolder: bound(E.browseFolder, ({ query, caller }) =>
      refusing(() => read.browseFolder(actorOf(caller), query)),
    ),
    readItem: bound(E.readItem, ({ params, caller }) =>
      refusing(() => read.readItem(actorOf(caller), params.itemId)),
    ),
    readRecent: bound(E.readRecent, ({ query, caller }) =>
      refusing(() => read.readRecent(actorOf(caller), query)),
    ),
    readDriveSettings: bound(E.readDriveSettings, () => readDriveSettings(store)),
    readDriveSettingsRunning: bound(E.readDriveSettingsRunning, () => runningFileIoThreads()),
    updateDriveSettings: bound(E.updateDriveSettings, ({ body, caller }) =>
      refusing(() => services.write.updateSettings(callerOf(caller), body)),
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
    ...driveAlbumRoutes(services),
    ...driveGrantRoutes(services.grants),
    ...driveStorageRoutes(store, services),
  };
}

export function driveExtraRoutes(
  extras: DriveExtras,
): ReturnType<typeof driveContentRoutes> &
  ReturnType<typeof driveDownloadRoutes> &
  ReturnType<typeof driveSharingRoutes> &
  ReturnType<typeof driveSocialRoutes> &
  ReturnType<typeof driveOfflineRoutes> {
  return {
    ...driveContentRoutes(extras.content),
    ...driveDownloadRoutes(extras.downloads),
    ...driveSharingRoutes(extras.sharing),
    ...driveSocialRoutes(extras.social),
    ...driveOfflineRoutes(extras.offline),
  };
}
