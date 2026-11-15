import { app, BrowserWindow, shell } from 'electron';
import { z } from 'zod';
import { DESKTOP_DRIVE_CHANGED, DESKTOP_DRIVE_COMMAND } from '@smarteverything/domain';
import type { ArgumentHandle } from '../ipc.js';
import type { DriveControlClient } from './control-client.js';

export type DriveBridgeClient = Pick<DriveControlClient, 'current' | 'run' | 'onState'>;

const PLACEMENT_ID = z.string().min(1);

export class MountNotMountedError extends Error {
  override readonly name = 'MountNotMountedError';

  constructor() {
    super('That folder is not mounted on this computer right now');
  }
}

export class MountOpenFailedError extends Error {
  override readonly name = 'MountOpenFailedError';
}

async function openMount(client: DriveBridgeClient, value: unknown): Promise<void> {
  const placementId = PLACEMENT_ID.parse(value);
  const point = client.current?.mount?.points.find(
    (entry) => entry.placementId === placementId,
  )?.point;
  if (point === undefined) throw new MountNotMountedError();
  const failure = await shell.openPath(point);
  if (failure !== '') throw new MountOpenFailedError(failure);
}

export function registerDriveIpc(handle: ArgumentHandle, client: DriveBridgeClient): void {
  handle('desktop:drive-state', () => client.current);
  handle('desktop:drive-run', (value) => client.run(DESKTOP_DRIVE_COMMAND.parse(value)));
  handle('desktop:drive-open', async (value) => {
    await openMount(client, value);
    return undefined;
  });
  const off = client.onState((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send(DESKTOP_DRIVE_CHANGED, state);
    }
  });
  app.once('will-quit', off);
}
