import type { BigIntStats } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fsCode } from '../fs-code';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { modeDrifts, sameContent, sameIdentity, type Indexed } from './scanner-index';
import { modeOf, specialOf, type WalkEntry } from './scanner-walk';

export type IndexReader = (
  rootId: string,
  relPaths: readonly string[],
) => Promise<readonly Indexed[]>;

const GONE = new Set(['ENOENT', 'ENOTDIR']);

async function statOf(absolute: string): Promise<BigIntStats | null> {
  try {
    return await lstat(absolute, { bigint: true });
  } catch (cause) {
    if (GONE.has(fsCode(cause) ?? '')) return null;
    throw cause;
  }
}

function identityOf(relPath: string, stats: BigIntStats): Omit<WalkEntry, 'kind'> {
  const slash = relPath.lastIndexOf('/');
  return {
    relPath,
    name: relPath.slice(slash + 1),
    parentRelPath: slash === -1 ? null : relPath.slice(0, slash),
    bytes: Number(stats.size),
    modifiedMs: Number(stats.mtimeMs),
    mtimeNs: stats.mtimeNs.toString(),
    mode: modeOf(stats),
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
  };
}

async function entryOf(
  relPath: string,
  absolute: string,
  stats: BigIntStats,
): Promise<WalkEntry | null> {
  const identity = identityOf(relPath, stats);
  if (stats.isDirectory()) return { ...identity, kind: 'folder', childCount: null };
  if (stats.isFile()) return { ...identity, kind: 'file', nlink: Number(stats.nlink) };
  if (stats.isSymbolicLink()) {
    const target = await readlink(absolute, { encoding: 'utf8' });
    return target === '' ? null : { ...identity, kind: 'link', target };
  }
  const special = specialOf(stats);
  return special === null
    ? null
    : { ...identity, kind: 'special', special, rdev: Number(stats.rdev) };
}

export type Outside = 'gone from disk' | 'not indexed' | 'identity' | 'mode' | 'content';

export interface OutsideChange {
  readonly relPath: string;
  readonly reason: Outside;
}

function drift(indexed: Indexed, entry: WalkEntry): Outside | null {
  if (!sameIdentity(indexed, entry)) return 'identity';
  if (modeDrifts(indexed.mode, entry)) return 'mode';
  return entry.kind === 'folder' || sameContent(indexed, entry) ? null : 'content';
}

async function onDisk(root: StoredDrive, relPath: string): Promise<WalkEntry | null> {
  const absolute = join(root.path, relPath);
  const stats = await statOf(absolute);
  return stats === null ? null : entryOf(relPath, absolute, stats);
}

function outsideAt(entry: WalkEntry | null, indexed: Indexed | undefined): Outside | null {
  if (entry === null) return indexed === undefined ? null : 'gone from disk';
  if (indexed === undefined) return 'not indexed';
  return drift(indexed, entry);
}

export async function outsideOf(
  reader: IndexReader,
  root: StoredDrive,
  relPaths: Iterable<string>,
): Promise<OutsideChange[]> {
  const checked: { readonly relPath: string; readonly entry: WalkEntry | null }[] = [];
  for (const relPath of relPaths) checked.push({ relPath, entry: await onDisk(root, relPath) });
  const indexed = await reader(
    root.id,
    checked.map((check) => check.relPath),
  );
  const known = new Map(indexed.map((found) => [found.relPath, found]));
  const found: OutsideChange[] = [];
  for (const { relPath, entry } of checked) {
    const reason = outsideAt(entry, known.get(relPath));
    if (reason !== null) found.push({ relPath, reason });
  }
  return found;
}
