import type { Dir, Stats } from 'node:fs';
import { lstat, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import { fsCode } from '../../fs-code';
import { areaOf, type MoveArea } from './areas';

interface EntryBase {
  readonly relPath: string;
  readonly area: MoveArea;
  readonly mode: number;
  readonly mtimeMs: number;
}

export type WalkEntry =
  | (EntryBase & { readonly kind: 'file'; readonly size: number })
  | (EntryBase & { readonly kind: 'directory' })
  | (EntryBase & { readonly kind: 'symlink' })
  | (EntryBase & { readonly kind: 'special' });

export interface WalkOperations {
  readonly opendir: (path: string) => Promise<Dir>;
  readonly lstat: (path: string) => Promise<Stats>;
}

const NODE_WALK_OPERATIONS: WalkOperations = { opendir, lstat };

interface Frame {
  readonly dir: Dir;
  readonly relPath: string;
  readonly closing: WalkEntry | undefined;
}

function entryOf(relPath: string, area: MoveArea, info: Stats): WalkEntry {
  const base = { relPath, area, mode: info.mode, mtimeMs: info.mtimeMs };
  if (info.isDirectory()) {
    return { ...base, kind: 'directory' };
  }
  if (info.isSymbolicLink()) {
    return { ...base, kind: 'symlink' };
  }
  if (info.isFile()) {
    return { ...base, kind: 'file', size: info.size };
  }
  return { ...base, kind: 'special' };
}

export async function lstatIfPresent(
  path: string,
  operations: WalkOperations = NODE_WALK_OPERATIONS,
): Promise<Stats | undefined> {
  try {
    return await operations.lstat(path);
  } catch (error) {
    const code = fsCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  }
}

async function openFrame(
  operations: WalkOperations,
  root: string,
  relPath: string,
  closing: WalkEntry | undefined,
): Promise<Frame> {
  const dir = await operations.opendir(relPath === '' ? root : join(root, relPath));
  return { dir, relPath, closing };
}

async function closeAll(stack: readonly Frame[]): Promise<void> {
  await Promise.allSettled(stack.map((frame) => frame.dir.close()));
}

export async function* walkHubEntries(
  root: string,
  operations: WalkOperations = NODE_WALK_OPERATIONS,
): AsyncGenerator<WalkEntry> {
  const stack: Frame[] = [await openFrame(operations, root, '', undefined)];
  try {
    for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
      const dirent = await frame.dir.read();
      if (dirent === null) {
        stack.pop();
        await frame.dir.close();
        if (frame.closing !== undefined) {
          yield frame.closing;
        }
        continue;
      }
      const relPath = frame.relPath === '' ? dirent.name : `${frame.relPath}/${dirent.name}`;
      const area = areaOf(relPath);
      const info =
        area === undefined ? undefined : await lstatIfPresent(join(root, relPath), operations);
      if (area === undefined || info === undefined) {
        continue;
      }
      const entry = entryOf(relPath, area, info);
      if (entry.kind === 'directory') {
        stack.push(await openFrame(operations, root, relPath, entry));
      } else {
        yield entry;
      }
    }
  } finally {
    await closeAll(stack);
  }
}
