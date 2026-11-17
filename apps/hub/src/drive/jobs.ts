import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { MARKER_DIRECTORY } from './root-marker';
import type { DriveRootLanes } from './root-lanes';
import { ScanCommitter, type CommitDependencies } from './scanner-commit';
import {
  CallClock,
  CONTROL_ACKED,
  CONTROL_SLOTS,
  UNRESPONSIVE_AFTER_MS,
  WALK_MESSAGE,
  type WalkData,
  type WalkEntry,
  type WalkMessage,
} from './scanner-walk';
import { hashRequested } from './blocks';
import type { RootAvailability } from './root-marker';

export const BUNDLED_SCANNER_WORKER = fileURLToPath(
  new URL('./scanner-worker.mjs', import.meta.url),
);

export interface ScanJob {
  readonly kind: 'scan';
  readonly rootId: string;
}

export interface HashJob {
  readonly kind: 'hash';
  readonly rootId: string;
}

export interface MetadataJob {
  readonly kind: 'metadata';
  readonly rootId: string;
}

export interface TextJob {
  readonly kind: 'text';
  readonly rootId: string;
}

export type DriveJob = ScanJob | HashJob | MetadataJob | TextJob;

export type DriveJobKind = DriveJob['kind'];

export type DriveJobHandlers = {
  readonly [K in DriveJobKind]: (
    job: Extract<DriveJob, { readonly kind: K }>,
    signal: AbortSignal,
  ) => Promise<void>;
};

export const BUNDLED_HASH_WORKER = fileURLToPath(new URL('./hasher-worker.mjs', import.meta.url));

export function jobKey(job: DriveJob): string {
  return `${job.kind}:${job.rootId}`;
}

export function runnerOf(
  handlers: DriveJobHandlers,
): (job: DriveJob, signal: AbortSignal) => Promise<void> {
  return (job, signal) => {
    switch (job.kind) {
      case 'scan':
        return handlers.scan(job, signal);
      case 'hash':
        return handlers.hash(job, signal);
      case 'metadata':
        return handlers.metadata(job, signal);
      case 'text':
        return handlers.text(job, signal);
    }
  };
}

export interface ScanEnvironment {
  readonly store: Pick<
    Store,
    'driveRoots' | 'driveItems' | 'driveInodes' | 'driveMissing' | 'feed' | 'write' | 'now'
  >;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly mounted: (rootId: string) => boolean;
  readonly workerScript: string;
  readonly log: Logger;
  readonly lanes: DriveRootLanes;
  readonly newId?: () => string;
}

interface WalkOutcome {
  readonly unreadable: readonly string[];
  readonly skipped: number;
  readonly cancelled: boolean;
}

const UNAVAILABLE_REASON: Readonly<Record<Exclude<RootAvailability, 'online'>, string>> = {
  missing: 'The drive folder is missing.',
  different: 'The folder is not this drive; its identity marker does not match.',
};

export function watchHang(
  control: Int32Array,
  origin: number,
  changed: (stuck: boolean) => void,
): () => void {
  let stuck = false;
  let timer: NodeJS.Timeout | undefined;
  const check = (): void => {
    const now = CallClock.stuckForMs(control, origin) >= UNRESPONSIVE_AFTER_MS;
    if (now !== stuck) {
      stuck = now;
      changed(now);
    }
    timer = setTimeout(check, UNRESPONSIVE_AFTER_MS);
    timer.unref();
  };
  timer = setTimeout(check, UNRESPONSIVE_AFTER_MS);
  timer.unref();
  return (): void => {
    clearTimeout(timer);
  };
}

