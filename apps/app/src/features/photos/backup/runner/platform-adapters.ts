import { appPlatform, desktopBridge } from '../../../../design/platform';
import type { MediaAccess } from '../model/types';
import type { ServerConnection } from '../../../../api/connection/storage';
import type { BackupPorts, MediaLibraryPort } from './ports';
import { mediaLibraryPort } from './media-library';
import {
  chargingSource,
  createBackupUploadPort,
  createNativeMediaPort,
  nativeBackupAvailable,
} from './native-adapters';
import { conditionsPort } from './network-conditions';
import { desktopBackupAdapters } from './desktop-adapters';

export function backupAvailable(): boolean {
  return appPlatform() === 'desktop'
    ? desktopBridge()?.photos !== undefined
    : appPlatform() === 'android' && nativeBackupAvailable();
}

export function backupAdapters(
  connection: ServerConnection,
  key: string,
): Pick<BackupPorts, 'media' | 'native' | 'conditions' | 'upload'> {
  if (appPlatform() === 'desktop') {
    const photos = desktopBridge()?.photos;
    if (photos === undefined) throw new Error('Update the desktop app to enable photo backup.');
    return desktopBackupAdapters(photos, connection, key);
  }
  return {
    media: mediaLibraryPort,
    native: createNativeMediaPort(),
    conditions: conditionsPort(chargingSource),
    upload: createBackupUploadPort(connection, key),
  };
}

export function backupAccessPort(): Pick<MediaLibraryPort, 'requestAccess' | 'presentPicker'> {
  if (appPlatform() === 'desktop') {
    return {
      requestAccess(): Promise<MediaAccess> {
        if (!backupAvailable()) throw new Error('Update the desktop app to enable photo backup.');
        return Promise.resolve('all');
      },
      presentPicker(): Promise<void> {
        return Promise.reject(new Error('Desktop backup uses Pictures and Videos.'));
      },
    };
  }
  return mediaLibraryPort;
}
