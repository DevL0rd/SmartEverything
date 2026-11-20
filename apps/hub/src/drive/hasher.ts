import { Worker } from 'node:worker_threads';
import type { DriveItem } from '@smarteverything/domain';
import { isFileItem, type FileItem } from './file-item';
import type { Logger } from '@smarteverything/logging';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { Store } from '../store/store';
import { HASH_RESPONSE, type BlockHashes, type HashRequest, type HashResponse } from './blocks';
import type { DriveJobHandlers } from './jobs';
import { readDriveSettings } from './settings';
import type { RootAvailability } from './root-marker';

type HashedResponse = Extract<HashResponse, { readonly kind: 'hashed' }>;

export interface HashEnvironment {
  readonly store: Pick<
    Store,
    | 'driveRoots'
    | 'driveItems'
    | 'driveBlocks'
    | 'drivePlacements'
    | 'driveOpens'
    | 'settingsKv'
    | 'feed'
    | 'write'
  >;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly log: Logger;
}

export interface HashCandidate {
  readonly id: string;
  readonly relPath: string;
  readonly bytes: number;
  readonly openedAt: string | null;
  readonly dev: string;
  readonly ino: string;
  readonly wantBlocks: boolean;
}

export interface HashBacklog {
  readonly candidates: readonly HashCandidate[];
  readonly files: number;
  readonly hashed: number;
}

export function byPriority(left: HashCandidate, right: HashCandidate): number {
  if (left.openedAt !== right.openedAt) {
    if (left.openedAt === null) return 1;
    if (right.openedAt === null) return -1;
    return left.openedAt < right.openedAt ? 1 : -1;
  }
  if (left.bytes !== right.bytes) return left.bytes - right.bytes;
  return left.relPath < right.relPath ? -1 : 1;
}

export function syncsBlocks(
  store: Pick<HashEnvironment['store'], 'drivePlacements'>,
  rootId: string,
): boolean {
  return store.drivePlacements.forRoot(rootId).some((placement) => placement.mode === 'synced');
}

export function collectBacklog(
  store: Pick<HashEnvironment['store'], 'driveItems' | 'drivePlacements' | 'driveOpens'>,
  root: StoredDrive,
): HashBacklog {
  const synced = syncsBlocks(store, root.id);
  const opened = store.driveOpens.latestInDrive(root.id);
  const { files, rows } = store.driveItems.lookups.hashBacklog(root.id, synced);
  const candidates = rows.map((row): HashCandidate => ({
    ...row,
    openedAt: opened.get(row.id) ?? null,
    wantBlocks: synced,
  }));
  return { candidates: candidates.sort(byPriority), files, hashed: files - candidates.length };
}

export function modifiedIso(modifiedMs: number): string {
  return new Date(modifiedMs).toISOString();
}

export class HashWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<
    number,
    { readonly resolve: (response: HashResponse) => void; readonly reject: (cause: Error) => void }
  >();
  private next = 0;
  private closed = false;
  private exited = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.on('message', (raw: unknown) => {
      this.answer(HASH_RESPONSE.parse(raw));
    });
    this.worker.on('error', (cause) => {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    });
    this.worker.on('exit', (code) => {
      this.exited = true;
      if (!this.closed) this.fail(new Error(`The hash worker stopped with code ${String(code)}.`));
    });
  }

  request(fields: Omit<HashRequest, 'id'>): Promise<HashResponse> {
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...fields, id });
    });
  }

  get alive(): boolean {
    return !this.exited;
  }

  unref(): void {
    this.worker.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fail(new Error('The hash worker was stopped.'));
    await this.worker.terminate();
  }

  private answer(response: HashResponse): void {
    const waiting = this.pending.get(response.id);
    this.pending.delete(response.id);
    waiting?.resolve(response);
  }

  private fail(cause: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(cause);
    this.pending.clear();
  }
}

export class FileHashSkippedError extends Error {
  override readonly name = 'FileHashSkippedError';

  constructor(
    readonly relPath: string,
    readonly reason: string,
  ) {
    super(`The file ${relPath} could not be hashed: ${reason}.`);
  }
}

export interface HashedFile {
  readonly rootPath: string;
  readonly relPath: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface ContentHash {
  readonly sha256: string;
  readonly blocks: BlockHashes | null;
}

export class ContentHasher {
  private worker: HashWorker | null = null;

  constructor(private readonly script: string) {}

  async hash(file: HashedFile, withBlocks: boolean): Promise<ContentHash> {
    const response = await this.started().request({
      rootPath: file.rootPath,
      relPath: file.relPath,
      dev: file.dev.toString(),
      ino: file.ino.toString(),
      withBlocks,
    });
    if (response.kind === 'skipped') throw new FileHashSkippedError(file.relPath, response.reason);
    return { sha256: response.sha256, blocks: response.blocks };
  }

