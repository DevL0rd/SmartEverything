import { createHash } from 'node:crypto';
import { lstat, mkdir, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { SyncHubMessage, SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase, FileInput, FileRecord } from './db/index.js';
import { decode } from './push-queue.js';
import { ENGINE_TEMP_SUFFIX, diskPathFor } from './scan.js';
import type { RootHello } from './socket.js';
import {
  DiskFullError,
  LocalBlockIndex,
  RemoteChangedError,
  abandonTransfer,
  diskStateOf,
  downloadFile,
  modeOf,
  placeFile,
  type BlockSource,
  type LocalBlocks,
  type RemoteFile,
  type TransferProgress,
} from './transfer.js';

type FileEntry = Extract<SyncIndexEntry, { readonly kind: 'file' }>;

export type PullContention = 'local_edit' | 'kind_changed' | 'new_on_both' | 'not_empty';

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
  readonly progress: (progress: PullProgress) => void;
  readonly blocked: (result: { readonly relPath: string; readonly reason: 'disk_full' }) => void;
  readonly failed: (failure: { readonly relPath: string | null; readonly message: string }) => void;
}

export type PullDatabase = Pick<
  DriveSyncDatabase,
  'files' | 'cursors' | 'transfers' | 'pendingOps' | 'transaction'
>;

export interface RootPullerOptions {
  readonly rootId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly database: PullDatabase;
  readonly source: BlockSource;
  readonly wants: (relPath: string) => boolean;
  readonly sink: PullSink;
  readonly log: Logger;
}

type Decision =
  | { readonly action: 'have' | 'adopt' | 'fetch' }
  | { readonly action: 'contended'; readonly reason: PullContention };

