import { app, autoUpdater, type BrowserWindow } from 'electron';
import type { DesktopServiceStatus, MachineUpdateStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopService } from '../service/desktop-service.js';
import { nodeSystem } from '../service/system.js';
import type { SquirrelUpdater } from './squirrel-update.js';
import type { UpdateController } from './update-controller.js';
import { createUpdates } from './update-desktop.js';

const log = new Logger('desktop.update');

const squirrel: SquirrelUpdater = {
  setFeedURL: (options) => {
    autoUpdater.setFeedURL(options);
  },
  checkForUpdates: () => {
    autoUpdater.checkForUpdates();
  },
  quitAndInstall: () => {
    autoUpdater.quitAndInstall();
  },
  onceDownloaded: (listener) => {
    autoUpdater.once('update-downloaded', listener);
  },
  onceNotAvailable: (listener) => {
    autoUpdater.once('update-not-available', listener);
  },
  onceFailed: (listener) => {
    autoUpdater.once('error', listener);
  },
};

async function restartServices(service: DesktopService): Promise<void> {
  if ((await service.controller.status()).active) await service.controller.restart();
  if ((await service.companion.manager.state()).active)
    await service.companion.controller.restart();
}

export function createDesktopUpdates(service: DesktopService): Promise<UpdateController> {
  return createUpdates({
    version: app.getVersion(),
    packaged: app.isPackaged,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    server: () => service.controller.server(),
    fetch: nodeSystem.fetch,
    run: nodeSystem.run,
    restartServices: () => restartServices(service),
    relaunch: (execPath) => {
      app.relaunch({ execPath, args: process.argv.slice(1) });
      app.quit();
    },
    squirrel,
  });
}

export function followUpdates(
  updates: UpdateController,
  window: BrowserWindow,
  changed: () => void,
): (status: DesktopServiceStatus | null) => void {
  updates.onChange((status: MachineUpdateStatus) => {
    changed();
    if (!window.isDestroyed()) window.webContents.send('desktop:update-status-changed', status);
  });
  let running = false;
  return (status) => {
    const nowRunning = status?.health === 'running';
    if (nowRunning && !running) {
      log.debug('update.service_running');
      updates.check().catch((cause: unknown) => {
        log.error('update.check_failed', cause);
      });
    }
    running = nowRunning;
  };
}