class ScanRun {
  private readonly control = new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT);
  private readonly acks = new Int32Array(this.control);
  private readonly origin = Date.now();
  private readonly unreadable: string[] = [];
  private done = 0;

  constructor(
    private readonly env: ScanEnvironment,
    private readonly root: StoredDrive,
    private readonly committer: ScanCommitter,
  ) {}

  walk(signal: AbortSignal): Promise<WalkOutcome> {
    if (signal.aborted) {
      return Promise.resolve({ unreadable: [], skipped: 0, cancelled: true });
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.env.workerScript, { workerData: this.data() });
      const stopWatching = watchHang(this.acks, this.origin, (stuck) => {
        this.hung(stuck);
      });
      let settled = false;
      const settle = (finish: () => void): void => {
        if (settled) return;
        settled = true;
        stopWatching();
        signal.removeEventListener('abort', onAbort);
        this.terminate(worker);
        finish();
      };
      const complete = (skipped: number, cancelled: boolean): void => {
        settle(() => {
          resolve({ unreadable: this.unreadable, skipped, cancelled });
        });
      };
      const fail = (cause: unknown): void => {
        settle(() => {
          reject(cause instanceof Error ? cause : new Error(messageOf(cause)));
        });
      };
      const onAbort = (): void => {
        complete(0, true);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      worker.on('message', (raw: unknown) => {
        try {
          this.message(WALK_MESSAGE.parse(raw), (skipped) => {
            complete(skipped, false);
          });
        } catch (cause) {
          fail(cause);
        }
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        fail(new Error(`The scan worker stopped with code ${String(code)}.`));
      });
    });
  }

  private data(): WalkData {
    return {
      path: this.root.path,
      includeHidden: this.root.includeHidden || this.env.mounted(this.root.id),
      skip: this.root.skipPatterns,
      reserved: [MARKER_DIRECTORY],
      control: this.control,
      origin: this.origin,
    };
  }

  private terminate(worker: Worker): void {
    worker.terminate().catch((cause: unknown) => {
      this.env.log.error('drive.scan_terminate_failed', cause, { rootId: this.root.id });
    });
  }

  private message(message: WalkMessage, finished: (skipped: number) => void): void {
    switch (message.kind) {
      case 'batch':
        this.committer.apply(message.entries);
        this.done += message.entries.length;
        Atomics.store(this.acks, CONTROL_ACKED, message.sequence);
        Atomics.notify(this.acks, CONTROL_ACKED);
        this.progress();
        return;
      case 'problem':
        this.unreadable.push(message.relPath);
        this.env.log.warn('drive.scan_unreadable', {
          rootId: this.root.id,
          relPath: message.relPath,
          code: message.code,
        });
        return;
      case 'done':
        finished(message.skipped);
        return;
      case 'failed':
        throw new Error(message.message);
    }
  }

  private progress(): void {
    this.env.store.feed.notice({
      type: 'drive_progress',
      rootId: this.root.id,
      phase: 'scan',
      done: this.done,
      total: Math.max(this.committer.previous, this.done),
    });
  }

  private hung(stuck: boolean): void {
    this.env.log.warn(stuck ? 'drive.root_unresponsive' : 'drive.root_responsive', {
      rootId: this.root.id,
    });
    this.env.store.driveRoots.update(
      this.root.id,
      stuck
        ? { state: 'unresponsive', stateReason: 'The storage stopped answering.' }
        : { state: 'scanning', stateReason: null },
    );
  }
}

async function scanRoot(env: ScanEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
  const root = env.store.driveRoots.find(rootId);
  if (root === undefined) {
    env.log.warn('drive.scan_skipped', { rootId, reason: 'no such drive' });
    return;
  }
  const availability = await env.availability(root);
  if (availability !== 'online') {
    env.store.driveRoots.update(rootId, {
      state: 'error',
      stateReason: UNAVAILABLE_REASON[availability],
    });
    env.log.info('drive.scan_unavailable', { rootId, availability });
    return;
  }
  env.store.driveRoots.update(rootId, { state: 'scanning', stateReason: null });
  const startedAt = performance.now();
  try {
    await env.lanes.run([root.id], () => commitScan(env, root, signal, startedAt));
  } catch (cause) {
    env.log.error('drive.scan_failed', cause, { rootId });
    env.store.driveRoots.update(rootId, { state: 'error', stateReason: messageOf(cause) });
  }
}

async function hashForReuse(
  env: ScanEnvironment,
  root: StoredDrive,
  entry: WalkEntry,
): Promise<string | null> {
  const response = await hashRequested({
    id: 1,
    rootPath: root.path,
    relPath: entry.relPath,
    dev: entry.dev,
    ino: entry.ino,
    withBlocks: false,
  });
  if (response.kind === 'hashed' && response.bytes === entry.bytes) return response.sha256;
  env.log.warn('drive.scan_reuse_hash_skipped', {
    rootId: root.id,
    relPath: entry.relPath,
    reason: response.kind === 'hashed' ? 'changed' : response.reason,
  });
  return null;
}

async function commitScan(
  env: ScanEnvironment,
  root: StoredDrive,
  signal: AbortSignal,
  startedAt: number,
): Promise<void> {
  const dependencies: CommitDependencies = {
    items: env.store.driveItems,
    inodes: env.store.driveInodes,
    missing: env.store.driveMissing,
    hash: (entry) => hashForReuse(env, root, entry),
    write: (work) => env.store.write(work),
    now: env.store.now,
    newId: env.newId ?? randomUUID,
  };
  const committer = new ScanCommitter(dependencies, root);
  const outcome = await new ScanRun(env, root, committer).walk(signal);
  if (outcome.cancelled) {
    env.log.info('drive.scan_cancelled', { rootId: root.id });
    return;
  }
  const totals = await committer.finish(outcome.unreadable);
  env.store.driveRoots.update(root.id, {
    state: 'ready',
    stateReason: null,
    scannedAt: env.store.now().toISOString(),
    ...totals,
  });
  const entries = totals.items + totals.folders;
  env.store.feed.notice({
    type: 'drive_progress',
    rootId: root.id,
    phase: 'scan',
    done: entries,
    total: entries,
  });
  env.log.info('drive.scan_done', {
    rootId: root.id,
    ...totals,
    unreadable: outcome.unreadable.length,
    skippedUnknown: outcome.skipped,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function scanHandler(env: ScanEnvironment): DriveJobHandlers['scan'] {
  return (job, signal) => scanRoot(env, job.rootId, signal);
}
