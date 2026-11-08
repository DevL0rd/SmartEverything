import { ipcRenderer } from 'electron';
import { z } from 'zod';
import {
  DESKTOP_PHOTO_HASH,
  DESKTOP_PHOTO_LIBRARY,
  DESKTOP_PHOTOS_CHANGED,
  DESKTOP_PHOTOS_CHARGING_CHANGED,
  type DesktopPhotos,
} from '@smarteverything/domain';

function listen(channel: string, listener: () => void): () => void {
  ipcRenderer.on(channel, listener);
  return (): void => {
    ipcRenderer.removeListener(channel, listener);
  };
}

export const photos: DesktopPhotos = {
  async list(): ReturnType<DesktopPhotos['list']> {
    return DESKTOP_PHOTO_LIBRARY.parse(await ipcRenderer.invoke('desktop:photos-list'));
  },
  onChange: (listener) => listen(DESKTOP_PHOTOS_CHANGED, listener),
  async hash(input): ReturnType<DesktopPhotos['hash']> {
    return DESKTOP_PHOTO_HASH.parse(await ipcRenderer.invoke('desktop:photos-hash', input));
  },
  async cancel(operation): Promise<void> {
    await ipcRenderer.invoke('desktop:photos-cancel', operation);
  },
  async charging(): Promise<boolean> {
    return z.boolean().parse(await ipcRenderer.invoke('desktop:photos-charging'));
  },
  onChargingChange: (listener) => listen(DESKTOP_PHOTOS_CHARGING_CHANGED, listener),
};
