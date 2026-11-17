import { Worker } from 'node:worker_threads';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const CHECKPOINT_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync(workerData.path);
database.exec('pragma busy_timeout = ' + String(workerData.busyTimeoutMs));
const checkpoint = database.prepare('pragma wal_checkpoint(passive)');
parentPort.on('message', () => {
  const started = performance.now();
  try {
    const row = checkpoint.get();
    parentPort.postMessage({ busy: row.busy, log: row.log, checkpointed: row.checkpointed, durationMs: performance.now() - started });
  } catch (cause) {
    parentPort.postMessage({ failure: cause instanceof Error ? cause.message : String(cause) });
  }
});
`;

const SLOW_CHECKPOINT_MS = 1000;

const REPLY = z.union([
  z.strictObject({
    busy: z.int(),
    log: z.int(),
    checkpointed: z.int(),
    durationMs: z.number().nonnegative(),
  }),
  z.strictObject({ failure: z.string() }),
]);

export interface CheckpointOptions {
  readonly path: string;
  readonly busyTimeoutMs: number;
  readonly log: Logger;
}

export class StoreCheckpoints {
  private worker: Worker | null = null;
  private running = false;
  private again = false;
  private closed = false;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: CheckpointOptions) {}

  trigger(): void {
    if (this.closed) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.started().postMessage('checkpoint');
  }

  settled(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  close(): void {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    worker?.terminate().catch((cause: unknown) => {
      this.options.log.error('store.checkpoint_thread_terminate_failed', cause);
    });
  }

  private started(): Worker {
    if (this.worker !== null) return this.worker;
    const worker = new Worker(CHECKPOINT_SOURCE, {
      eval: true,
      workerData: { path: this.options.path, busyTimeoutMs: this.options.busyTimeoutMs },
    });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.done(raw);
    });
    worker.on('error', (cause) => {
      this.stopped(worker, cause);
    });
    worker.on('exit', (code) => {
      this.stopped(worker, new Error(`the checkpoint thread stopped with code ${String(code)}`));
    });
    this.worker = worker;
    return worker;
  }

  private done(raw: unknown): void {
    const reply = REPLY.parse(raw);
    this.running = false;
    if ('failure' in reply) {
      this.options.log.warn('store.checkpoint_failed', { reason: reply.failure });
    } else if (reply.durationMs >= SLOW_CHECKPOINT_MS) {
      this.options.log.info('store.checkpoint_slow', {
        durationMs: Math.round(reply.durationMs),
        frames: reply.log,
        checkpointed: reply.checkpointed,
      });
    }
    if (this.again) {
      this.again = false;
      this.trigger();
      return;
    }
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private stopped(worker: Worker, cause: unknown): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.running = false;
    for (const resolve of this.waiting.splice(0)) resolve();
    if (!this.closed) this.options.log.error('store.checkpoint_thread_stopped', cause);
  }
}
