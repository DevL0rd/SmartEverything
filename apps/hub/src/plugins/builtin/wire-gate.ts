export class WireGate {
  #last = 0;

  constructor(
    private readonly quietMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  due(viewed: boolean, force = false): boolean {
    const now = this.now();
    if (!viewed && !force && now - this.#last < this.quietMs) {
      return false;
    }
    this.#last = now;
    return true;
  }
}
