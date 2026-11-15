import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { messageOf } from '@smarteverything/logging';
import type { DetectedFace } from './engine';
import type { RgbImage } from './image';
import { FACE_REPLY, type FaceInit, type FaceReply } from './protocol';

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
}

export class FacePool {
  private worker: Worker | undefined;
  private ready: Promise<Worker> | undefined;
  private readonly pending = new Map<number, Pending>();
  private next = 0;

  constructor(private readonly options: FacePoolOptions) {}

  async analyse(image: RgbImage, signal?: AbortSignal): Promise<DetectedFace[]> {
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
      worker.postMessage({ id, width: image.width, height: image.height, data: image.data });
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
    const worker = new Worker(script, { workerData: { directory, threads } });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      const lost = (cause: Error): void => {
        this.worker = undefined;
        this.ready = undefined;
        this.fail(cause);
        reject(cause);
      };
      worker.on('message', (raw: unknown) => {
        const reply = FACE_REPLY.parse(raw);
        if (reply.kind === 'ready') resolve(worker);
        else this.settle(reply, reject);
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
      rejectStart(new FaceWorkerError(reply.message));
      return;
    }
    this.take(reply.id)?.reject(new FaceWorkerError(reply.message));
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
