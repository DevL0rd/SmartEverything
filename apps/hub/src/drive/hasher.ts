import { Worker } from 'node:worker_threads';
import type { Logger } from '@smarteverything/logging';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { Store } from '../store/store';
import { HASH_RESPONSE, type BlockHashes, type HashRequest, type HashResponse } from './blocks';
import type { DriveJobHandlers } from './jobs';
import type { RootAvailability } from './root-marker';
import type {
  HashBacklog,
  HashCandidate,
  HashHealthInput,
  HashRecordInput,
  HashRecorded,
  HashStart,
} from './units/hash';

type HashedResponse = Extract<HashResponse, { readonly kind: 'hashed' }>;

export interface HashEnvironment {
  readonly store: Pick<Store, 'feed'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly start: (rootId: string) => Promise<HashStart>;
  readonly backlog: (rootId: string) => Promise<HashBacklog>;
  readonly record: (input: HashRecordInput) => Promise<HashRecorded>;
  readonly health: (input: HashHealthInput) => Promise<void>;
  readonly workerScript: string;
  readonly log: Logger;
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
  readonly bytes: number;
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
    return { sha256: response.sha256, bytes: response.bytes, blocks: response.blocks };
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
        await this.settle(candidate, response);
      }
    } catch (cause) {
      if (!signal.aborted) throw cause;
    } finally {
      await worker.close();
    }
  }

  async finish(): Promise<void> {
    await this.health(shareOf(this.hashed, this.backlog.files));
  }

  private async settle(candidate: HashCandidate, response: HashResponse): Promise<void> {
    if (response.kind === 'skipped') {
      this.env.log.warn('drive.hash_skipped', {
        rootId: this.root.id,
        relPath: candidate.relPath,
        reason: response.reason,
        code: response.code,
      });
      return;
    }
    if (!(await this.record(candidate, response))) return;
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
      await this.health(shareOf(this.hashed, this.backlog.files));
    }
  }

  private async record(candidate: HashCandidate, response: HashedResponse): Promise<boolean> {
    const recorded = await this.env.record({
      rootId: this.root.id,
      itemId: candidate.id,
      sha256: response.sha256,
      bytes: response.bytes,
      modifiedMs: response.modifiedMs,
      blocks: response.blocks,
    });
    if (recorded.kind === 'changed')
      this.env.log.warn('drive.hash_changed_silently', {
        rootId: this.root.id,
        relPath: recorded.relPath,
      });
    return recorded.kind === 'recorded';
  }

  private health(share: number): Promise<void> {
    return this.env.health({ rootId: this.root.id, share });
  }
}

async function hashRoot(env: HashEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
  const { root, indexingPaused, wanted } = await env.start(rootId);
  if (root === null) {
    env.log.warn('drive.hash_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  if (indexingPaused) {
    env.log.info('drive.hash_paused', { rootId: root.id });
    return;
  }
  if (!wanted || (await env.availability(root)) !== 'online') return;
  const backlog = await env.backlog(root.id);
  const run = new HashRun(env, root, backlog);
  const startedAt = performance.now();
  await run.run(signal);
  if (signal.aborted) return;
  await run.finish();
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
