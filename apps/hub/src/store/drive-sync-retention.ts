import { Worker } from 'node:worker_threads';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { DAY_MS } from '../metrics/minute';

export const DRIVE_SYNC_OP_KEEP_MS = 30 * DAY_MS;

const DRIVE_SYNC_OP_SWEEP_SLACK_MS = DAY_MS;

const BATCH_ROWS = 2000;

const RETENTION_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync(workerData.path);
database.exec('pragma busy_timeout = ' + String(workerData.busyTimeoutMs));
const forget = database.prepare(
  'delete from drive_sync_ops where (placement_id, op_id) in (select placement_id, op_id from drive_sync_ops where at < $before order by at limit $batch)'
);
const oldest = database.prepare('select min(at) as at from drive_sync_ops');
parentPort.on('message', (before) => {
  const started = performance.now();
  try {
    let removed = 0;
    for (;;) {
      const changes = Number(forget.run({ before, batch: workerData.batch }).changes);
      removed += changes;
      if (changes < workerData.batch) break;
    }
    parentPort.postMessage({ removed, oldest: oldest.get().at, durationMs: performance.now() - started });
  } catch (cause) {
    parentPort.postMessage({ failure: cause instanceof Error ? cause.message : String(cause) });
  }
});
`;

const REPLY = z.union([
  z.strictObject({
    removed: z.int().nonnegative(),
    oldest: z.string().nullable(),
    durationMs: z.number().nonnegative(),
  }),
  z.strictObject({ failure: z.string() }),
]);

export interface DriveSyncRetentionOptions {
  readonly path: string;
  readonly busyTimeoutMs: number;
  readonly now: () => Date;
  readonly log: Logger;
}

export class DriveSyncRetention {
  private worker: Worker | null = null;
  private running = false;
  private closed = false;
  private dueAt = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: DriveSyncRetentionOptions) {}

  observe(): void {
    if (this.closed || this.running) return;
    const now = this.options.now().getTime();
    if (now < this.dueAt) return;
    this.running = true;
    this.started().postMessage(new Date(now - DRIVE_SYNC_OP_KEEP_MS).toISOString());
  }

  settled(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    if (worker === null) return;
    try {
      await worker.terminate();
    } catch (cause) {
      this.options.log.error('store.sync_op_retention_terminate_failed', cause);
      throw cause;
    }
  }

  private started(): Worker {
    if (this.worker !== null) return this.worker;
    const worker = new Worker(RETENTION_SOURCE, {
      eval: true,
      workerData: {
        path: this.options.path,
        busyTimeoutMs: this.options.busyTimeoutMs,
        batch: BATCH_ROWS,
      },
    });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.done(REPLY.parse(raw));
    });
    worker.on('error', (cause) => {
      this.stopped(worker, cause);
    });
    worker.on('exit', (code) => {
      this.stopped(
        worker,
        new Error(`the sync operation retention stopped with code ${String(code)}`),
      );
    });
    this.worker = worker;
    return worker;
  }

  private idle(): void {
    this.running = false;
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private done(reply: z.infer<typeof REPLY>): void {
    this.idle();
    const now = this.options.now().getTime();
    if ('failure' in reply) {
      this.dueAt = now + DRIVE_SYNC_OP_SWEEP_SLACK_MS;
      this.options.log.warn('store.sync_op_retention_failed', { reason: reply.failure });
      return;
    }
    const from = reply.oldest === null ? now : Date.parse(reply.oldest);
    this.dueAt = from + DRIVE_SYNC_OP_KEEP_MS + DRIVE_SYNC_OP_SWEEP_SLACK_MS;
    this.options.log.debug('store.sync_ops_forgotten', () => ({
      removed: reply.removed,
      durationMs: Math.round(reply.durationMs),
    }));
  }

  private stopped(worker: Worker, cause: unknown): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.idle();
    if (!this.closed) this.options.log.error('store.sync_op_retention_stopped', cause);
  }
}
