export const REPLY_GRACE_MS = 6000;

export interface IdleDecision {
  readonly idleMs: number;
  readonly sinceSpeechMs: number;
  readonly sinceModelMs: number;
  readonly speechTurns: number;
}

export class IdleClock {
  private speechAt: number;
  private modelAt: number;
  private speaking = false;
  private turns = 0;

  constructor(private readonly now: () => number) {
    this.speechAt = now();
    this.modelAt = this.speechAt;
  }

  person(speaking: boolean): void {
    if (speaking && !this.speaking) {
      this.turns += 1;
    }
    this.speaking = speaking;
    this.speechAt = this.now();
  }

  heard(): void {
    this.speechAt = this.now();
  }

  model(): void {
    this.modelAt = this.now();
  }

  expired(idleMs: number): IdleDecision | null {
    if (this.speaking) {
      return null;
    }
    const now = this.now();
    const sinceSpeechMs = now - this.speechAt;
    const sinceModelMs = now - this.modelAt;
    if (sinceSpeechMs <= idleMs || sinceModelMs <= Math.max(idleMs, REPLY_GRACE_MS)) {
      return null;
    }
    return { idleMs, sinceSpeechMs, sinceModelMs, speechTurns: this.turns };
  }
}
