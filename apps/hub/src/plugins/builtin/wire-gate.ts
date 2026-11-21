export type WireAudience = 'everyone' | 'viewers';

export class WireGate {
  #last = Number.NEGATIVE_INFINITY;
  #sent: string | null = null;

  constructor(
    private readonly quietMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  due(viewed: boolean, force: boolean, signature: string): WireAudience | null {
    const changed = signature !== this.#sent;
    if (force || (changed && this.now() - this.#last >= this.quietMs)) {
      return this.sent(signature);
    }
    return viewed ? 'viewers' : null;
  }

  sent(signature: string): 'everyone' {
    this.#last = this.now();
    this.#sent = signature;
    return 'everyone';
  }
}
