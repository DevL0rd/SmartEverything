const FAILURES_TO_OFFLINE = 3;
const MIN_FLIP_MS = 30_000;

export type Flip = 'online' | 'offline' | null;

export class Presence {
  #online = true;
  #failures = 0;
  #flippedAt = Number.NEGATIVE_INFINITY;
  #goodbye = false;

  constructor(initiallyOnline = true) {
    this.#online = initiallyOnline;
  }

  get online(): boolean {
    return this.#online;
  }

  get failures(): number {
    return this.#failures;
  }

  goodbye(): void {
    this.#goodbye = true;
  }

  success(now: number): Flip {
    this.#failures = 0;
    this.#goodbye = false;
    if (this.#online) return null;
    return this.#flip(true, now);
  }

  failure(now: number, immediate = false): Flip {
    this.#failures += 1;
    if (!this.#online) return null;
    const due =
      immediate || this.#failures >= FAILURES_TO_OFFLINE || (this.#goodbye && this.#failures >= 1);
    return due ? this.#flip(false, now, immediate) : null;
  }

  #flip(online: boolean, now: number, force = false): Flip {
    if (!force && now - this.#flippedAt < MIN_FLIP_MS) return null;
    this.#online = online;
    this.#flippedAt = now;
    return online ? 'online' : 'offline';
  }
}
