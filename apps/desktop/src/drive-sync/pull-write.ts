import { link, lstat, mkdir, rename, rm, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import { messageOf } from '@smarteverything/logging';
import { inputOf, type DriveSyncDatabase, type FileRecord } from './db/index.js';
import { linkKeyOf, type MetaPort } from './meta-port.js';
import {
  hubMetaOf,
  momentsMatch,
  type FileEntry,
  type LinkEntry,
  type PullContention,
} from './pull-decide.js';
import { ENGINE_TEMP_SUFFIX, diskPathFor, type ScanSkip } from './scan.js';
import {
  ALL_META,
  FOLDER_META,
  LINK_META,
  applyHubMeta,
  hubXattrsOf,
  modeOf,
} from './meta-apply.js';
import { diskStateOf } from './transfer.js';
import type { PullChange } from './pull.js';

const LINK_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'EXDEV',
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EMLINK',
  'EACCES',
]);

export function codeOf(cause: unknown): string | undefined {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

export function tempNameOf(target: string): string {
  return join(dirname(target), `.${basename(target)}${ENGINE_TEMP_SUFFIX}`);
}

export interface EntryWriterSink {
  readonly pulled: (result: { readonly relPath: string; readonly change: PullChange }) => void;
  readonly contended: (result: {
    readonly relPath: string;
    readonly reason: PullContention;
  }) => void;
  readonly skipped: (skips: readonly ScanSkip[]) => void;
  readonly failed: (failure: { readonly relPath: string | null; readonly message: string }) => void;
}

export interface EntryWriterOptions {
  readonly placementId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly meta: MetaPort;
  readonly tolerance: () => bigint;
  readonly database: Pick<DriveSyncDatabase, 'files' | 'transaction'>;
  readonly sink: EntryWriterSink;
}

export class EntryWriter {
  readonly #options: EntryWriterOptions;

  constructor(options: EntryWriterOptions) {
    this.#options = options;
  }

  async folder(entry: SyncIndexEntry): Promise<void> {
    const { database, placementId, rootPath, platform } = this.#options;
    const disk = diskPathFor(platform, join(rootPath, ...entry.relPath.split('/')));
    await mkdir(disk, { recursive: true });
    const info = await lstat(disk, { bigint: true });
    database.files.upsert({
      placementId,
      relPath: entry.relPath,
      kind: 'folder',
      bytes: 0,
      mtimeNs: info.mtimeNs,
      mode: modeOf(platform, info.mode, entry.mode),
      hubRev: entry.rev,
      localHashState: 'hashed',
      blockSize: null,
      blocks: null,
      linkTarget: null,
      linkKey: null,
      hubInode: null,
      xattrs: [],
      metaDirty: false,
    });
    this.#options.sink.pulled({ relPath: entry.relPath, change: 'created' });
  }

  async folderMeta(entry: SyncIndexEntry): Promise<void> {
    const { database, placementId, rootPath, platform, meta, sink } = this.#options;
    const disk = diskPathFor(platform, join(rootPath, ...entry.relPath.split('/')));
    const local = database.files.get(placementId, entry.relPath);
    if (local === undefined) return;
    try {
      await applyHubMeta({ meta, platform, disk }, hubMetaOf(entry), FOLDER_META);
      const info = await lstat(disk, { bigint: true });
      database.files.upsert(
        inputOf(local, {
          mode: modeOf(platform, info.mode, entry.mode),
          mtimeNs: info.mtimeNs,
          xattrs: hubXattrsOf(entry.xattrs),
          hubRev: entry.rev,
          metaDirty: false,
        }),
      );
    } catch (cause) {
      sink.failed({ relPath: entry.relPath, message: messageOf(cause) });
    }
  }

  async fileMeta(entry: SyncIndexEntry, local: FileRecord | undefined): Promise<void> {
    const { database, rootPath, platform, meta, sink } = this.#options;
    if (local === undefined) return;
    const tolerance = this.#options.tolerance();
    const disk = diskPathFor(platform, join(rootPath, ...entry.relPath.split('/')));
    const state = await diskStateOf(disk, local);
    if (state !== 'same') {
      if (state === 'changed') sink.contended({ relPath: entry.relPath, reason: 'local_edit' });
      return;
    }
    try {
      const timed = !momentsMatch(local.mtimeNs, BigInt(entry.mtimeNs), tolerance);
      await applyHubMeta({ meta, platform, disk }, hubMetaOf(entry), { ...ALL_META, mtime: timed });
      const info = await lstat(disk, { bigint: true });
      database.files.upsert(
        inputOf(local, {
          mode: modeOf(platform, info.mode, entry.mode),
          mtimeNs: info.mtimeNs,
          xattrs: hubXattrsOf(entry.xattrs),
          linkKey: linkKeyOf(platform, info),
          hubRev: entry.rev,
          hubInode: entry.kind === 'folder' ? null : entry.inode,
          metaDirty: false,
        }),
      );
      sink.pulled({ relPath: entry.relPath, change: 'updated' });
    } catch (cause) {
      sink.failed({ relPath: entry.relPath, message: messageOf(cause) });
    }
  }

  async linkEntry(entry: LinkEntry, local: FileRecord | undefined): Promise<void> {
    const { database, placementId, rootPath, platform, meta, sink } = this.#options;
    const { relPath } = entry;
    if (platform === 'win32') {
      sink.skipped([{ relPath, reason: 'link_unsupported' }]);
      return;
    }
    const disk = diskPathFor(platform, join(rootPath, ...relPath.split('/')));
    const state = await diskStateOf(disk, local);
    if (local === undefined ? state !== 'absent' : state !== 'same') {
      sink.contended({ relPath, reason: local === undefined ? 'new_on_both' : 'local_edit' });
      return;
    }
    await mkdir(dirname(disk), { recursive: true });
    if (state === 'same') {
      const temp = tempNameOf(disk);
      await rm(temp, { force: true });
      await symlink(entry.target, temp);
      await rename(temp, disk);
    } else {
      await symlink(entry.target, disk);
    }
    await applyHubMeta({ meta, platform, disk }, hubMetaOf(entry), LINK_META);
    const info = await lstat(disk, { bigint: true });
    database.files.upsert({
      placementId,
      relPath,
      kind: 'link',
      bytes: 0,
      mtimeNs: info.mtimeNs,
      mode: Number(info.mode & 0o7777n),
      hubRev: entry.rev,
      localHashState: 'hashed',
      blockSize: null,
      blocks: null,
      linkTarget: entry.target,
      linkKey: null,
      hubInode: entry.inode,
      xattrs: [],
      metaDirty: false,
    });
    sink.pulled({ relPath, change: local === undefined ? 'created' : 'updated' });
  }

  private siblingOf(entry: FileEntry): FileRecord | undefined {
    const { database, placementId } = this.#options;
    if (entry.inode === null) return undefined;
    return database.files
      .byHubInode(placementId, entry.inode)
      .find(
        (record) =>
          record.relPath !== entry.relPath &&
          record.kind === 'file' &&
          record.localHashState === 'hashed' &&
          record.hubRev === entry.rev,
      );
  }

  async hardLink(entry: FileEntry, local: FileRecord | undefined): Promise<boolean> {
    const sibling = this.siblingOf(entry);
    return sibling !== undefined && (await this.#linkTo(entry, local, sibling));
  }

  async #linkTo(
    entry: FileEntry,
    local: FileRecord | undefined,
    sibling: FileRecord,
  ): Promise<boolean> {
    const { database, rootPath, platform, sink } = this.#options;
    const disk = (relPath: string): string =>
      diskPathFor(platform, join(rootPath, ...relPath.split('/')));
    const target = disk(entry.relPath);
    const state = await diskStateOf(target, local);
    if (local === undefined ? state !== 'absent' : state !== 'same') {
      sink.contended({
        relPath: entry.relPath,
        reason: local === undefined ? 'new_on_both' : 'local_edit',
      });
      return true;
    }
    if ((await diskStateOf(disk(sibling.relPath), sibling)) !== 'same') return false;
    const temp = tempNameOf(target);
    await mkdir(dirname(target), { recursive: true });
    await rm(temp, { force: true });
    try {
      await link(disk(sibling.relPath), temp);
    } catch (cause) {
      if (LINK_FALLBACK_CODES.has(codeOf(cause) ?? '')) return false;
      throw cause;
    }
    await rename(temp, target);
    const info = await lstat(target, { bigint: true });
    const key = linkKeyOf(platform, info);
    database.transaction(() => {
      database.files.upsert(inputOf(sibling, { linkKey: key }));
      database.files.upsert(
        inputOf(sibling, {
          relPath: entry.relPath,
          mtimeNs: info.mtimeNs,
          mode: modeOf(platform, info.mode, entry.mode),
          hubRev: entry.rev,
          hubInode: entry.inode,
          linkKey: key,
          metaDirty: false,
        }),
      );
    });
    sink.pulled({ relPath: entry.relPath, change: local === undefined ? 'created' : 'updated' });
    return true;
  }
}
