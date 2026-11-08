import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rename, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isNewerVersion } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { UpdateCleanupError, UpdateInstallError } from './update-errors.js';

const log = new Logger('desktop.update');

export type RunCommand = (file: string, args: readonly string[]) => Promise<unknown>;

export interface Replacement {
  readonly root: string;
  readonly previous: string;
}

export async function removeAppFolder(path: string): Promise<void> {
  const { promises } = Object.hasOwn(process.versions, 'electron')
    ? await import('node:original-fs')
    : await import('node:fs');
  try {
    await promises.rm(path, { recursive: true, force: true });
  } catch (cause) {
    throw new UpdateCleanupError(cause);
  }
}

export async function extractZip(
  run: RunCommand,
  platform: 'linux' | 'darwin',
  zip: string,
  destination: string,
): Promise<void> {
  await removeAppFolder(destination);
  if (platform === 'darwin') {
    await run('ditto', ['-x', '-k', zip, destination]);
    return;
  }
  await run('unzip', ['-q', zip, '-d', destination]);
}

export async function appRootIn(extracted: string): Promise<string> {
  const names = (await readdir(extracted)).filter((name) => name !== '__MACOSX');
  const [only] = names;
  if (
    names.length === 1 &&
    only !== undefined &&
    (await stat(join(extracted, only))).isDirectory()
  ) {
    return join(extracted, only);
  }
  throw new UpdateInstallError(
    'unpacking the download',
    `expected one app folder, found ${names.length === 0 ? 'nothing' : names.join(', ')}`,
  );
}

export function siblingOf(root: string, suffix: string): string {
  return join(dirname(root), `${basename(root)}.${suffix}`);
}

async function putBack(saved: string, missing: string, cause: unknown): Promise<never> {
  try {
    await rename(saved, missing);
  } catch (restoreCause) {
    log.error('update.restore_failed', restoreCause, { missing, saved });
    throw new AggregateError(
      [cause, restoreCause],
      `The update failed and the app folder could not be put back; the old copy is at ${saved}`,
      { cause: restoreCause },
    );
  }
  throw cause;
}

async function siblingsStartingWith(root: string, prefix: string): Promise<readonly string[]> {
  const start = `${basename(root)}.${prefix}`;
  return (await readdir(dirname(root)))
    .filter((name) => name.startsWith(start))
    .map((name) => join(dirname(root), name));
}

async function removeLoggedly(path: string): Promise<void> {
  await removeAppFolder(path).catch((cause: unknown) => {
    log.warn('update.leftover_not_removed', { path, reason: messageOf(cause) });
  });
}

export async function swapIn(root: string, replacement: string): Promise<Replacement> {
  const previous = siblingOf(root, `previous-${randomUUID()}`);
  await rename(root, previous);
  try {
    await rename(replacement, root);
  } catch (cause) {
    return putBack(previous, root, cause);
  }
  const older = await siblingsStartingWith(root, 'previous');
  await Promise.all(older.filter((path) => path !== previous).map(removeLoggedly));
  return { root, previous };
}

export async function swapBack(replaced: Replacement): Promise<string> {
  const failed = await mkdtemp(siblingOf(replaced.root, 'failed-'));
  const candidate = join(failed, 'app');
  await rename(replaced.root, candidate);
  try {
    await rename(replaced.previous, replaced.root);
  } catch (cause) {
    return putBack(candidate, replaced.root, cause);
  }
  return failed;
}

export async function removeBootLeftovers(
  root: string,
  stagingDirectory: string,
  runningVersion: string,
): Promise<void> {
  const copies = [
    ...(await siblingsStartingWith(root, 'previous')),
    ...(await siblingsStartingWith(root, 'failed-')),
  ];
  await Promise.all(copies.map(removeLoggedly));
  await removeStagedUpTo(stagingDirectory, runningVersion);
}

export async function removeStagedUpTo(
  stagingDirectory: string,
  runningVersion: string,
): Promise<void> {
  const names = await readdir(stagingDirectory).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw cause;
  });
  await Promise.all(
    names
      .filter((name) => !isNewerVersion(name, runningVersion))
      .map((name) => removeLoggedly(join(stagingDirectory, name))),
  );
}

export function removeStaged(directory: string): Promise<void> {
  return removeLoggedly(directory);
}