  private started(): HashWorker {
    if (this.worker?.alive === true) return this.worker;
    const worker = new HashWorker(this.script);
    worker.unref();
    this.worker = worker;
    return worker;
  }
}

function shareOf(hashed: number, files: number): number {
  return files === 0 ? 1 : hashed / files;
}

class HashRun {
  private hashed: number;
  private reported: number;

  constructor(
    private readonly env: HashEnvironment,
    private readonly root: StoredDrive,
    private readonly backlog: HashBacklog,
  ) {
    this.hashed = backlog.hashed;
    this.reported = Math.floor(shareOf(this.hashed, backlog.files) * 100);
  }

  async run(signal: AbortSignal): Promise<void> {
    const worker = new HashWorker(this.env.workerScript);
    try {
      for (const candidate of this.backlog.candidates) {
        if (signal.aborted) return;
        const response = await worker.request({
          rootPath: this.root.path,
          relPath: candidate.relPath,
          dev: candidate.dev,
          ino: candidate.ino,
          withBlocks: candidate.wantBlocks,
        });
        this.settle(candidate, response);
      }
    } catch (cause) {
      if (!signal.aborted) throw cause;
    } finally {
      await worker.close();
    }
  }

  finish(): void {
    this.health(shareOf(this.hashed, this.backlog.files));
  }

  private settle(candidate: HashCandidate, response: HashResponse): void {
    if (response.kind === 'skipped') {
      this.env.log.warn('drive.hash_skipped', {
        rootId: this.root.id,
        relPath: candidate.relPath,
        reason: response.reason,
        code: response.code,
      });
      return;
    }
    if (!this.record(candidate, response)) return;
    this.hashed += 1;
    this.env.store.feed.notice({
      type: 'drive_progress',
      rootId: this.root.id,
      phase: 'hash',
      done: this.hashed,
      total: this.backlog.files,
    });
    const percent = Math.floor(shareOf(this.hashed, this.backlog.files) * 100);
    if (percent !== this.reported) {
      this.reported = percent;
      this.health(shareOf(this.hashed, this.backlog.files));
    }
  }

  private record(candidate: HashCandidate, response: HashedResponse): boolean {
    return this.env.store.write(() => {
      const current = this.env.store.driveItems.find(candidate.id, null);
      if (!this.stillValid(current, response)) return false;
      const written = this.hashItem(current, response.sha256);
      if (written === null) return false;
      if (response.blocks !== null && syncsBlocks(this.env.store, this.root.id)) {
        this.env.store.driveBlocks.put({
          itemId: written.id,
          rev: written.rev,
          blockSize: response.blocks.blockSize,
          hashes: response.blocks.hashes,
        });
        this.env.store.driveBlocks.removeBefore(written.id, written.rev);
      }
      return true;
    });
  }

  private stillValid(
    current: DriveItem | undefined,
    response: HashedResponse,
  ): current is FileItem {
    return (
      current !== undefined &&
      isFileItem(current) &&
      current.bytes === response.bytes &&
      current.modifiedAt === modifiedIso(response.modifiedMs)
    );
  }

  private hashItem(current: FileItem, sha256: string): DriveItem | null {
    if (current.sha256 === sha256) return current;
    if (current.sha256 !== null) {
      this.env.log.warn('drive.hash_changed_silently', {
        rootId: this.root.id,
        relPath: current.relPath,
      });
      return null;
    }
    const identity = this.env.store.driveItems.identityOf(current.id);
    if (identity === null) return null;
    return this.env.store.driveItems.write({ item: { ...current, sha256 }, identity }).item;
  }

  private health(share: number): void {
    const root = this.env.store.driveRoots.find(this.root.id);
    if (root === undefined) return;
    this.env.store.driveRoots.update(root.id, { health: { ...root.health, hashedShare: share } });
  }
}

function wanted(env: HashEnvironment, root: StoredDrive): boolean {
  const settings = readDriveSettings(env.store);
  if (settings.indexingPaused) {
    env.log.info('drive.hash_paused', { rootId: root.id });
    return false;
  }
  return syncsBlocks(env.store, root.id) || settings.duplicatesHashing;
}

async function hashRoot(env: HashEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
  const root = env.store.driveRoots.find(rootId);
  if (root === undefined) {
    env.log.warn('drive.hash_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  if (!wanted(env, root) || (await env.availability(root)) !== 'online') return;
  const backlog = collectBacklog(env.store, root);
  const run = new HashRun(env, root, backlog);
  const startedAt = performance.now();
  await run.run(signal);
  if (signal.aborted) return;
  run.finish();
  env.log.info('drive.hash_done', {
    rootId,
    files: backlog.files,
    hashedNow: backlog.candidates.length,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function hashHandler(env: HashEnvironment): DriveJobHandlers['hash'] {
  return (job, signal) => hashRoot(env, job.rootId, signal);
}
