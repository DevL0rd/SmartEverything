import type { Cancel, Clock } from '../../src/clock';

interface Timer {
  readonly at: number;
  readonly action: () => void;
  cancelled: boolean;
}

export class FakeClock implements Clock {
  private current: number;
  private readonly timers: Timer[] = [];
  readonly sleeps: number[] = [];

  constructor(start: string) {
    this.current = Date.parse(start);
  }

  now = (): Date => new Date(this.current);

  at = (moment: Date, action: () => void): Cancel => {
    const timer: Timer = { at: moment.getTime(), action, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  sleep = (milliseconds: number): Promise<void> => {
    this.sleeps.push(milliseconds);
    return Promise.resolve();
  };

  pending(): string[] {
    return this.timers
      .filter((timer) => !timer.cancelled)
      .map((timer) => new Date(timer.at).toISOString())
      .sort();
  }

  advanceTo(iso: string): void {
    const target = Date.parse(iso);
    for (;;) {
      const due = this.timers
        .filter((timer) => !timer.cancelled && timer.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (due === undefined) {
        this.current = target;
        return;
      }
      due.cancelled = true;
      this.current = due.at;
      due.action();
    }
  }
}
