import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { Logger } from '@smarteverything/logging';
import { logRecordOf } from '../logs/record';
import { HUB_VERSION } from '../version';
import {
  FROM_CODEC,
  type CodecData,
  type CodecJob,
  type CodecReply,
  type CodecRequest,
} from './protocol';

export const BUNDLED_CODEC_WORKER = fileURLToPath(new URL('./codec-worker.mjs', import.meta.url));

interface Waiting {
  readonly resolve: (reply: CodecReply) => void;
  readonly reject: (cause: unknown) => void;
}

export class CodecWorkerError extends Error {
  override readonly name = 'CodecWorkerError';
}

export class CodecThread {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Waiting>();
  private next = 0;
  private closed = false;

  constructor(
    private readonly script: string,
    private readonly purpose: string,
    private readonly log: Logger,
  ) {}

  async run(job: CodecJob): Promise<CodecReply> {
    const reply = await this.request(job);
    if (reply.kind === 'failed') throw new CodecWorkerError(reply.message);
    return reply;
  }

  async close(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.fail(new CodecWorkerError(`The ${this.purpose} worker was stopped.`));
    if (worker !== null) await worker.terminate();
  }

  private request(job: CodecJob): Promise<CodecReply> {
    if (this.closed) throw new CodecWorkerError(`The ${this.purpose} worker was stopped.`);
    this.next += 1;
    const id = this.next;
    const worker = this.started();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, job } satisfies CodecRequest);
    });
  }

  private started(): Worker {
    if (this.worker !== null) return this.worker;
    const data: CodecData = { level: Logger.level, release: HUB_VERSION };
    const worker = new Worker(this.script, { workerData: data });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      const message = FROM_CODEC.parse(raw);
      if (message.kind === 'log') Logger.relay(logRecordOf(message.record));
      else this.answer(message);
    });
    worker.on('error', (cause) => {
      this.log.exception('codec.worker_failed', cause, { purpose: this.purpose });
      this.lost(worker, cause);
    });
    worker.on('exit', (code) => {
      this.lost(
        worker,
        new CodecWorkerError(`The ${this.purpose} worker stopped with code ${String(code)}.`),
      );
    });
    this.worker = worker;
    this.log.info('codec.worker_started', { purpose: this.purpose, pending: this.pending.size });
    return worker;
  }

  private lost(worker: Worker, cause: unknown): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.fail(cause);
  }

  private answer(reply: CodecReply): void {
    const waiting = this.pending.get(reply.id);
    this.pending.delete(reply.id);
    if (waiting === undefined) {
      this.log.error('codec.reply_unexpected', undefined, { purpose: this.purpose, id: reply.id });
      return;
    }
    waiting.resolve(reply);
  }

  private fail(cause: unknown): void {
    for (const waiting of this.pending.values()) waiting.reject(cause);
    this.pending.clear();
  }
}
