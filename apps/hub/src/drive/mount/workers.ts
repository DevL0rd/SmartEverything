import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';

export const BUNDLED_MOUNT_HASH_WORKER = fileURLToPath(
  new URL('./mount-hash-worker.mjs', import.meta.url),
);

export const HASH_REQUEST = z.strictObject({ id: z.int().nonnegative(), path: z.string().min(1) });

export interface HashResponse {
  readonly id: number;
  readonly sha256: string | null;
  readonly error: string | null;
}

const HASH_RESPONSE = z.strictObject({
  id: z.int().nonnegative(),
  sha256: z.string().nullable(),
  error: z.string().nullable(),
});

interface Job {
  readonly path: string;
  readonly resolve: (sha256: string) => void;
  readonly reject: (cause: unknown) => void;
}

interface Running {
  readonly id: number;
  readonly job: Job;
}

class Slot {
  private running: Running | null = null;

  constructor(readonly worker: Worker) {}

  get busy(): boolean {
    return this.running !== null;
  }

  get current(): Running | null {
    return this.running;
  }

  begin(id: number, job: Job): void {
    this.running = { id, job };
    this.worker.postMessage({ id, path: job.path });
  }

  finish(): Running | null {
    const running = this.running;
    this.running = null;
    return running;
  }
}

export class HashWorkerError extends Error {
  override readonly name = 'HashWorkerError';
}

export class HashPool {
  private readonly slots = new Set<Slot>();
  private readonly queue: Job[] = [];
  private counter = 0;
  private stopped = false;

  constructor(
    private readonly script: string,
    private size: number,
  ) {
    if (!Number.isInteger(size) || size < 1) {
      throw new HashWorkerError(
        `The hash worker pool needs at least one worker, got ${String(size)}.`,
      );
    }
  }

  resize(size: number): void {
    if (!Number.isInteger(size) || size < 1) {
      throw new HashWorkerError(
        `The hash worker pool needs at least one worker, got ${String(size)}.`,
      );
    }
    this.size = size;
    this.pump();
  }

  hash(path: string): Promise<string> {
    if (this.stopped)
      return Promise.reject(new HashWorkerError('The hash worker pool is stopped.'));
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ path, resolve, reject });
      this.pump();
    });
  }

  private idle(): Slot | undefined {
    for (const slot of this.slots) if (!slot.busy) return slot;
    return undefined;
  }

  private pump(): void {
    while (this.queue.length > 0) {
      let slot = this.idle();
      if (slot === undefined && this.slots.size < this.size) slot = this.spawn();
      if (slot === undefined) return;
      const job = this.queue.shift();
      if (job === undefined) return;
      this.counter += 1;
      slot.begin(this.counter, job);
    }
  }

  private spawn(): Slot {
    const worker = new Worker(this.script);
    const slot = new Slot(worker);
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.answered(slot, HASH_RESPONSE.parse(raw));
    });
    worker.on('error', (cause) => {
      this.lost(slot, cause);
    });
    worker.on('exit', (code) => {
      this.lost(slot, new HashWorkerError(`The hash worker exited with code ${String(code)}.`));
    });
    this.slots.add(slot);
    return slot;
  }

  private answered(slot: Slot, response: HashResponse): void {
    const running = slot.current;
    if (running?.id !== response.id) {
      this.lost(slot, new HashWorkerError('The hash worker answered a request it was not given.'));
      return;
    }
    slot.finish();
    if (response.sha256 === null) {
      running.job.reject(new HashWorkerError(response.error ?? 'The hash worker failed.'));
    } else {
      running.job.resolve(response.sha256);
    }
    this.pump();
  }

  private lost(slot: Slot, cause: unknown): void {
    if (!this.slots.delete(slot)) return;
    slot.finish()?.job.reject(cause);
    this.pump();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const slots = [...this.slots];
    this.slots.clear();
    for (const job of this.queue.splice(0))
      job.reject(new HashWorkerError('The hash worker pool stopped.'));
    await Promise.all(
      slots.map(async (slot) => {
        slot.finish()?.job.reject(new HashWorkerError('The hash worker pool stopped.'));
        await slot.worker.terminate();
      }),
    );
  }
}
