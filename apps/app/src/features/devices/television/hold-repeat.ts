import type { TvPath } from '@smarteverything/domain';

export const HOLD_DELAY_MS = 400;

export const REPEAT_MS: Readonly<Record<TvPath, number>> = {
  direct: 250,
  smartthings: 600,
  ir: 600,
};

export interface HoldSource {
  readonly fire: (stop: () => void) => void;
  readonly rateMs: () => number | null;
  readonly held: () => void;
  readonly watchBackground: (onBackground: () => void) => () => void;
}

export class HoldRepeat {
  private delay: ReturnType<typeof setTimeout> | null = null;
  private every: ReturnType<typeof setInterval> | null = null;
  private unwatch: (() => void) | null = null;
  private repeated = false;

  constructor(private readonly source: HoldSource) {}

  pressIn(): void {
    this.cancel();
    const rate = this.source.rateMs();
    if (rate === null) {
      return;
    }
    this.unwatch = this.source.watchBackground(() => {
      this.cancel();
    });
    this.delay = setTimeout(() => {
      this.delay = null;
      this.repeated = true;
      this.every = setInterval(() => {
        this.fire();
      }, rate);
      this.source.held();
      this.fire();
    }, HOLD_DELAY_MS);
  }

  pressOut(): void {
    this.release();
  }

  press(): void {
    if (this.repeated) {
      this.repeated = false;
      return;
    }
    this.fire();
  }

  cancel(): void {
    this.release();
    this.repeated = false;
  }

  stop(): void {
    this.release();
  }

  private fire(): void {
    this.source.fire(() => {
      this.stop();
    });
  }

  private release(): void {
    if (this.delay !== null) {
      clearTimeout(this.delay);
      this.delay = null;
    }
    if (this.every !== null) {
      clearInterval(this.every);
      this.every = null;
    }
    if (this.unwatch !== null) {
      this.unwatch();
      this.unwatch = null;
    }
  }
}
