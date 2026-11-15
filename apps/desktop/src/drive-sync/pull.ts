import { mkdir, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SyncHubMessage, SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import { inputOf, type DriveSyncDatabase, type FileRecord } from './db/index.js';
import type { MetaPort } from './meta-port.js';
import {
  decideLive,
  hubMetaOf,
  metaMatches,
  type Context,
  type FileEntry,
  type PullContention,
} from './pull-decide.js';
import { EntryWriter, codeOf, tempNameOf } from './pull-write.js';
import { decode } from './push-queue.js';
import { diskPathFor, type ScanSkip } from './scan.js';
import type { PlacementHello } from './socket.js';
import {
  DiskFullError,
  LocalBlockIndex,
  RemoteChangedError,
  abandonTransfer,
  diskStateOf,
  downloadFile,
  placeFile,
  type BlockSource,
  type LocalBlocks,
  type RemoteFile,
  type TransferProgress,
} from './transfer.js';

export type { PullContention };

export type PullChange = 'created' | 'updated' | 'deleted';

export interface PullProgress extends TransferProgress {
  readonly relPath: string;
}

export interface PullSink {
  readonly pulled: (result: { readonly relPath: string; readonly change: PullChange }) => void;
  readonly contended: (result: {
    readonly relPath: string;
    readonly reason: PullContention;
  }) => void;
  readonly deferred: (relPath: string) => void;
  readonly skipped: (skips: readonly ScanSkip[]) => void;
  readonly dirtied: () => void;
  readonly progress: (progress: PullProgress) => void;
  readonly blocked: (result: { readonly relPath: string; readonly reason: 'disk_full' }) => void;
  readonly failed: (failure: { readonly relPath: string | null; readonly message: string }) => void;
}

export type PullDatabase = Pick<
  DriveSyncDatabase,
  'files' | 'cursors' | 'transfers' | 'pendingOps' | 'transaction'
>;

export interface PlacementPullerOptions {
  readonly placementId: string;
  readonly driveId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly meta: MetaPort;
  readonly tolerance: () => bigint;
  readonly database: PullDatabase;
  readonly source: BlockSource;
  readonly wants: (relPath: string) => boolean;
  readonly sink: PullSink;
  readonly log: Logger;
}

interface FullIndex {
  readonly indexId: string;
  readonly seen: Set<string>;
}

class UnexpectedUpdateError extends Error {
  constructor() {
    super('The hub sent an index update before any index');
    this.name = 'UnexpectedUpdateError';
  }
}

function depthOf(entry: SyncIndexEntry): number {
  return entry.relPath.split('/').length;
}

function pendingPaths(database: PullDatabase): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const op of database.pendingOps.list()) {
    const decoded = decode(op);
    if (decoded.kind === 'move') {
      paths.add(decoded.payload.from);
      paths.add(decoded.payload.to);
    } else {
      paths.add(decoded.payload.relPath);
    }
  }
  return paths;
}

function remoteOf(driveId: string, entry: FileEntry): RemoteFile {
  return {
    driveId,
    itemId: entry.itemId,
    bytes: entry.bytes,
    blockSize: entry.blockSize,
    blocksHash: entry.blocksHash,
  };
}

export class PlacementPuller {
  readonly #options: PlacementPullerOptions;
  readonly #txn: string;
  #chain: Promise<void> = Promise.resolve();
  #halted = false;
  #full: FullIndex | null = null;
  #active: string | null = null;
  readonly #writer: EntryWriter;

  constructor(options: PlacementPullerOptions) {
    this.#options = options;
    this.#txn = `pull:${options.placementId}`;
    this.#writer = new EntryWriter(options);
  }

  hello(): PlacementHello {
    const cursor = this.#options.database.cursors.get(this.#options.placementId);
    return { indexId: cursor?.indexId ?? null, afterSeq: cursor?.lastSeq ?? 0 };
  }

  receive(message: SyncHubMessage): void {
    if (message.type !== 'index' && message.type !== 'index_update') return;
    this.#chain = this.#chain.then(() => this.#handle(message));
  }

  reopened(): void {
    this.#halted = false;
    this.#full = null;
  }

  settled(): Promise<void> {
    return this.#chain;
  }

