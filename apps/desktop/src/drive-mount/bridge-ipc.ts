import { app, BrowserWindow } from 'electron';
import { DESKTOP_DRIVE_CHANGED, DESKTOP_DRIVE_COMMAND } from '@smarteverything/domain';
import type { ArgumentHandle } from '../ipc.js';
import type { DriveControlClient } from './control-client.js';

export type DriveBridgeClient = Pick<DriveControlClient, 'current' | 'run' | 'onState'>;

export function registerDriveIpc(handle: ArgumentHandle, client: DriveBridgeClient): void {
  handle('desktop:drive-state', () => client.current);
  handle('desktop:drive-run', (value) => client.run(DESKTOP_DRIVE_COMMAND.parse(value)));
  const off = client.onState((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send(DESKTOP_DRIVE_CHANGED, state);
    }
  });
  app.once('will-quit', off);
}
