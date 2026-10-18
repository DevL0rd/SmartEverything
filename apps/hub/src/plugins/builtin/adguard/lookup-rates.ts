export interface LookupRate {
  readonly lookupsPerSecond: number;
  readonly blockedPerSecond: number;
}

interface Totals {
  readonly at: number;
  readonly queries: number;
  readonly blocked: number;
}

export class LookupRates {
  #previous: Totals | null = null;

  sample(queries: number, blocked: number, at: number): LookupRate | null {
    const previous = this.#previous;
    this.#previous = { at, queries, blocked };
    const seconds = previous === null ? 0 : (at - previous.at) / 1000;
    if (
      previous === null ||
      seconds <= 0 ||
      queries < previous.queries ||
      blocked < previous.blocked
    ) {
      return null;
    }
    return {
      lookupsPerSecond: (queries - previous.queries) / seconds,
      blockedPerSecond: (blocked - previous.blocked) / seconds,
    };
  }

  reset(): void {
    this.#previous = null;
  }
}
