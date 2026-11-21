import { realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import { fsCode } from '../fs-code';

export interface Folder {
  readonly cwd: string;
  readonly real: string;
  readonly resolved: ReadonlyMap<string, string | null>;
}

const PARENT_SEGMENT = /(^|\/)\.\.(\/|$)/;

const NOT_THERE = new Set(['ENOENT', 'ENOTDIR']);

export class UnresolvedPathError extends Error {
  override readonly name = 'UnresolvedPathError';

  constructor(path: string) {
    super(`The path ${path} was not resolved before the risk check.`);
  }
}

async function realOf(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (cause) {
    if (!NOT_THERE.has(fsCode(cause) ?? '')) {
      return null;
    }
  }
  const parent = posix.dirname(path);
  if (parent === path) {
    return null;
  }
  const real = await realOf(parent);
  return real === null ? null : posix.join(real, posix.basename(path));
}

export function hasParentSegment(path: string): boolean {
  return PARENT_SEGMENT.test(path);
}

function checkable(path: string): boolean {
  return !path.includes('\0') && !path.startsWith('~') && !hasParentSegment(path);
}

function absoluteOf(path: string, cwd: string): string {
  return posix.isAbsolute(path) ? posix.normalize(path) : posix.join(cwd, path);
}

export async function folderOf(
  cwd: string | null,
  paths: readonly string[],
): Promise<Folder | null> {
  if (cwd === null || !posix.isAbsolute(cwd) || PARENT_SEGMENT.test(cwd)) {
    return null;
  }
  const normal = posix.normalize(cwd);
  const absolutes = [...new Set(paths.filter(checkable).map((path) => absoluteOf(path, normal)))];
  const [real, resolved] = await Promise.all([
    realOf(normal),
    Promise.all(
      absolutes.map(async (absolute): Promise<[string, string | null]> => [
        absolute,
        await realOf(absolute),
      ]),
    ),
  ]);
  return real === null || real === '/' ? null : { cwd: normal, real, resolved: new Map(resolved) };
}

export function realTarget(path: string, folder: Folder): string | null {
  if (!checkable(path)) {
    return null;
  }
  const absolute = absoluteOf(path, folder.cwd);
  const real = folder.resolved.get(absolute);
  if (real === undefined) {
    throw new UnresolvedPathError(absolute);
  }
  if (real === null) {
    return null;
  }
  const relative = posix.relative(folder.real, real);
  const inside = relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative);
  return inside ? real : null;
}
