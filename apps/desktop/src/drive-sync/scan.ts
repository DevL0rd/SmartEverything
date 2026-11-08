import { lstat, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkSyncPath,
  normalizeSyncPath,
  packHashes,
  packedToBytes,
  type IgnoreMatcher,
  type SyncPathRefusal,
} from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import { FileChangedWhileHashingError, type BlockHasher } from './blocks.js';
import type { FileInput, FileRecord } from './db/index.js';

export const ENGINE_TEMP_SUFFIX = '.sync-tmp';

const FAT_FILESYSTEMS = new Set([0x4d44, 0x2011bab0]);
const FAT_MTIME_TOLERANCE_NS = 2_000_000_000n;
const NS_PER_MS = 1_000_000n;
const LONG_PATH_LIMIT = 248;

export type ScanSkipReason =
  | SyncPathRefusal
  | 'recently_modified'
  | 'changed_during_hash'
  | 'symlink'
  | 'special'
  | 'duplicate_name'
  | 'unreadable'
  | 'vanished';

export interface ScanSkip {
  readonly relPath: string;
  readonly reason: ScanSkipReason;
}

export interface ScanResult {
  readonly upserts: readonly FileInput[];
  readonly removed: readonly string[];
  readonly unchanged: number;
  readonly skipped: readonly ScanSkip[];
}

export interface ScanOptions {
  readonly rootId: string;
  readonly rootPath: string;
  readonly previous: readonly FileRecord[];
  readonly ignore: IgnoreMatcher;
  readonly hasher: BlockHasher;
  readonly platform: NodeJS.Platform;
  readonly portablePaths: boolean;
  readonly mtimeToleranceNs: bigint;
  readonly quietMs: number;
  readonly now: () => number;
  readonly log: Logger;
}

interface Found {
  readonly relPath: string;
  readonly diskPath: string;
  readonly kind: 'file' | 'folder';
  readonly bytes: number;
  readonly mtimeNs: bigint;
  readonly mode: number;
}

export function isEngineTempName(name: string): boolean {
  return (
    name.length > ENGINE_TEMP_SUFFIX.length + 1 &&
    name.startsWith('.') &&
    name.endsWith(ENGINE_TEMP_SUFFIX)
  );
}

export async function volumeMtimeToleranceNs(path: string): Promise<bigint> {
  const info = await statfs(path);
  return FAT_FILESYSTEMS.has(info.type) ? FAT_MTIME_TOLERANCE_NS : 0n;
}

export function diskPathFor(platform: NodeJS.Platform, full: string): string {
  if (platform !== 'win32' || full.length < LONG_PATH_LIMIT || full.startsWith('\\\\?\\')) {
    return full;
  }
  return full.startsWith('\\\\') ? `\\\\?\\UNC\\${full.slice(2)}` : `\\\\?\\${full}`;
}

function modeOf(platform: NodeJS.Platform, mode: bigint): number {
  return platform === 'win32' ? 0 : Number(mode & 0o777n);
}

function mtimeMatches(previous: bigint, current: bigint, tolerance: bigint): boolean {
  const gap = previous > current ? previous - current : current - previous;
  return gap <= tolerance;
}

function isUnchanged(
  previous: FileRecord | undefined,
  found: Found,
  options: ScanOptions,
): boolean {
  if (previous?.kind !== found.kind || previous.mode !== found.mode) return false;
  if (found.kind === 'folder') return true;
  return (
    previous.localHashState === 'hashed' &&
    previous.bytes === found.bytes &&
    mtimeMatches(previous.mtimeNs, found.mtimeNs, options.mtimeToleranceNs)
  );
}

function folderInput(found: Found, previous: FileRecord | undefined, rootId: string): FileInput {
  return {
    rootId,
    relPath: found.relPath,
    kind: 'folder',
    bytes: 0,
    mtimeNs: found.mtimeNs,
    mode: found.mode,
    hubRev: previous?.hubRev ?? null,
    localHashState: 'hashed',
    blockSize: null,
    blocks: null,
  };
}

