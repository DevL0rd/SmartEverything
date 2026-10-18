import { rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger, messageOf } from '@smarteverything/logging';
import {
  appRootIn,
  extractZip,
  siblingOf,
  swapBack,
  swapIn,
  type RunCommand,
} from './update-install.js';

const log = new Logger('desktop.update');

export interface FolderUpdateOptions {
  readonly platform: 'linux' | 'darwin';
  readonly root: string;
  readonly executable: string;
  readonly run: RunCommand;
  readonly restartServices: () => Promise<void>;
  readonly relaunch: (executable: string) => void;
}

export async function applyFolderUpdate(options: FolderUpdateOptions, zip: string): Promise<void> {
  const { root, platform } = options;
  const unpacked = siblingOf(root, 'update');
  const next = siblingOf(root, 'next');
  await extractZip(options.run, platform, zip, unpacked);
  await rm(next, { recursive: true, force: true });
  await rename(await appRootIn(unpacked), next);
  await rm(unpacked, { recursive: true, force: true });
  const replaced = await swapIn(root, next);
  log.info('update.swapped', { platform });
  try {
    await options.restartServices();
  } catch (cause) {
    log.error('update.restart_failed', cause);
    await swapBack(replaced);
    await options.restartServices().catch((again: unknown) => {
      log.error('update.restart_after_rollback_failed', again, { reason: messageOf(cause) });
    });
    throw cause;
  }
  options.relaunch(join(root, options.executable));
}
