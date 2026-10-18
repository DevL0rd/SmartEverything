import { realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { fsCode } from '../fs-code';

export interface Folder {
  readonly cwd: string;
  readonly real: string;
}

const PARENT_SEGMENT = /(^|\/)\.\.(\/|$)/;

const NOT_THERE = new Set(['ENOENT', 'ENOTDIR']);

function realOf(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (cause) {
    if (!NOT_THERE.has(fsCode(cause) ?? '')) {
      return null;
    }
  }
  const parent = posix.dirname(path);
  if (parent === path) {
    return null;
  }
  const real = realOf(parent);
  return real === null ? null : posix.join(real, posix.basename(path));
}

export function folderOf(cwd: string | null): Folder | null {
  if (cwd === null || !posix.isAbsolute(cwd) || PARENT_SEGMENT.test(cwd)) {
    return null;
  }
  const real = realOf(posix.normalize(cwd));
  return real === null || real === '/' ? null : { cwd: posix.normalize(cwd), real };
}

export function hasParentSegment(path: string): boolean {
  return PARENT_SEGMENT.test(path);
}

export function realTarget(path: string, folder: Folder): string | null {
  if (path.includes('\0') || path.startsWith('~') || hasParentSegment(path)) {
    return null;
  }
  const absolute = posix.isAbsolute(path) ? posix.normalize(path) : posix.join(folder.cwd, path);
  const real = realOf(absolute);
  if (real === null) {
    return null;
  }
  const relative = posix.relative(folder.real, real);
  const inside = relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative);
  return inside ? real : null;
}
