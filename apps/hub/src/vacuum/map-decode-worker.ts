import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import {
  MAP_DECODE_OUTCOME,
  type MapDecodeJob,
  type MapDecodeOutcome,
  type MapDecoder,
} from './map-decode';
import type { MapDecodeRequest } from './map-worker';

export const BUNDLED_MAP_WORKER = fileURLToPath(
  new URL('./vacuum-map-worker.mjs', import.meta.url),
);

const REPLY = z.strictObject({ id: z.int(), outcome: MAP_DECODE_OUTCOME });

interface Waiting {
  readonly resolve: (outcome: MapDecodeOutcome) => void;
  readonly reject: (cause: Error) => void;
}

class MapWorkerThread {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Waiting>();
  private next = 0;
  private closed = false;
  private exited = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.unref();
    this.worker.on('message', (raw: unknown) => {
      const reply = REPLY.parse(raw);
      const waiting = this.pending.get(reply.id);
      this.pending.delete(reply.id);
      waiting?.resolve(reply.outcome);
    });
    this.worker.on('error', (cause) => {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    });
    this.worker.on('exit', (code) => {
      this.exited = true;
      if (!this.closed)
        this.fail(new Error(`The vacuum map worker stopped with code ${String(code)}.`));
    });
  }

  get alive(): boolean {
    return !this.exited;
  }

  decode(job: MapDecodeJob): Promise<MapDecodeOutcome> {
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const request: MapDecodeRequest = { id, job };
      this.worker.postMessage(request);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fail(new Error('The vacuum map worker was stopped.'));
    await this.worker.terminate();
  }

  private fail(cause: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(cause);
    this.pending.clear();
  }
}

export class MapDecodeWorker implements MapDecoder {
  private thread: MapWorkerThread | null = null;

  constructor(private readonly script: string) {}

  decode(job: MapDecodeJob): Promise<MapDecodeOutcome> {
    return this.started().decode(job);
  }

  async close(): Promise<void> {
    const thread = this.thread;
    this.thread = null;
    await thread?.close();
  }

  private started(): MapWorkerThread {
    if (this.thread?.alive === true) return this.thread;
    this.thread = new MapWorkerThread(this.script);
    return this.thread;
  }
}
