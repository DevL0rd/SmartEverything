import { app, autoUpdater, type BrowserWindow } from 'electron';
import type { MachineUpdateStatus } from '@smarteverything/domain';
import { background, Logger, messageOf } from '@smarteverything/logging';
import type { DesktopService } from '../service/desktop-service.js';
import { DESKTOP_PACKAGE_PROBE, DESKTOP_PACKAGE_VERSION } from '../package-probe.js';
import { nodeSystem, runUntilExit } from '../service/system.js';
import type { SquirrelUpdater } from './squirrel-update.js';
import type { UpdateController } from './update-controller.js';
import {
  confirmBoot,
  installRootOf,
  reviewBoot,
  UPDATE_FIRST_BOOT_ARGUMENT,
} from './folder-update.js';
import { createUpdates } from './update-desktop.js';
import { MachineNoticeWatch, type NoticeRoute } from './update-notices.js';

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
  listen: (events) => {
    autoUpdater.on('update-downloaded', events.downloaded);
    autoUpdater.on('update-not-available', events.notAvailable);
    autoUpdater.on('error', events.failed);
    return () => {
      autoUpdater.removeListener('update-downloaded', events.downloaded);
      autoUpdater.removeListener('update-not-available', events.notAvailable);
      autoUpdater.removeListener('error', events.failed);
    };
  },
};

async function prepareComputerRestart(service: DesktopService): Promise<() => Promise<void>> {
  const active = (await service.controller.status()).active;
  return async () => {
    if (active) await service.controller.restart();
  };
}

function carriedArguments(): string[] {
  return process.argv.slice(1).filter((argument) => argument !== UPDATE_FIRST_BOOT_ARGUMENT);
}

function relaunchInto(execPath: string, extra: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    app.once('quit', () => {
      resolve();
    });
    try {
      app.relaunch({ execPath, args: [...carriedArguments(), ...extra] });
      app.quit();
    } catch (cause) {
      reject(new Error(`The app could not quit: ${messageOf(cause)}`, { cause }));
    }
  });
}

function installRoot(): string | null {
  return app.isPackaged ? installRootOf(process.platform, process.execPath) : null;
}

export async function recoverDesktopBoot(): Promise<boolean> {
  const root = installRoot();
  if (root === null) return false;
  const review = await reviewBoot(
    root,
    app.getVersion(),
    process.argv.includes(UPDATE_FIRST_BOOT_ARGUMENT),
  );
  if (review !== 'rolled-back') return false;
  log.warn('update.rolled_back_to_previous', { version: app.getVersion() });
  app.relaunch({ execPath: process.execPath, args: carriedArguments() });
  app.exit(0);
  return true;
}

export async function confirmDesktopBoot(): Promise<void> {
  const root = installRoot();
  if (root !== null) await confirmBoot(root);
}

export function confirmBootWhenLoaded(window: BrowserWindow): void {
  window.webContents.once('did-finish-load', () => {
    background(confirmDesktopBoot(), 'update.boot_confirm_failed');
  });
}

export function createDesktopUpdates(
  service: DesktopService,
  fetchFrom: typeof fetch,
): Promise<UpdateController> {
  return createUpdates({
    version: app.getVersion(),
    packaged: app.isPackaged,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    server: () => service.controller.server(),
    fetch: fetchFrom,
    run: nodeSystem.run,
    prepareComputerRestart: () => prepareComputerRestart(service),
    verifyCandidate: async (executable, profile, version) => {
      await runUntilExit(executable, [
        DESKTOP_PACKAGE_PROBE,
        `${DESKTOP_PACKAGE_VERSION}${version}`,
        `--user-data-dir=${profile}`,
      ]);
    },
    relaunch: (execPath) => relaunchInto(execPath, [UPDATE_FIRST_BOOT_ARGUMENT]),
    squirrel,
  });
}

export function followUpdates(
  updates: UpdateController,
  window: BrowserWindow,
  changed: () => void,
): void {
  updates.onChange((status: MachineUpdateStatus) => {
    changed();
    if (!window.isDestroyed()) window.webContents.send('desktop:update-status-changed', status);
  });
}

export function checkDesktopUpdates(updates: UpdateController): void {
  updates.check().catch((cause: unknown) => {
    log.error('update.check_failed', cause);
  });
}

export function followHubNotices(
  updates: UpdateController,
  route: NoticeRoute,
  onRouteReady: (listener: () => void) => void,
): () => void {
  const watch = new MachineNoticeWatch(route, () => {
    checkDesktopUpdates(updates);
  });
  onRouteReady(() => {
    checkDesktopUpdates(updates);
    background(watch.connect(), 'update.notice_connect_failed');
  });
  return () => {
    watch.close();
  };
}
