export class Throttle {
  #timer: NodeJS.Timeout | null = null;
  #ranAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly work: () => void,
    private readonly gapMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  trigger(): void {
    if (this.#timer !== null) {
      return;
    }
    const wait = this.#ranAt + this.gapMs - this.now();
    if (wait <= 0) {
      this.#run();
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#run();
    }, wait);
    this.#timer.unref();
  }

  cancel(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #run(): void {
    this.#ranAt = this.now();
    this.work();
  }
}
