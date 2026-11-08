import type { promises, Stats } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MACHINE_UPDATE_VERSION } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import {
  appRootIn,
  extractZip,
  removeAppFolder,
  siblingOf,
  swapBack,
  swapIn,
  type Replacement,
  type RunCommand,
} from './update-install.js';

import { DESKTOP_INSTALLATION_RESOURCES, DESKTOP_PACKAGE_RESOURCES } from '../package-layout.js';
import { UpdateInstallError } from './update-errors.js';

const log = new Logger('desktop.update');

export interface FolderUpdateOptions {
  readonly platform: 'linux' | 'darwin';
  readonly root: string;
  readonly executable: string;
  readonly version: string;
  readonly run: RunCommand;
  readonly prepareComputerRestart: () => Promise<() => Promise<void>>;
  readonly verifyCandidate: (executable: string, profile: string, version: string) => Promise<void>;
  readonly relaunch: (executable: string) => Promise<void>;
}

async function readEntry(files: typeof promises, file: string): Promise<Stats | null> {
  try {
    return await files.lstat(file);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function validateDesktopFolder(
  root: string,
  options: FolderUpdateOptions,
  requiredResources: readonly string[],
): Promise<void> {
  const { promises } = Object.hasOwn(process.versions, 'electron')
    ? await import('node:original-fs')
    : await import('node:fs');
  const resources =
    options.platform === 'linux' ? join(root, 'resources') : join(root, 'Contents', 'Resources');
  const hubEntries = await Promise.all(
    ['service', 'go2rtc'].map((name) => readEntry(promises, join(resources, name))),
  );
  if (hubEntries.some((entry) => entry !== null)) {
    throw new UpdateInstallError(
      'checking the desktop package',
      'the folder contains central Hub resources',
    );
  }
  const expected = [
    join(root, options.executable),
    ...requiredResources.map((file) => join(resources, file)),
  ];
  for (const file of expected) {
    const entry = await readEntry(promises, file);
    if (entry?.isFile() !== true) {
      throw new UpdateInstallError(
        'checking the desktop package',
        `expected a regular file at ${file}`,
      );
    }
  }
}

async function prepareReplacement(options: FolderUpdateOptions, zip: string): Promise<string> {
  const { root, platform } = options;
  const unpacked = siblingOf(root, 'update');
  const next = siblingOf(root, 'next');
  const profile = siblingOf(root, 'profile');
  await validateDesktopFolder(root, options, DESKTOP_INSTALLATION_RESOURCES);
  try {
    await extractZip(options.run, platform, zip, unpacked);
    const candidate = await appRootIn(unpacked);
    await validateDesktopFolder(candidate, options, DESKTOP_PACKAGE_RESOURCES);
    await removeAppFolder(profile);
    await mkdir(profile, { mode: 0o700 });
    await options.verifyCandidate(join(candidate, options.executable), profile, options.version);
    await removeAppFolder(next);
    await rename(candidate, next);
    return next;
  } finally {
    await Promise.all([removeAppFolder(unpacked), removeAppFolder(profile)]);
  }
}

const BOOT_MARKER = z.strictObject({ version: MACHINE_UPDATE_VERSION });
const BUNDLE_MARKER = '.app/';

export const UPDATE_FIRST_BOOT_ARGUMENT = '--first-boot-after-update';

export type BootReview = 'none' | 'confirming' | 'rolled-back';

function bootMarkerOf(root: string): string {
  return siblingOf(root, 'boot');
}

function rollbackOf(root: string): string {
  return siblingOf(root, 'rollback');
}

export function installRootOf(platform: NodeJS.Platform, execPath: string): string | null {
  if (platform === 'linux') return dirname(execPath);
  if (platform !== 'darwin') return null;
  const cut = execPath.indexOf(BUNDLE_MARKER);
  return cut < 0 ? null : execPath.slice(0, cut + BUNDLE_MARKER.length - 1);
}

async function keepForRollback(replaced: Replacement, version: string): Promise<Replacement> {
  const previous = rollbackOf(replaced.root);
  await removeAppFolder(previous);
  await writeFile(bootMarkerOf(replaced.root), JSON.stringify({ version }), { mode: 0o600 });
  await rename(replaced.previous, previous);
  return { root: replaced.root, previous };
}

async function readBootMarker(root: string): Promise<z.infer<typeof BOOT_MARKER> | null> {
  const text = await readFile(bootMarkerOf(root), 'utf8').catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  });
  return text === null ? null : BOOT_MARKER.parse(JSON.parse(text));
}

async function clearBoot(root: string): Promise<void> {
  await rm(bootMarkerOf(root), { force: true });
  await removeAppFolder(rollbackOf(root));
}

export async function reviewBoot(
  root: string,
  runningVersion: string,
  afterUpdate: boolean,
): Promise<BootReview> {
  const marker = await readBootMarker(root);
  if (marker === null) return 'none';
  if (marker.version !== runningVersion) {
    await clearBoot(root);
    return 'none';
  }
  if (afterUpdate) return 'confirming';
  log.warn('update.boot_unconfirmed', { version: marker.version });
  const failed = await swapBack({ root, previous: rollbackOf(root) });
  await rm(bootMarkerOf(root), { force: true });
  await removeAppFolder(failed).catch((cause: unknown) => {
    log.error('update.failed_candidate_cleanup_failed', cause);
  });
  return 'rolled-back';
}

export async function confirmBoot(root: string): Promise<void> {
  await clearBoot(root);
  log.info('update.boot_confirmed');
}

export async function applyFolderUpdate(options: FolderUpdateOptions, zip: string): Promise<void> {
  const { root, platform } = options;
  const next = await prepareReplacement(options, zip);
  const restartComputer = await options.prepareComputerRestart();
  let replaced = await swapIn(root, next);
  log.info('update.swapped', { platform });
  try {
    replaced = await keepForRollback(replaced, options.version);
    await restartComputer();
    await options.relaunch(join(root, options.executable));
  } catch (cause) {
    log.error('update.restart_failed', cause);
    const failed = await swapBack(replaced);
    await rm(bootMarkerOf(root), { force: true });
    await restartComputer().catch((again: unknown) => {
      log.error('update.restart_after_rollback_failed', again, { reason: messageOf(cause) });
    });
    await removeAppFolder(failed).catch((again: unknown) => {
      log.error('update.failed_candidate_cleanup_failed', again);
    });
    throw cause;
  }
}
