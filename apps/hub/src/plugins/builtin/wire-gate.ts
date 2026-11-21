export type WireAudience = 'everyone' | 'viewers';

export class WireGate {
  #last = 0;

  constructor(
    private readonly quietMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  due(viewed: boolean, force = false): WireAudience | null {
    const now = this.now();
    if (force || now - this.#last >= this.quietMs) {
      this.#last = now;
      return 'everyone';
    }
    return viewed ? 'viewers' : null;
  }
}
