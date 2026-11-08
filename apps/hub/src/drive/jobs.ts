import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { DriveRoot } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { MARKER_DIRECTORY } from './root-marker';
import { ScanCommitter, type CommitDependencies } from './scanner-commit';
import {
  CallClock,
  CONTROL_ACKED,
  CONTROL_SLOTS,
  UNRESPONSIVE_AFTER_MS,
  WALK_MESSAGE,
  type WalkData,
  type WalkMessage,
} from './scanner-walk';
import type { RootAvailability } from './volumes';

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

export type DriveJob = ScanJob | HashJob | MetadataJob;

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
  return (job, signal) =>
    (handlers[job.kind] as (job: DriveJob, signal: AbortSignal) => Promise<void>)(job, signal);
}

export interface ScanEnvironment {
  readonly store: Pick<Store, 'driveRoots' | 'driveItems' | 'feed' | 'write' | 'now'>;
  readonly availability: (root: DriveRoot) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly log: Logger;
  readonly newId?: () => string;
}

interface WalkOutcome {
  readonly unreadable: readonly string[];
  readonly skipped: number;
  readonly cancelled: boolean;
}

const UNAVAILABLE_REASON: Readonly<Record<Exclude<RootAvailability, 'online'>, string>> = {
  offline: 'The storage is not mounted.',
  missing: 'The folder is missing.',
  different: 'A different disk is mounted at this path.',
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
    private readonly root: DriveRoot & { readonly path: string },
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
      includeHidden: this.root.includeHidden,
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

function physical(root: DriveRoot): (DriveRoot & { readonly path: string }) | null {
  return root.path === null ? null : { ...root, path: root.path };
}

async function scanRoot(env: ScanEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
  const found = env.store.driveRoots.find(rootId);
  const root = found === undefined ? null : physical(found);
  if (root === null) {
    env.log.warn('drive.scan_skipped', { rootId, reason: 'no physical root' });
    return;
  }
  const availability = await env.availability(root);
  if (availability !== 'online') {
    env.store.driveRoots.update(rootId, {
      state: availability === 'offline' ? 'offline' : 'error',
      stateReason: UNAVAILABLE_REASON[availability],
    });
    env.log.info('drive.scan_unavailable', { rootId, availability });
    return;
  }
  env.store.driveRoots.update(rootId, { state: 'scanning', stateReason: null });
  const startedAt = performance.now();
  try {
    await commitScan(env, root, signal, startedAt);
  } catch (cause) {
    env.log.error('drive.scan_failed', cause, { rootId });
    env.store.driveRoots.update(rootId, { state: 'error', stateReason: messageOf(cause) });
  }
}

async function commitScan(
  env: ScanEnvironment,
  root: DriveRoot & { readonly path: string },
  signal: AbortSignal,
  startedAt: number,
): Promise<void> {
  const dependencies: CommitDependencies = {
    items: env.store.driveItems,
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
  const totals = committer.finish(outcome.unreadable);
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
    skippedSpecial: outcome.skipped,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function scanHandler(env: ScanEnvironment): DriveJobHandlers['scan'] {
  return (job, signal) => scanRoot(env, job.rootId, signal);
}