function codeOf(cause: unknown): string | undefined {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

class TreeWalk {
  readonly found: Found[] = [];
  readonly skipped: ScanSkip[] = [];
  readonly seen = new Set<string>();
  readonly unreadable: string[] = [];

  constructor(private readonly options: ScanOptions) {}

  async run(): Promise<void> {
    await this.directory('', this.options.rootPath);
  }

  private skip(relPath: string, reason: ScanSkipReason): null {
    this.skipped.push({ relPath, reason });
    if (reason !== 'vanished') this.seen.add(relPath);
    return null;
  }

  private async stat(relPath: string, diskPath: string): Promise<Found | null> {
    const { platform } = this.options;
    let info;
    try {
      info = await lstat(diskPathFor(platform, diskPath), { bigint: true });
    } catch (cause) {
      return this.skip(relPath, codeOf(cause) === 'ENOENT' ? 'vanished' : 'unreadable');
    }
    if (info.isSymbolicLink()) return this.skip(relPath, 'symlink');
    if (!info.isFile() && !info.isDirectory()) return this.skip(relPath, 'special');
    this.seen.add(relPath);
    return {
      relPath,
      diskPath,
      kind: info.isDirectory() ? 'folder' : 'file',
      bytes: info.isDirectory() ? 0 : Number(info.size),
      mtimeNs: info.mtimeNs,
      mode: modeOf(platform, info.mode),
    };
  }

  private async classify(
    name: string,
    parentRel: string,
    parentDisk: string,
  ): Promise<Found | null> {
    const normal = normalizeSyncPath(name);
    const relPath = parentRel === '' ? normal : `${parentRel}/${normal}`;
    if (isEngineTempName(name) || this.options.ignore.isIgnored(relPath)) return null;
    if (this.seen.has(relPath)) return this.skip(relPath, 'duplicate_name');
    const refusal = checkSyncPath(relPath, { portable: this.options.portablePaths });
    if (!refusal.ok) return this.skip(relPath, refusal.refusal);
    return this.stat(relPath, join(parentDisk, name));
  }

  private async directory(parentRel: string, parentDisk: string): Promise<void> {
    const { platform, rootId, log } = this.options;
    let listing;
    try {
      listing = await readdir(diskPathFor(platform, parentDisk), { withFileTypes: true });
    } catch (cause) {
      log.warn('drive.scan.unreadable', { root: rootId, path: parentRel, code: codeOf(cause) });
      this.unreadable.push(parentRel);
      return;
    }
    for (const entry of listing) {
      const found = await this.classify(entry.name, parentRel, parentDisk);
      if (found === null) continue;
      this.found.push(found);
      if (found.kind === 'folder') await this.directory(found.relPath, found.diskPath);
    }
  }
}

function underAny(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => root === '' || path === root || path.startsWith(`${root}/`));
}

function isWriting(found: Found, options: ScanOptions): boolean {
  const modifiedAt = Number(found.mtimeNs / NS_PER_MS);
  return options.now() - modifiedAt < options.quietMs;
}

async function hashed(
  found: Found,
  previous: FileRecord | undefined,
  options: ScanOptions,
): Promise<FileInput | 'changed_during_hash' | 'vanished'> {
  const target = diskPathFor(options.platform, found.diskPath);
  try {
    const { blockSize, hashes } = await options.hasher.hash(target, found.bytes);
    const after = await lstat(target, { bigint: true });
    if (after.mtimeNs !== found.mtimeNs || Number(after.size) !== found.bytes) {
      return 'changed_during_hash';
    }
    return {
      rootId: options.rootId,
      relPath: found.relPath,
      kind: 'file',
      bytes: found.bytes,
      mtimeNs: found.mtimeNs,
      mode: found.mode,
      hubRev: previous?.hubRev ?? null,
      localHashState: 'hashed',
      blockSize,
      blocks: packedToBytes(packHashes(hashes)),
    };
  } catch (cause) {
    if (cause instanceof FileChangedWhileHashingError) return 'changed_during_hash';
    if (codeOf(cause) === 'ENOENT') return 'vanished';
    throw cause;
  }
}

export async function scanRoot(options: ScanOptions): Promise<ScanResult> {
  const walk = new TreeWalk(options);
  await walk.run();
  const before = new Map(options.previous.map((record) => [record.relPath, record]));
  const upserts: FileInput[] = [];
  const skipped = [...walk.skipped];
  let unchanged = 0;
  for (const found of walk.found) {
    const previous = before.get(found.relPath);
    if (isUnchanged(previous, found, options)) {
      unchanged += 1;
    } else if (found.kind === 'folder') {
      upserts.push(folderInput(found, previous, options.rootId));
    } else if (isWriting(found, options)) {
      skipped.push({ relPath: found.relPath, reason: 'recently_modified' });
    } else {
      const result = await hashed(found, previous, options);
      if (typeof result !== 'string') {
        upserts.push(result);
      } else {
        if (result === 'vanished') walk.seen.delete(found.relPath);
        skipped.push({ relPath: found.relPath, reason: result });
      }
    }
  }
  const removed = options.previous
    .map((record) => record.relPath)
    .filter((path) => !walk.seen.has(path) && !underAny(path, walk.unreadable));
  return { upserts, removed, unchanged, skipped };
}
