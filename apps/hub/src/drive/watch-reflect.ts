import type { BigIntStats } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fsCode } from '../fs-code';
import type { DriveInodesRepository } from '../store/repositories/drive-inodes';
import type { DriveItemsRepository } from '../store/repositories/drive-items';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { indexedOf, modeDrifts, sameContent, sameIdentity, type Indexed } from './scanner-index';
import { modeOf, specialOf, type WalkEntry } from './scanner-walk';

export interface IndexReader {
  readonly items: Pick<DriveItemsRepository, 'byPath' | 'identityOf'>;
  readonly inodes: Pick<DriveInodesRepository, 'ofItem'>;
}

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

function indexedAt(reader: IndexReader, root: StoredDrive, relPath: string): Indexed | null {
  const item = reader.items.byPath(root.id, relPath, null);
  if (item === undefined) return null;
  const inode = reader.inodes.ofItem(item.id);
  if (inode === undefined) {
    throw new Error(`The indexed item at ${relPath} has no inode row.`);
  }
  return indexedOf({ item, identity: reader.items.identityOf(item.id), inodeId: inode.id }, inode);
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

async function outsideAt(
  reader: IndexReader,
  root: StoredDrive,
  relPath: string,
): Promise<Outside | null> {
  const absolute = join(root.path, relPath);
  const stats = await statOf(absolute);
  const entry = stats === null ? null : await entryOf(relPath, absolute, stats);
  const indexed = indexedAt(reader, root, relPath);
  if (entry === null) return indexed === null ? null : 'gone from disk';
  if (indexed === null) return 'not indexed';
  return drift(indexed, entry);
}

export async function firstOutside(
  reader: IndexReader,
  root: StoredDrive,
  relPaths: Iterable<string>,
): Promise<OutsideChange | null> {
  for (const relPath of relPaths) {
    const reason = await outsideAt(reader, root, relPath);
    if (reason !== null) return { relPath, reason };
  }
  return null;
}
