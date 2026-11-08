import { app, BrowserWindow, powerMonitor } from 'electron';
import { z } from 'zod';
import {
  DESKTOP_PHOTO_HASH_REQUEST,
  DESKTOP_PHOTOS_CHANGED,
  DESKTOP_PHOTOS_CHARGING_CHANGED,
} from '@smarteverything/domain';
import type { ArgumentHandle } from '../ipc.js';
import { PhotoLibrary } from './library.js';

let library: PhotoLibrary | null = null;
export function desktopPhotoLibrary(): PhotoLibrary {
  library ??= new PhotoLibrary([app.getPath('pictures'), app.getPath('videos')]);
  return library;
}

function broadcast(channel: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send(channel);
  }
}

export function registerPhotosIpc(handle: ArgumentHandle): void {
  const photos = desktopPhotoLibrary();
  handle('desktop:photos-list', () => photos.list());
  handle('desktop:photos-hash', (value) => {
    const input = DESKTOP_PHOTO_HASH_REQUEST.parse(value);
    return photos.hash(input.id, input.operation);
  });
  handle('desktop:photos-cancel', (value) => {
    photos.cancel(z.string().min(1).parse(value));
    return undefined;
  });
  handle('desktop:photos-charging', () => !powerMonitor.isOnBatteryPower());
  const changed = (): void => {
    broadcast(DESKTOP_PHOTOS_CHARGING_CHANGED);
  };
  const off = photos.subscribe(() => {
    broadcast(DESKTOP_PHOTOS_CHANGED);
  });
  powerMonitor.on('on-ac', changed);
  powerMonitor.on('on-battery', changed);
  app.once('will-quit', () => {
    off();
    photos.close();
    powerMonitor.removeListener('on-ac', changed);
    powerMonitor.removeListener('on-battery', changed);
  });
}
