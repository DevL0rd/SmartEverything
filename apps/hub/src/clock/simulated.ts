import type { Cancel, Clock } from './index';

interface Timer {
  readonly at: number;
  readonly action: () => void;
  cancelled: boolean;
}

export class SimulatedClock implements Clock {
  private current: number;
  private highest: number;
  private timers: Timer[] = [];
  readonly sleeps: number[] = [];

  constructor(start: string) {
    this.current = Date.parse(start);
    this.highest = this.current;
  }

  latest = (): number => this.highest;

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
    return this.live()
      .map((timer) => new Date(timer.at).toISOString())
      .sort();
  }

  nextDue(): number | undefined {
    return this.live().reduce<number | undefined>(
      (earliest, timer) => (earliest === undefined ? timer.at : Math.min(earliest, timer.at)),
      undefined,
    );
  }

  jumpTo(iso: string): void {
    this.current = Date.parse(iso);
    this.highest = Math.max(this.highest, this.current);
  }

  advanceTo(iso: string): void {
    const target = Date.parse(iso);
    for (;;) {
      const due = this.live()
        .filter((timer) => timer.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (due === undefined) {
        this.current = Math.max(this.current, target);
        this.highest = Math.max(this.highest, this.current);
        return;
      }
      due.cancelled = true;
      this.current = Math.max(this.current, due.at);
      this.highest = Math.max(this.highest, this.current);
      due.action();
    }
  }

  private live(): Timer[] {
    this.timers = this.timers.filter((timer) => !timer.cancelled);
    return this.timers;
  }
}
