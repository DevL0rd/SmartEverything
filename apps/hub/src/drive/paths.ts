import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fsCode } from '../fs-code';
import { isMissing } from '../fs-util';

export type DrivePathFailure =
  'invalid' | 'escape' | 'missing' | 'changed' | 'not-directory' | 'denied';

export class DrivePathError extends Error {
  override readonly name = 'DrivePathError';

  constructor(
    readonly failure: DrivePathFailure,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

export interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface ResolvedPath {
  readonly root: string;
  readonly relative: string;
  readonly absolute: string;
  readonly identity: FileIdentity | null;
}

export type OpenMode = 'read' | 'write' | 'readwrite';

const OPEN_FLAGS: Readonly<Record<OpenMode, number>> = {
  read: constants.O_RDONLY,
  write: constants.O_WRONLY,
  readwrite: constants.O_RDWR,
};

export function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function normalizeRelativePath(input: string): string {
  const normalized = input.normalize('NFC');
  if (normalized.includes('\0')) {
    throw new DrivePathError('invalid', 'A path cannot contain a NUL character.');
  }
  if (normalized === '') {
    return '';
  }
  if (normalized.startsWith('/')) {
    throw new DrivePathError('invalid', 'A drive path must be relative to its root.');
  }
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new DrivePathError('invalid', `A drive path cannot contain the segment "${segment}".`);
    }
  }
  return normalized;
}

export function decodeRequestPath(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch (cause) {
    throw new DrivePathError('invalid', 'The path is not valid percent-encoding.', cause);
  }
  return normalizeRelativePath(decoded);
}

async function entryExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    if (isMissing(cause)) {
      return false;
    }
    throw cause;
  }
}

async function realpathWithTail(
  path: string,
): Promise<{ readonly path: string; readonly exists: boolean }> {
  try {
    return { path: await realpath(path), exists: true };
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOTDIR') {
      throw new DrivePathError('not-directory', 'A parent of the path is not a directory.');
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new DrivePathError('denied', 'The path cannot be read.', cause);
    }
    if (code !== 'ENOENT') {
      throw cause;
    }
  }
  if (await entryExists(path)) {
    throw new DrivePathError('escape', 'The path is a dangling symlink.');
  }
  const parent = dirname(path);
  if (parent === path) {
    throw new DrivePathError('missing', 'The root directory does not exist.');
  }
  const resolvedParent = await realpathWithTail(parent);
  return { path: join(resolvedParent.path, basename(path)), exists: false };
}

async function identityOf(path: string): Promise<FileIdentity> {
  const { dev, ino } = await stat(path, { bigint: true });
  return { dev, ino };
}

export async function resolveInRoot(rootPath: string, input: string): Promise<ResolvedPath> {
  const normalized = normalizeRelativePath(input);
  const root = await realpath(rootPath).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT') {
      throw new DrivePathError('missing', 'The root directory does not exist.');
    }
    throw cause;
  });
  const lexical = normalized === '' ? root : join(root, ...normalized.split('/'));
  const resolved = await realpathWithTail(lexical);
  if (!isInside(root, resolved.path)) {
    throw new DrivePathError('escape', 'The path leaves its root through a symlink.');
  }
  return {
    root,
    relative: normalized,
    absolute: resolved.path,
    identity: resolved.exists ? await identityOf(resolved.path) : null,
  };
}

export async function openResolved(resolved: ResolvedPath, mode: OpenMode): Promise<FileHandle> {
  const expected = resolved.identity;
  if (expected === null) {
    throw new DrivePathError('missing', 'The path does not exist.');
  }
  let handle: FileHandle;
  try {
    handle = await open(resolved.absolute, OPEN_FLAGS[mode] | constants.O_NOFOLLOW);
  } catch (cause) {
    if (fsCode(cause) === 'ELOOP') {
      throw new DrivePathError('escape', 'The path was replaced by a symlink.');
    }
    throw cause;
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== expected.dev || opened.ino !== expected.ino) {
      throw new DrivePathError('changed', 'The path changed between resolving and opening.');
    }
  } catch (cause) {
    await handle.close();
    throw cause;
  }
  return handle;
}
