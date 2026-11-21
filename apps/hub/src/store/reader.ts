import { Worker } from 'node:worker_threads';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { SqlParameters } from './sql';

const READER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync(workerData.path, { readOnly: true });
database.exec('pragma busy_timeout = ' + String(workerData.busyTimeoutMs));
const statements = new Map();
parentPort.on('message', (request) => {
  try {
    let statement = statements.get(request.text);
    if (statement === undefined) {
      statement = database.prepare(request.text);
      statements.set(request.text, statement);
    }
    parentPort.postMessage({ id: request.id, rows: statement.all(request.parameters) });
  } catch (cause) {
    parentPort.postMessage({ id: request.id, failure: cause instanceof Error ? cause.message : String(cause) });
  }
});
`;

const REPLY = z.union([
  z.strictObject({ id: z.int(), rows: z.array(z.unknown()) }),
  z.strictObject({ id: z.int(), failure: z.string() }),
]);

export class StoreReadError extends Error {
  override readonly name = 'StoreReadError';

  constructor(
    readonly text: string,
    reason: string,
  ) {
    super(`The background store read failed: ${reason}.`);
  }
}

interface Pending {
  readonly text: string;
  readonly resolve: (rows: readonly unknown[]) => void;
  readonly reject: (cause: Error) => void;
}

export interface StoreReaderOptions {
  readonly path: string;
  readonly busyTimeoutMs: number;
  readonly log: Logger;
}

export class StoreReader {
  private worker: Worker | null = null;
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private closed = false;

  constructor(private readonly options: StoreReaderOptions) {}

  async all<T>(schema: z.ZodType<T>, text: string, parameters: SqlParameters = {}): Promise<T[]> {
    const rows = await this.request(text, parameters);
    return z.array(schema).parse(rows);
  }

  async close(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.failAll(new StoreReadError('', 'the store is closing'));
    if (worker === null) return;
    try {
      await worker.terminate();
    } catch (cause) {
      this.options.log.error('store.reader_terminate_failed', cause);
      throw cause;
    }
  }

  private request(text: string, parameters: SqlParameters): Promise<readonly unknown[]> {
    if (this.closed) return Promise.reject(new StoreReadError(text, 'the store is closed'));
    const worker = this.started();
    this.sequence += 1;
    const id = this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { text, resolve, reject });
      worker.postMessage({ id, text, parameters });
    });
  }

  private started(): Worker {
    if (this.worker !== null) return this.worker;
    const worker = new Worker(READER_SOURCE, {
      eval: true,
      workerData: { path: this.options.path, busyTimeoutMs: this.options.busyTimeoutMs },
    });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.reply(raw);
    });
    worker.on('error', (cause) => {
      this.stopped(worker, cause);
    });
    worker.on('exit', (code) => {
      this.stopped(worker, new Error(`the reader stopped with code ${String(code)}`));
    });
    this.worker = worker;
    this.options.log.info('store.reader_started', { file: this.options.path });
    return worker;
  }

  private reply(raw: unknown): void {
    const reply = REPLY.parse(raw);
    const waiting = this.pending.get(reply.id);
    if (waiting === undefined)
      throw new Error(`The store reader answered an unknown request ${String(reply.id)}.`);
    this.pending.delete(reply.id);
    if ('failure' in reply) waiting.reject(new StoreReadError(waiting.text, reply.failure));
    else waiting.resolve(reply.rows);
  }

  private stopped(worker: Worker, cause: unknown): void {
    if (this.worker !== worker) return;
    this.worker = null;
    if (!this.closed) this.options.log.error('store.reader_stopped', cause);
    this.failAll(new StoreReadError('', messageOf(cause)));
  }

  private failAll(cause: Error): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const entry of waiting) entry.reject(cause);
  }
}

export class Coalesced {
  private cycling: Promise<void> | null = null;
  private again = false;
  private stopped = false;

  constructor(
    private readonly work: () => Promise<void>,
    private readonly failed: (cause: unknown) => void,
  ) {}

  trigger(): void {
    if (this.stopped) return;
    if (this.cycling !== null) {
      this.again = true;
      return;
    }
    this.cycling = this.cycle();
    background(this.cycling, 'store.coalesced_crashed');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle();
  }

  get busy(): boolean {
    return this.cycling !== null;
  }

  async idle(): Promise<void> {
    while (this.cycling !== null) await this.cycling;
  }

  private async cycle(): Promise<void> {
    try {
      await this.work();
    } catch (cause) {
      this.failed(cause);
    } finally {
      this.cycling = null;
    }
    if (!this.again) return;
    this.again = false;
    this.trigger();
  }
}
