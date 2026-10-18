import { background } from '@smarteverything/logging';
export class Loop {
  #timer: NodeJS.Timeout | null = null;
  #running = false;
  #stopped = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: () => number | null,
  ) {}

  start(): void {
    this.#stopped = false;
    this.#schedule();
  }

  runNow(): void {
    this.#cancel();
    background(this.#run(), 'loop.run_failed');
  }

  stop(): void {
    this.#stopped = true;
    this.#cancel();
  }

  async #run(): Promise<void> {
    if (this.#running || this.#stopped || this.intervalMs() === null) {
      return;
    }
    this.#running = true;
    try {
      await this.task();
    } finally {
      this.#running = false;
      this.#schedule();
    }
  }

  #schedule(): void {
    const interval = this.intervalMs();
    if (this.#stopped || this.#running || interval === null) {
      return;
    }
    this.#cancel();
    this.#timer = setTimeout(() => {
      background(this.#run(), 'loop.run_failed');
    }, interval);
  }

  #cancel(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