  async #handle(
    message: Extract<SyncHubMessage, { type: 'index' | 'index_update' }>,
  ): Promise<void> {
    if (this.#halted) {
      this.#options.log.debug('drive_sync.pull.halted_skip', {
        placementId: this.#options.placementId,
      });
      return;
    }
    this.#active = null;
    try {
      if (message.type === 'index') await this.#onIndex(message);
      else await this.#onUpdate(message);
    } catch (cause) {
      this.#halt(cause);
    }
  }

  #halt(cause: unknown): void {
    const { sink, log, placementId } = this.#options;
    this.#halted = true;
    this.#full = null;
    if (cause instanceof DiskFullError) {
      log.warn('drive_sync.pull.disk_full', { placementId, relPath: cause.relPath });
      sink.blocked({ relPath: cause.relPath, reason: 'disk_full' });
      return;
    }
    log.warn('drive_sync.pull.failed', {
      placementId,
      relPath: this.#active,
      error: messageOf(cause),
    });
    sink.failed({ relPath: this.#active, message: messageOf(cause) });
  }

  async #onIndex(message: Extract<SyncHubMessage, { type: 'index' }>): Promise<void> {
    const { database, placementId } = this.#options;
    if (this.#full?.indexId !== message.indexId) {
      this.#full = { indexId: message.indexId, seen: new Set() };
    }
    const { seen } = this.#full;
    await this.#apply(message.entries);
    for (const entry of message.entries) seen.add(entry.relPath);
    if (!message.last) return;
    database.transaction(() => {
      this.#forgetUnseen(seen);
      database.cursors.set({ placementId, indexId: message.indexId, lastSeq: message.seq });
    });
    this.#full = null;
  }

  async #onUpdate(message: Extract<SyncHubMessage, { type: 'index_update' }>): Promise<void> {
    const { database, placementId } = this.#options;
    const cursor = database.cursors.get(placementId);
    if (cursor === undefined) throw new UnexpectedUpdateError();
    await this.#apply(message.entries);
    database.cursors.set({ placementId, indexId: cursor.indexId, lastSeq: message.seq });
  }

  #forgetUnseen(seen: ReadonlySet<string>): void {
    const { database, placementId } = this.#options;
    for (const record of database.files.list(placementId)) {
      if (record.hubRev !== null && !seen.has(record.relPath)) {
        database.files.upsert(inputOf(record, { hubRev: null }));
      }
    }
  }

  #context(): Context {
    const { database, placementId, rootPath, platform, log } = this.#options;
    let index: LocalBlockIndex | null = null;
    return {
      pending: pendingPaths(database),
      tolerance: this.#options.tolerance(),
      blocks: (): LocalBlocks => {
        index ??= new LocalBlockIndex({
          records: database.files.list(placementId),
          rootPath,
          platform,
          log,
        });
        return index;
      },
    };
  }

  async #apply(entries: readonly SyncIndexEntry[]): Promise<void> {
    const latest = [...new Map(entries.map((entry) => [entry.relPath, entry])).values()];
    const context = this.#context();
    const gone = latest.filter((entry) => entry.deleted);
    for (const entry of gone.sort((first, second) => depthOf(second) - depthOf(first))) {
      this.#active = entry.relPath;
      await this.#remove(entry.relPath, context);
    }
    const live = latest.filter((entry) => !entry.deleted);
    const folders: SyncIndexEntry[] = [];
    for (const entry of live.sort((first, second) => depthOf(first) - depthOf(second))) {
      this.#active = entry.relPath;
      await this.#live(entry, context, folders);
    }
    for (const entry of folders.sort((first, second) => depthOf(second) - depthOf(first))) {
      this.#active = entry.relPath;
      await this.#writer.folderMeta(entry);
    }
  }

  async #live(entry: SyncIndexEntry, context: Context, folders: SyncIndexEntry[]): Promise<void> {
    const { database, placementId, sink, wants } = this.#options;
    const local = database.files.get(placementId, entry.relPath);
    const decision = decideLive(local, entry, context);
    if (decision.action === 'have' || decision.action === 'adopt') {
      this.#settledRev(entry, local, decision.action, context);
    } else if (decision.action === 'contended') {
      sink.contended({ relPath: entry.relPath, reason: decision.reason });
    } else if (entry.kind === 'folder') {
      folders.push(entry);
      if (local === undefined) await this.#writer.folder(entry);
    } else if (decision.action === 'meta') {
      await this.#writer.fileMeta(entry, local);
    } else if (entry.kind === 'link') {
      await this.#writer.linkEntry(entry, local);
    } else if (wants(entry.relPath)) {
      await this.#file(entry, local, context);
    } else {
      sink.deferred(entry.relPath);
    }
  }

  #settledRev(
    entry: SyncIndexEntry,
    local: FileRecord | undefined,
    action: 'have' | 'adopt',
    context: Context,
  ): void {
    const { database, placementId, sink } = this.#options;
    if (local === undefined) return;
    if (action === 'adopt') database.files.setHubRev(placementId, entry.relPath, entry.rev);
    const inode = entry.kind === 'folder' ? null : entry.inode;
    if (inode !== local.hubInode) database.files.setHubInode(placementId, entry.relPath, inode);
    const unpushed =
      local.metaDirty &&
      local.localHashState === 'hashed' &&
      !context.pending.has(entry.relPath) &&
      !metaMatches(local, entry, context.tolerance);
    if (unpushed) sink.dirtied();
  }

  async #file(entry: FileEntry, local: FileRecord | undefined, context: Context): Promise<void> {
    if (await this.#writer.hardLink(entry, local)) return;
    await this.#fetch(entry, local, context);
  }

  async #fetch(entry: FileEntry, local: FileRecord | undefined, context: Context): Promise<void> {
    const { placementId, driveId, rootPath, platform, database, source, sink } = this.#options;
    const { relPath } = entry;
    const target = diskPathFor(platform, join(rootPath, ...relPath.split('/')));
    const tempPath = tempNameOf(target);
    const remote = remoteOf(driveId, entry);
    await mkdir(dirname(target), { recursive: true });
    try {
      const blocks = await downloadFile({
        relPath,
        txn: this.#txn,
        remote,
        tempPath,
        database,
        source,
        local: context.blocks(),
        progress: (progress) => {
          sink.progress({ relPath, ...progress });
        },
      });
      await this.#place(entry, local, target, blocks);
    } catch (cause) {
      if (!(cause instanceof RemoteChangedError)) throw cause;
      this.#options.log.info('drive_sync.pull.superseded', { placementId, relPath });
      await abandonTransfer(database, this.#txn, entry.itemId, tempPath);
    }
  }

  async #place(
    entry: FileEntry,
    local: FileRecord | undefined,
    target: string,
    blocks: Uint8Array,
  ): Promise<void> {
    const { database, placementId, driveId, platform, sink } = this.#options;
    const placement = await placeFile({
      database,
      placementId,
      txn: this.#txn,
      remote: remoteOf(driveId, entry),
      relPath: entry.relPath,
      platform,
      meta: this.#options.meta,
      hub: hubMetaOf(entry),
      rev: entry.rev,
      local,
      target,
      tempPath: tempNameOf(target),
      blocks,
    });
    if (placement === 'placed') {
      sink.pulled({ relPath: entry.relPath, change: local === undefined ? 'created' : 'updated' });
    } else {
      sink.contended({ relPath: entry.relPath, reason: placement });
    }
  }

  async #remove(relPath: string, context: Context): Promise<void> {
    const { database, placementId, sink } = this.#options;
    const local = database.files.get(placementId, relPath);
    if (local === undefined) return;
    if (local.hubRev === null) return;
    const doomed =
      local.kind === 'folder'
        ? database.files
            .list(placementId)
            .filter((record) => record.relPath.startsWith(`${relPath}/`))
            .sort((first, second) => second.relPath.length - first.relPath.length)
        : [];
    for (const record of [...doomed, local]) {
      const reason = await this.#erase(record, context);
      if (reason !== null) {
        sink.contended({ relPath: record.relPath, reason });
        return;
      }
    }
    sink.pulled({ relPath, change: 'deleted' });
  }

  async #erase(record: FileRecord, context: Context): Promise<PullContention | null> {
    const { database, placementId, rootPath, platform } = this.#options;
    if (record.hubRev === null || record.localHashState !== 'hashed') return 'local_edit';
    if (context.pending.has(record.relPath)) return 'local_edit';
    const disk = diskPathFor(platform, join(rootPath, ...record.relPath.split('/')));
    if (record.kind !== 'folder') {
      if ((await diskStateOf(disk, record)) === 'changed') return 'local_edit';
      await rm(disk, { force: true });
    } else {
      try {
        await rmdir(disk);
      } catch (cause) {
        if (codeOf(cause) === 'ENOTEMPTY') return 'not_empty';
        if (codeOf(cause) !== 'ENOENT') throw cause;
      }
    }
    database.files.remove(placementId, record.relPath);
    return null;
  }
}
