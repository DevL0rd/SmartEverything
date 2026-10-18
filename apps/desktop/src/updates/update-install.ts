import { readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { UpdateInstallError } from './update-errors.js';

export type RunCommand = (file: string, args: readonly string[]) => Promise<unknown>;

export interface Replacement {
  readonly root: string;
  readonly previous: string;
}

export async function extractZip(
  run: RunCommand,
  platform: 'linux' | 'darwin',
  zip: string,
  destination: string,
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
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

export async function swapIn(root: string, replacement: string): Promise<Replacement> {
  const previous = siblingOf(root, 'previous');
  await rm(previous, { recursive: true, force: true });
  await rename(root, previous);
  try {
    await rename(replacement, root);
  } catch (cause) {
    await rename(previous, root);
    throw cause;
  }
  return { root, previous };
}

export async function swapBack(replaced: Replacement): Promise<void> {
  const failed = siblingOf(replaced.root, 'failed');
  await rm(failed, { recursive: true, force: true });
  await rename(replaced.root, failed);
  await rename(replaced.previous, replaced.root);
  await rm(failed, { recursive: true, force: true });
}
