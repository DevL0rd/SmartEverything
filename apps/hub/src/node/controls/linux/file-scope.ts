import type { Stats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { fsCode } from '../../../fs-code';

export interface Located {
  readonly path: string;
  readonly stats: Stats;
}

export function failureOfFs(cause: unknown, action: string): never {
  const code = fsCode(cause);
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    throw new NodeFailureError('not_found', 'That file or folder does not exist.');
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    throw new NodeFailureError('not_permitted', `The signed-in user cannot ${action} that.`);
  }
  if (code === 'EEXIST' || code === 'ENOTEMPTY') {
    throw new NodeFailureError('failed', 'Something with that name is already there.');
  }
  if (code === 'ENOSPC') {
    throw new NodeFailureError('failed', 'There is not enough space on that drive.');
  }
  throw cause;
}

export function contains(folder: string, path: string): boolean {
  return path === folder || path.startsWith(folder === '/' ? '/' : `${folder}/`);
}

export class FileScope {
  constructor(private readonly guarded: readonly string[]) {}

  lexical(path: string): string {
    const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    if (!clean.startsWith('/') || clean.includes('\0') || posix.normalize(clean) !== clean) {
      throw new NodeFailureError('not_permitted', 'That path is not allowed.');
    }
    return clean;
  }

  async place(path: string): Promise<string> {
    const clean = this.lexical(path);
    if (clean === '/') {
      throw new NodeFailureError('not_permitted', 'The top of the drive cannot be changed.');
    }
    const parent = await realpath(dirname(clean)).catch((cause: unknown) =>
      failureOfFs(cause, 'reach'),
    );
    return join(parent, basename(clean));
  }

  async existing(path: string, guarded: boolean): Promise<Located> {
    const located = await this.place(path);
    const stats = await lstat(located).catch((cause: unknown) => failureOfFs(cause, 'read'));
    if (guarded) {
      this.protect(located);
    }
    return { path: located, stats };
  }

  async folder(path: string): Promise<string> {
    const clean = this.lexical(path);
    const resolved = await realpath(clean).catch((cause: unknown) => failureOfFs(cause, 'reach'));
    const stats = await lstat(resolved).catch((cause: unknown) => failureOfFs(cause, 'read'));
    if (!stats.isDirectory()) {
      throw new NodeFailureError('not_supported', 'That is not a folder.');
    }
    return resolved;
  }

  protect(located: string): void {
    if (this.guarded.some((place) => contains(located, place))) {
      throw new NodeFailureError(
        'not_permitted',
        'That location is protected and cannot be changed.',
      );
    }
  }
}
