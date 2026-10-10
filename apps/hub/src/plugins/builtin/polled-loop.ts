export type Cadence = 'fast' | 'slow' | 'paused';

interface PolledLoopOptions {
  readonly fastSeconds: number;
  readonly slowSeconds: number;
  readonly tick: () => Promise<void>;
}

export class PolledLoop {
  #cadence: Cadence = 'slow';
  #timer: NodeJS.Timeout | null = null;
  #running = false;
  #stopped = false;

  constructor(private readonly options: PolledLoopOptions) {}

  get cadence(): Cadence {
    return this.#cadence;
  }

  get intervalSeconds(): number | null {
    switch (this.#cadence) {
      case 'fast':
        return this.options.fastSeconds;
      case 'slow':
        return this.options.slowSeconds;
      case 'paused':
        return null;
    }
  }

  setCadence(cadence: Cadence): void {
    this.#cadence = cadence;
    this.#cancel();
    void this.#run();
  }

  runNow(): void {
    this.#cancel();
    void this.#run();
  }

  stop(): void {
    this.#stopped = true;
    this.#cancel();
  }

  async #run(): Promise<void> {
    if (this.#running || this.#stopped || this.#cadence === 'paused') {
      return;
    }
    this.#running = true;
    try {
      await this.options.tick();
    } finally {
      this.#running = false;
      this.#schedule();
    }
  }

  #schedule(): void {
    const seconds = this.intervalSeconds;
    if (this.#stopped || seconds === null) {
      return;
    }
    this.#cancel();
    this.#timer = setTimeout(() => void this.#run(), seconds * 1000);
  }

  #cancel(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
