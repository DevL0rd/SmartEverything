import {
  MACHINE_UPDATE_MANIFEST_FILE,
  MACHINE_UPDATE_NOTICE,
  MACHINE_UPDATE_NOTICE_FILE,
  type AppUpdateNotice,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import type { ReleaseFolder } from './release-folder';

const log = new Logger('hub.machine-updates');

async function readNotice(folder: ReleaseFolder): Promise<AppUpdateNotice | null | undefined> {
  const text = await readFile(folder.pathOf(MACHINE_UPDATE_NOTICE_FILE), 'utf8').catch(
    (cause: unknown) => {
      if (isMissing(cause)) return null;
      throw cause;
    },
  );
  if (text === null) return null;
  const { id, version, runtimeVersion } = MACHINE_UPDATE_NOTICE.parse(JSON.parse(text));
  const manifest = await folder.refresh();
  if (manifest === null) return null;
  if (manifest.version !== version) return undefined;
  return { type: 'app_update', platform: 'desktop', channel: 'release', id, runtimeVersion };
}

async function swapStaged(layout: HubLayout): Promise<boolean> {
  try {
    await stat(`${layout.system.updates.machineUpdates}.next`);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

async function activeNotice(
  layout: HubLayout,
  folder: ReleaseFolder,
): Promise<AppUpdateNotice | null | undefined> {
  const notice = await readNotice(folder);
  if (notice !== null) return notice;
  if (await swapStaged(layout)) return undefined;
  return readNotice(folder);
}

function reportFailure(cause: unknown): void {
  log.error('machine_update.notice_failed', cause);
}

function watchPath(directory: string, changed: (name: string | null) => void): FSWatcher | null {
  try {
    const watcher = watch(directory, { persistent: false }, (_event, name) => {
      changed(name);
    });
    watcher.on('error', (cause) => {
      log.error('machine_update.watch_failed', cause);
    });
    return watcher;
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

function watchReleasePaths(
  layout: HubLayout,
  folder: ReleaseFolder,
  reload: () => void,
): () => void {
  const open = (): FSWatcher | null =>
    watchPath(folder.pathOf(''), (name) => {
      if (
        name === null ||
        name === MACHINE_UPDATE_MANIFEST_FILE ||
        name === MACHINE_UPDATE_NOTICE_FILE
      )
        reload();
    });
  let active = open();
  const folderName = basename(layout.system.updates.machineUpdates);
  const parent = watchPath(dirname(layout.system.updates.machineUpdates), (name) => {
    if (name !== null && name !== folderName) return;
    active?.close();
    active = open();
    reload();
  });
  return (): void => {
    parent?.close();
    active?.close();
  };
}

export function watchMachineUpdates(
  layout: HubLayout,
  folder: ReleaseFolder,
  publish: (notice: AppUpdateNotice) => void,
): () => Promise<void> {
  let announced: AppUpdateNotice | null = null;
  let pending = readNotice(folder)
    .then((notice) => {
      announced = notice ?? null;
    })
    .catch(reportFailure);
  const stop = watchReleasePaths(layout, folder, () => {
    pending = pending
      .then(async () => {
        const notice = await activeNotice(layout, folder);
        if (notice === undefined || notice?.id === announced?.id) return;
        if (notice === null) {
          if (announced === null) return;
          const withdrawn = { ...announced, id: null };
          announced = null;
          publish(withdrawn);
          return;
        }
        announced = notice;
        publish(notice);
      })
      .catch(reportFailure);
  });
  return async (): Promise<void> => {
    stop();
    await pending;
  };
}
