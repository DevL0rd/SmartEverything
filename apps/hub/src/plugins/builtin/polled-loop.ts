import { Loop } from '../loop';

export type Cadence = 'fast' | 'slow' | 'paused';

interface PolledLoopOptions {
  readonly sampleSeconds: number;
  readonly tick: () => Promise<void>;
}

export class PolledLoop {
  #cadence: Cadence = 'slow';
  #sampleSeconds: number;
  readonly #loop: Loop;

  constructor(options: PolledLoopOptions) {
    this.#sampleSeconds = options.sampleSeconds;
    this.#loop = new Loop(options.tick, () => {
      const seconds = this.intervalSeconds;
      return seconds === null ? null : seconds * 1000;
    });
  }

  get cadence(): Cadence {
    return this.#cadence;
  }

  get viewed(): boolean {
    return this.#cadence === 'fast';
  }

  get intervalSeconds(): number | null {
    return this.#cadence === 'paused' ? null : this.#sampleSeconds;
  }

  setSampleSeconds(seconds: number): void {
    this.#sampleSeconds = seconds;
  }

  setCadence(cadence: Cadence): void {
    this.#cadence = cadence;
    this.#loop.runNow();
  }

  runNow(): void {
    this.#loop.runNow();
  }

  stop(): void {
    this.#loop.stop();
  }
}