interface Context {
  readonly pending: ReadonlySet<string>;
  readonly blocks: () => LocalBlocks;
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

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function codeOf(cause: unknown): string | undefined {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

function depthOf(entry: SyncIndexEntry): number {
  return entry.relPath.split('/').length;
}

function inputOf(record: FileRecord, hubRev: number | null): FileInput {
  return {
    rootId: record.rootId,
    relPath: record.relPath,
    kind: record.kind,
    bytes: record.bytes,
    mtimeNs: record.mtimeNs,
    mode: record.mode,
    hubRev,
    localHashState: record.localHashState,
    blockSize: record.blockSize,
    blocks: record.blocks,
  };
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

function sameContent(local: FileRecord, entry: FileEntry): boolean {
  return (
    local.bytes === entry.bytes &&
    local.blocks !== null &&
    sha256Of(local.blocks) === entry.blocksHash
  );
}

function decideFile(local: FileRecord, entry: FileEntry, pending: ReadonlySet<string>): Decision {
  if (local.hubRev === entry.rev) return { action: 'have' };
  if (sameContent(local, entry)) return { action: 'adopt' };
  if (local.hubRev === null) return { action: 'contended', reason: 'new_on_both' };
  if (local.localHashState !== 'hashed' || pending.has(entry.relPath)) {
    return { action: 'contended', reason: 'local_edit' };
  }
  return { action: 'fetch' };
}

function decideLive(
  local: FileRecord | undefined,
  entry: SyncIndexEntry,
  pending: ReadonlySet<string>,
): Decision {
  if (local === undefined) return { action: 'fetch' };
  if (local.kind !== entry.kind) return { action: 'contended', reason: 'kind_changed' };
  if (entry.kind === 'folder') return { action: local.hubRev === entry.rev ? 'have' : 'adopt' };
  return decideFile(local, entry, pending);
}

function remoteOf(rootId: string, entry: FileEntry): RemoteFile {
  return {
    rootId,
    itemId: entry.itemId,
    bytes: entry.bytes,
    blockSize: entry.blockSize,
    blocksHash: entry.blocksHash,
  };
}

function tempNameOf(target: string): string {
  return join(dirname(target), `.${basename(target)}${ENGINE_TEMP_SUFFIX}`);
}

export class RootPuller {
  readonly #options: RootPullerOptions;
  readonly #txn: string;
  #chain: Promise<void> = Promise.resolve();
  #halted = false;
  #full: FullIndex | null = null;
  #active: string | null = null;

  constructor(options: RootPullerOptions) {
    this.#options = options;
    this.#txn = `pull:${options.rootId}`;
  }

  hello(): RootHello {
    const cursor = this.#options.database.cursors.get(this.#options.rootId);
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
      this.#options.log.debug('drive_sync.pull.halted_skip', { rootId: this.#options.rootId });
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
    const { sink, log, rootId } = this.#options;
    this.#halted = true;
    this.#full = null;
    if (cause instanceof DiskFullError) {
      log.warn('drive_sync.pull.disk_full', { rootId, relPath: cause.relPath });
      sink.blocked({ relPath: cause.relPath, reason: 'disk_full' });
      return;
    }
    log.warn('drive_sync.pull.failed', {
      rootId,
      relPath: this.#active,
      error: messageOf(cause),
    });
    sink.failed({ relPath: this.#active, message: messageOf(cause) });
  }

  async #onIndex(message: Extract<SyncHubMessage, { type: 'index' }>): Promise<void> {
    const { database, rootId } = this.#options;
    if (this.#full?.indexId !== message.indexId) {
      this.#full = { indexId: message.indexId, seen: new Set() };
    }
    const { seen } = this.#full;
    await this.#apply(message.entries);
    for (const entry of message.entries) seen.add(entry.relPath);
    if (!message.last) return;
    database.transaction(() => {
      this.#forgetUnseen(seen);
      database.cursors.set({ rootId, indexId: message.indexId, lastSeq: message.seq });
    });
    this.#full = null;
  }

  async #onUpdate(message: Extract<SyncHubMessage, { type: 'index_update' }>): Promise<void> {
    const { database, rootId } = this.#options;
    const cursor = database.cursors.get(rootId);
    if (cursor === undefined) throw new UnexpectedUpdateError();
    await this.#apply(message.entries);
    database.cursors.set({ rootId, indexId: cursor.indexId, lastSeq: message.seq });
  }

  #forgetUnseen(seen: ReadonlySet<string>): void {
    const { database, rootId } = this.#options;
    for (const record of database.files.list(rootId)) {
      if (record.hubRev !== null && !seen.has(record.relPath)) {
        database.files.upsert(inputOf(record, null));
      }
    }
  }

  #context(): Context {
    const { database, rootId, rootPath, platform, log } = this.#options;
    let index: LocalBlockIndex | null = null;
    return {
      pending: pendingPaths(database),
      blocks: (): LocalBlocks => {
        index ??= new LocalBlockIndex({
          records: database.files.list(rootId),
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
    for (const entry of live.sort((first, second) => depthOf(first) - depthOf(second))) {
      this.#active = entry.relPath;
      await this.#live(entry, context);
    }
  }

  async #live(entry: SyncIndexEntry, context: Context): Promise<void> {
    const { database, rootId, sink, wants } = this.#options;
    const local = database.files.get(rootId, entry.relPath);
    const decision = decideLive(local, entry, context.pending);
    if (decision.action === 'have') return;
    if (decision.action === 'contended') {
      sink.contended({ relPath: entry.relPath, reason: decision.reason });
    } else if (decision.action === 'adopt') {
      database.files.setHubRev(rootId, entry.relPath, entry.rev);
    } else if (entry.kind === 'folder') {
      await this.#folder(entry);
    } else if (wants(entry.relPath)) {
      await this.#fetch(entry, local, context);
    } else {
      sink.deferred(entry.relPath);
    }
  }

  async #folder(entry: SyncIndexEntry): Promise<void> {
    const { database, rootId, rootPath, platform } = this.#options;
    const disk = diskPathFor(platform, join(rootPath, ...entry.relPath.split('/')));
    await mkdir(disk, { recursive: true });
    const info = await lstat(disk, { bigint: true });
    database.files.upsert({
      rootId,
      relPath: entry.relPath,
      kind: 'folder',
      bytes: 0,
      mtimeNs: info.mtimeNs,
      mode: modeOf(platform, info.mode),
      hubRev: entry.rev,
      localHashState: 'hashed',
      blockSize: null,
      blocks: null,
    });
    this.#options.sink.pulled({ relPath: entry.relPath, change: 'created' });
  }

  async #fetch(entry: FileEntry, local: FileRecord | undefined, context: Context): Promise<void> {
    const { rootId, rootPath, platform, database, source, sink } = this.#options;
    const { relPath } = entry;
    const target = diskPathFor(platform, join(rootPath, ...relPath.split('/')));
    const tempPath = tempNameOf(target);
    const remote = remoteOf(rootId, entry);
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
      this.#options.log.info('drive_sync.pull.superseded', { rootId, relPath });
      await abandonTransfer(database, this.#txn, entry.itemId, tempPath);
    }
  }

  async #place(
    entry: FileEntry,
    local: FileRecord | undefined,
    target: string,
    blocks: Uint8Array,
  ): Promise<void> {
    const { database, rootId, platform, sink } = this.#options;
    const placement = await placeFile({
      database,
      txn: this.#txn,
      remote: remoteOf(rootId, entry),
      relPath: entry.relPath,
      platform,
      mtime: entry.mtime,
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
    const { database, rootId, sink } = this.#options;
    const local = database.files.get(rootId, relPath);
    if (local === undefined) return;
    if (local.hubRev === null) return;
    const doomed =
      local.kind === 'folder'
        ? database.files
            .list(rootId)
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
    const { database, rootId, rootPath, platform } = this.#options;
    if (record.hubRev === null || record.localHashState !== 'hashed') return 'local_edit';
    if (context.pending.has(record.relPath)) return 'local_edit';
    const disk = diskPathFor(platform, join(rootPath, ...record.relPath.split('/')));
    if (record.kind === 'file') {
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
    database.files.remove(rootId, record.relPath);
    return null;
  }
}
