import { Worker } from 'node:worker_threads';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { DriveItemEntry } from '../store/repositories/drive-items';
import { HASH_RESPONSE, type HashRequest, type HashResponse } from './blocks';
import type { DriveJobHandlers } from './jobs';
import { readDriveSettings } from './settings';
import type { RootAvailability } from './volumes';

const WINDOW_ROWS = 1000;

type HashedResponse = Extract<HashResponse, { readonly kind: 'hashed' }>;

export interface HashEnvironment {
  readonly store: Pick<
    Store,
    'driveRoots' | 'driveItems' | 'driveBlocks' | 'settingsKv' | 'feed' | 'write'
  >;
  readonly availability: (root: DriveRoot) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly log: Logger;
}

type PhysicalRoot = DriveRoot & { readonly path: string };

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

function candidateOf(
  entry: DriveItemEntry,
  needed: boolean,
  wantBlocks: boolean,
): HashCandidate | null {
  const { item, identity } = entry;
  if (item.kind === 'folder' || identity === null || !needed) return null;
  return {
    id: item.id,
    relPath: item.relPath,
    bytes: item.bytes,
    openedAt: item.openedAt,
    dev: identity.dev,
    ino: identity.ino,
    wantBlocks,
  };
}

export function collectBacklog(
  store: Pick<HashEnvironment['store'], 'driveItems' | 'driveBlocks'>,
  root: DriveRoot,
): HashBacklog {
  const candidates: HashCandidate[] = [];
  let files = 0;
  let hashed = 0;
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = store.driveItems.children(root.id, parent, after, WINDOW_ROWS);
      for (const entry of window.entries) {
        if (entry.item.kind === 'folder') {
          pending.push(entry.item.id);
          continue;
        }
        files += 1;
        const hasBlocks =
          !root.synced || store.driveBlocks.find(entry.item.id, entry.item.rev) !== undefined;
        const found = candidateOf(entry, entry.item.sha256 === null || !hasBlocks, root.synced);
        if (found === null) hashed += 1;
        else candidates.push(found);
      }
      after = window.next;
    } while (after !== null);
  }
  return { candidates: candidates.sort(byPriority), files, hashed };
}

export function modifiedIso(modifiedMs: number): string {
  return new Date(modifiedMs).toISOString();
}

class HashWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<
    number,
    { readonly resolve: (response: HashResponse) => void; readonly reject: (cause: Error) => void }
  >();
  private next = 0;
  private closed = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.on('message', (raw: unknown) => {
      this.answer(HASH_RESPONSE.parse(raw));
    });
    this.worker.on('error', (cause) => {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    });
    this.worker.on('exit', (code) => {
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

function shareOf(hashed: number, files: number): number {
  return files === 0 ? 1 : hashed / files;
}

class HashRun {
  private hashed: number;
  private reported: number;

  constructor(
    private readonly env: HashEnvironment,
    private readonly root: PhysicalRoot,
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
      const current = this.env.store.driveItems.find(candidate.id);
      if (!this.stillValid(current, response)) return false;
      const written = this.hashItem(current, response.sha256);
      if (written === null) return false;
      if (response.blocks !== null && this.root.synced) {
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
  ): current is Exclude<DriveItem, { readonly kind: 'folder' }> {
    return (
      current !== undefined &&
      current.kind !== 'folder' &&
      current.bytes === response.bytes &&
      current.modifiedAt === modifiedIso(response.modifiedMs)
    );
  }

  private hashItem(
    current: Exclude<DriveItem, { readonly kind: 'folder' }>,
    sha256: string,
  ): DriveItem | null {
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

function physical(root: DriveRoot): PhysicalRoot | null {
  return root.path === null ? null : { ...root, path: root.path };
}

function wanted(env: HashEnvironment, root: DriveRoot): boolean {
  const settings = readDriveSettings(env.store);
  if (settings.indexingPaused) {
    env.log.info('drive.hash_paused', { rootId: root.id });
    return false;
  }
  return root.synced || settings.duplicatesHashing;
}

async function hashRoot(env: HashEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
  const found = env.store.driveRoots.find(rootId);
  const root = found === undefined ? null : physical(found);
  if (root === null) {
    env.log.warn('drive.hash_skipped_root', { rootId, reason: 'no physical root' });
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
