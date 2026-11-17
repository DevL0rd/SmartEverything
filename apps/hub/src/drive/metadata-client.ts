import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { METADATA_RESPONSE, type MetadataOutcome, type MetadataRequest } from './metadata-protocol';

export const BUNDLED_METADATA_WORKER = fileURLToPath(
  new URL('./metadata-worker.mjs', import.meta.url),
);

interface Waiting {
  readonly resolve: (outcome: MetadataOutcome) => void;
  readonly reject: (cause: unknown) => void;
}

export class MetadataWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Waiting>();
  private next = 0;
  private closed = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.on('message', (raw: unknown) => {
      this.answer(raw);
    });
    this.worker.on('error', (cause) => {
      this.fail(cause);
    });
    this.worker.on('exit', (code) => {
      if (!this.closed)
        this.fail(new Error(`The metadata worker stopped with code ${String(code)}.`));
    });
  }

  read(fields: Omit<MetadataRequest, 'id'>): Promise<MetadataOutcome> {
    if (this.closed) return Promise.reject(new Error('The metadata worker was stopped.'));
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...fields, id });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fail(new Error('The metadata worker was stopped.'));
    await this.worker.terminate();
  }

  private answer(raw: unknown): void {
    const response = METADATA_RESPONSE.parse(raw);
    const waiting = this.pending.get(response.id);
    if (waiting === undefined) {
      throw new Error(`The metadata worker answered an unknown request ${String(response.id)}.`);
    }
    this.pending.delete(response.id);
    waiting.resolve(response.outcome);
  }

  private fail(cause: unknown): void {
    for (const waiting of this.pending.values()) waiting.reject(cause);
    this.pending.clear();
  }
}
