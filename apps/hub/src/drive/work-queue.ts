import { availableParallelism } from 'node:os';
import { background } from '@smarteverything/logging';

export interface WorkQueueOptions<J> {
  readonly concurrency: number;
  readonly keyOf: (job: J) => string;
  readonly run: (job: J, signal: AbortSignal) => Promise<void>;
  readonly failed: (job: J, cause: unknown) => void;
}

export function defaultConcurrency(): number {
  return availableParallelism();
}

export class WorkQueue<J> {
  private readonly queued = new Map<string, J>();
  private readonly running = new Set<string>();
  private readonly again = new Map<string, J>();
  private readonly waiting: (() => void)[] = [];
  private readonly abort = new AbortController();

  constructor(private readonly options: WorkQueueOptions<J>) {}

  enqueue(job: J): void {
    if (this.abort.signal.aborted) return;
    const key = this.options.keyOf(job);
    if (this.running.has(key)) {
      this.again.set(key, job);
      return;
    }
    this.queued.set(key, job);
    this.pump();
  }

  idle(): Promise<void> {
    if (this.queued.size === 0 && this.running.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async stop(): Promise<void> {
    this.abort.abort();
    this.queued.clear();
    this.again.clear();
    await this.idle();
  }

  private pump(): void {
    while (this.running.size < this.options.concurrency) {
      const next = this.queued.entries().next();
      if (next.done === true) break;
      const [key, job] = next.value;
      this.queued.delete(key);
      this.running.add(key);
      background(this.start(key, job), 'drive.job_crashed', { key });
    }
  }

  private async start(key: string, job: J): Promise<void> {
    try {
      await this.options.run(job, this.abort.signal);
    } catch (cause) {
      this.options.failed(job, cause);
    } finally {
      this.running.delete(key);
      const rerun = this.again.get(key);
      if (rerun !== undefined) {
        this.again.delete(key);
        this.queued.set(key, rerun);
      }
      this.pump();
      this.release();
    }
  }

  private release(): void {
    if (this.queued.size > 0 || this.running.size > 0) return;
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}
