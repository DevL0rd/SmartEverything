import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { PhotoFaceDevice } from '@smarteverything/domain';
import { type Logger, messageOf } from '@smarteverything/logging';
import type { DetectedFace } from './engine';
import {
  FACE_REPLY,
  type FaceImage,
  type FaceInit,
  type FaceReply,
  type FaceRequest,
} from './protocol';

export const BUNDLED_FACES_WORKER = fileURLToPath(new URL('./faces-worker.mjs', import.meta.url));

export class FaceWorkerError extends Error {
  override readonly name = 'FaceWorkerError';
}

interface Pending {
  readonly resolve: (faces: DetectedFace[]) => void;
  readonly reject: (cause: Error) => void;
}

export interface FacePoolOptions extends FaceInit {
  readonly script: string;
  readonly log: Logger;
}

const PREPARED_PER_REQUEST = 2;

const STARTING: PhotoFaceDevice = {
  state: 'starting',
  reason: 'The face models have not loaded yet.',
};

export class FacePool {
  private worker: Worker | undefined;
  private ready: Promise<Worker> | undefined;
  private readonly pending = new Map<number, Pending>();
  private next = 0;
  private current: PhotoFaceDevice = STARTING;
  private requests = 1;

  constructor(private readonly options: FacePoolOptions) {}

  device(): PhotoFaceDevice {
    return this.current;
  }

  capacity(): number {
    return this.requests * PREPARED_PER_REQUEST;
  }

  warm(ready: () => void): void {
    this.start().then(ready, (cause: unknown) => {
      this.options.log.error('vision.faces_start_failed', cause);
    });
  }

  async analyse(image: FaceImage, signal?: AbortSignal): Promise<DetectedFace[]> {
    signal?.throwIfAborted();
    const worker = await this.start();
    signal?.throwIfAborted();
    const id = this.next;
    this.next += 1;
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.pending.delete(id);
        reject(signal?.reason instanceof Error ? signal.reason : new FaceWorkerError('aborted'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: (faces) => {
          signal?.removeEventListener('abort', abort);
          resolve(faces);
        },
        reject: (cause) => {
          signal?.removeEventListener('abort', abort);
          reject(cause);
        },
      });
      const request: FaceRequest = { id, image };
      worker.postMessage(request);
    });
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.ready = undefined;
    this.fail(new FaceWorkerError('The face worker was closed.'));
    await worker?.terminate();
  }

  private start(): Promise<Worker> {
    this.ready ??= this.spawn();
    return this.ready;
  }

  private spawn(): Promise<Worker> {
    const { script, directory, threads } = this.options;
    this.current = STARTING;
    const worker = new Worker(script, { workerData: { directory, threads } });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      const lost = (cause: Error): void => {
        if (this.worker === worker) this.chose('failed', cause.message);
        this.worker = undefined;
        this.ready = undefined;
        this.fail(cause);
        reject(cause);
      };
      worker.on('message', (raw: unknown) => {
        const reply = FACE_REPLY.parse(raw);
        if (reply.kind === 'ready') {
          this.requests = reply.requests;
          this.chose(reply.device === 'GPU' ? 'gpu' : 'cpu', reply.reason);
          resolve(worker);
        } else this.settle(reply, reject);
      });
      worker.on('error', (cause: Error) => {
        lost(new FaceWorkerError(messageOf(cause)));
      });
      worker.on('exit', (code) => {
        lost(new FaceWorkerError(`The face worker stopped with code ${String(code)}.`));
      });
    });
  }

  private settle(
    reply: Exclude<FaceReply, { kind: 'ready' }>,
    rejectStart: (cause: Error) => void,
  ): void {
    if (reply.kind === 'faces') {
      this.take(reply.id)?.resolve(reply.faces);
      return;
    }
    if (reply.id === null) {
      this.chose('failed', reply.message);
      rejectStart(new FaceWorkerError(reply.message));
      return;
    }
    this.take(reply.id)?.reject(new FaceWorkerError(reply.message));
  }

  private chose(state: PhotoFaceDevice['state'], reason: string): void {
    this.current = { state, reason };
    this.options.log.info('vision.faces_device', {
      device: state,
      reason,
      requests: this.requests,
    });
  }

  private take(id: number): Pending | undefined {
    const found = this.pending.get(id);
    this.pending.delete(id);
    return found;
  }

  private fail(cause: Error): void {
    for (const pending of this.pending.values()) pending.reject(cause);
    this.pending.clear();
  }
}
