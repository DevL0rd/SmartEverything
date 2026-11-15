import type { BigIntStats } from 'node:fs';
import { lstat, readdir, readlink, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { appendTo } from '@smarteverything/domain';
import { LINK_TARGET } from '@smarteverything/domain/drive-mount';
import {
  checkSyncPath,
  normalizeSyncPath,
  packHashes,
  packedToBytes,
  type IgnoreMatcher,
  type SyncPathRefusal,
  type SyncXattr,
} from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import { FileChangedWhileHashingError, type BlockHasher } from './blocks.js';
import type { FileInput, FileRecord } from './db/index.js';
import { linkKeyOf, mergedXattrs, sameXattrs, type MetaPort } from './meta-port.js';
import { folderInput, hubOf, linkInput, reusedInput } from './scan-inputs.js';

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
  | 'link_unsupported'
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
  readonly placementId: string;
  readonly rootPath: string;
  readonly previous: readonly FileRecord[];
  readonly ignore: IgnoreMatcher;
  readonly hasher: BlockHasher;
  readonly platform: NodeJS.Platform;
  readonly meta: MetaPort;
  readonly portablePaths: boolean;
  readonly mtimeToleranceNs: bigint;
  readonly quietMs: number;
  readonly now: () => number;
  readonly log: Logger;
}

export interface Found {
  readonly relPath: string;
  readonly diskPath: string;
  readonly kind: 'file' | 'folder' | 'link';
  readonly bytes: number;
  readonly mtimeNs: bigint;
  readonly mode: number;
  readonly linkTarget: string | null;
  readonly linkKey: string | null;
  readonly xattrs: readonly SyncXattr[];
}

const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_FOLDER_MODE = 0o755;

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

function modeOf(
  platform: NodeJS.Platform,
  mode: bigint,
  kind: Found['kind'],
  previous: FileRecord | undefined,
): number {
  if (platform !== 'win32') return Number(mode & 0o7777n);
  return previous?.mode ?? (kind === 'folder' ? DEFAULT_FOLDER_MODE : DEFAULT_FILE_MODE);
}

function mtimeMatches(previous: bigint, current: bigint, tolerance: bigint): boolean {
  const gap = previous > current ? previous - current : current - previous;
  return gap <= tolerance;
}

function metaUnchanged(previous: FileRecord, found: Found): boolean {
  return (
    previous.mode === found.mode &&
    sameXattrs(previous.xattrs, found.xattrs) &&
    previous.linkKey === found.linkKey &&
    !(previous.metaDirty && previous.hubRev !== null)
  );
}

function contentUnchanged(previous: FileRecord, found: Found, options: ScanOptions): boolean {
  return (
    previous.kind === 'file' &&
    previous.localHashState === 'hashed' &&
    previous.bytes === found.bytes &&
    mtimeMatches(previous.mtimeNs, found.mtimeNs, options.mtimeToleranceNs)
  );
}

