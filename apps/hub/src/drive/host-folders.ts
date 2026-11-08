import { readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import type { DriveHostFolders } from '@smarteverything/domain';
import { fsCode } from '../fs-code';
import { DrivePathError, isInside } from './paths';

async function realRoots(mountPoints: readonly string[]): Promise<string[]> {
  const settled = await Promise.allSettled(mountPoints.map((mountPoint) => realpath(mountPoint)));
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function folderOf(path: string): DriveHostFolders['folders'][number] {
  const name = basename(path);
  return { name, path, hidden: name.startsWith('.') };
}

function byName(
  left: DriveHostFolders['folders'][number],
  right: DriveHostFolders['folders'][number],
): number {
  return left.name.localeCompare(right.name);
}

async function resolvedInside(requested: string, roots: readonly string[]): Promise<string> {
  if (requested.includes('\0') || !isAbsolute(requested)) {
    throw new DrivePathError('invalid', 'The folder path must be absolute.');
  }
  let real: string;
  try {
    real = await realpath(normalize(requested));
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOENT') throw new DrivePathError('missing', 'The folder does not exist.', cause);
    if (code === 'ENOTDIR') {
      throw new DrivePathError('not-directory', 'The path is not a folder.', cause);
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new DrivePathError('denied', 'The folder cannot be read.', cause);
    }
    throw cause;
  }
  if (!roots.some((root) => isInside(root, real))) {
    throw new DrivePathError('escape', 'The folder is outside the hub host disks.');
  }
  return real;
}

async function childFolders(
  real: string,
  roots: readonly string[],
): Promise<DriveHostFolders['folders']> {
  let entries;
  try {
    entries = await readdir(real, { withFileTypes: true });
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOTDIR') {
      throw new DrivePathError('not-directory', 'The path is not a folder.', cause);
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new DrivePathError('denied', 'The folder cannot be read.', cause);
    }
    throw cause;
  }
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => folderOf(join(real, entry.name)))
    .filter((folder) => roots.some((root) => isInside(root, folder.path)));
  return folders.toSorted(byName);
}

export async function listHostFolders(
  mountPoints: readonly string[],
  requested: string | undefined,
): Promise<DriveHostFolders> {
  const roots = await realRoots(mountPoints);
  if (requested === undefined) {
    return {
      path: null,
      parent: null,
      folders: [...new Set(roots)].map(folderOf).toSorted(byName),
    };
  }
  const real = await resolvedInside(requested, roots);
  const parent = dirname(real);
  return {
    path: real,
    parent: parent !== real && roots.some((root) => isInside(root, parent)) ? parent : null,
    folders: await childFolders(real, roots),
  };
}

export async function listHostFoldersOf(
  volumes: () => Promise<readonly { readonly mountPoint: string }[]>,
  requested: string | undefined,
): Promise<DriveHostFolders> {
  return listHostFolders(
    (await volumes()).map((volume) => volume.mountPoint),
    requested,
  );
}