function isUnchanged(
  previous: FileRecord | undefined,
  found: Found,
  options: ScanOptions,
): boolean {
  if (previous?.kind !== found.kind) return false;
  if (found.kind === 'link') {
    return (
      previous.linkTarget === found.linkTarget && !(previous.metaDirty && previous.hubRev !== null)
    );
  }
  if (!metaUnchanged(previous, found)) return false;
  return found.kind === 'folder' || contentUnchanged(previous, found, options);
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

  readonly #previous: ReadonlyMap<string, FileRecord>;

  constructor(private readonly options: ScanOptions) {
    this.#previous = new Map(options.previous.map((record) => [record.relPath, record]));
  }

  async run(): Promise<void> {
    await this.directory('', this.options.rootPath);
    await this.#readXattrs();
  }

  async #readXattrs(): Promise<void> {
    const { meta, platform } = this.options;
    const byFolder = new Map<string, Found[]>();
    for (const found of this.found) {
      if (found.kind !== 'link') appendTo(byFolder, dirname(found.diskPath), found);
    }
    const read = new Map<string, readonly SyncXattr[] | null>();
    for (const [, members] of byFolder) {
      const targets = members.map((found) => diskPathFor(platform, found.diskPath));
      for (const [path, xattrs] of await meta.xattrsOf(targets)) read.set(path, xattrs);
    }
    this.found.splice(
      0,
      this.found.length,
      ...this.found.map((found) => {
        if (found.kind === 'link') return found;
        const local = read.get(diskPathFor(platform, found.diskPath)) ?? null;
        const previous = this.#previous.get(found.relPath)?.xattrs ?? [];
        return { ...found, xattrs: local === null ? previous : mergedXattrs(local, previous) };
      }),
    );
  }

  private skip(relPath: string, reason: ScanSkipReason): null {
    this.skipped.push({ relPath, reason });
    if (reason !== 'vanished') this.seen.add(relPath);
    return null;
  }

  private async stat(relPath: string, diskPath: string): Promise<Found | null> {
    const { platform } = this.options;
    const previous = this.#previous.get(relPath);
    let info;
    try {
      info = await lstat(diskPathFor(platform, diskPath), { bigint: true });
    } catch (cause) {
      return this.skip(relPath, codeOf(cause) === 'ENOENT' ? 'vanished' : 'unreadable');
    }
    if (info.isSymbolicLink()) return this.symlink(relPath, diskPath, info);
    if (!info.isFile() && !info.isDirectory()) return this.skip(relPath, 'special');
    const kind = info.isDirectory() ? 'folder' : 'file';
    this.seen.add(relPath);
    return {
      relPath,
      diskPath,
      kind,
      bytes: kind === 'folder' ? 0 : Number(info.size),
      mtimeNs: info.mtimeNs,
      mode: modeOf(platform, info.mode, kind, previous),
      linkTarget: null,
      linkKey: linkKeyOf(platform, info),
      xattrs: [],
    };
  }

  private async symlink(
    relPath: string,
    diskPath: string,
    info: BigIntStats,
  ): Promise<Found | null> {
    const { platform } = this.options;
    if (platform === 'win32') return this.skip(relPath, 'symlink');
    let target: string;
    try {
      target = await readlink(diskPath);
    } catch (cause) {
      return this.skip(relPath, codeOf(cause) === 'ENOENT' ? 'vanished' : 'unreadable');
    }
    if (!LINK_TARGET.safeParse(target).success) return this.skip(relPath, 'unreadable');
    this.seen.add(relPath);
    return {
      relPath,
      diskPath,
      kind: 'link',
      bytes: 0,
      mtimeNs: info.mtimeNs,
      mode: Number(info.mode & 0o7777n),
      linkTarget: target,
      linkKey: null,
      xattrs: [],
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
    const { platform, placementId, log } = this.options;
    let listing;
    try {
      listing = await readdir(diskPathFor(platform, parentDisk), { withFileTypes: true });
    } catch (cause) {
      log.warn('drive.scan.unreadable', {
        root: placementId,
        path: parentRel,
        code: codeOf(cause),
      });
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
      placementId: options.placementId,
      relPath: found.relPath,
      kind: 'file',
      bytes: found.bytes,
      mtimeNs: found.mtimeNs,
      mode: found.mode,
      ...hubOf(found, previous),
      localHashState: 'hashed',
      blockSize,
      blocks: packedToBytes(packHashes(hashes)),
      linkTarget: null,
      linkKey: found.linkKey,
      xattrs: found.xattrs,
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
      upserts.push(folderInput(found, previous, options.placementId));
    } else if (found.kind === 'link') {
      upserts.push(linkInput(found, previous, options.placementId));
    } else if (previous !== undefined && contentUnchanged(previous, found, options)) {
      upserts.push(reusedInput(found, previous, options.placementId));
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
