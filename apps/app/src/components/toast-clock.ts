export type ToastHold = 'hover' | 'touch' | 'focus';

interface Run {
  readonly remaining: number;
  readonly since: number;
  readonly timer: ReturnType<typeof setTimeout> | null;
  readonly holds: ReadonlySet<ToastHold>;
}

export class ToastClock {
  private readonly runs = new Map<number, Run>();

  constructor(private readonly expire: (id: number) => void) {}

  show(id: number, ms: number): void {
    if (!this.runs.has(id)) {
      this.tick(id, { remaining: ms, since: 0, timer: null, holds: new Set() });
    }
  }

  restart(id: number, ms: number): void {
    const run = this.runs.get(id);
    if (run !== undefined) {
      this.tick(id, { ...this.stopped(run), remaining: ms });
    }
  }

  hold(id: number, reason: ToastHold): void {
    const run = this.runs.get(id);
    if (run !== undefined) {
      this.runs.set(id, { ...this.paused(run), holds: new Set([...run.holds, reason]) });
    }
  }

  release(id: number, reason: ToastHold): void {
    const run = this.runs.get(id);
    if (run !== undefined) {
      const holds = new Set([...run.holds].filter((entry) => entry !== reason));
      this.tick(id, { ...run, holds });
    }
  }

  isHeld(id: number): boolean {
    return (this.runs.get(id)?.holds.size ?? 0) > 0;
  }

  forget(id: number): void {
    const run = this.runs.get(id);
    if (run !== undefined) {
      this.stopped(run);
    }
    this.runs.delete(id);
  }

  private tick(id: number, run: Run): void {
    if (run.holds.size > 0 || run.timer !== null) {
      this.runs.set(id, run);
      return;
    }
    const timer = setTimeout(() => {
      this.runs.delete(id);
      this.expire(id);
    }, run.remaining);
    this.runs.set(id, { ...run, since: Date.now(), timer });
  }

  private paused(run: Run): Run {
    if (run.timer === null) {
      return run;
    }
    const remaining = Math.max(0, run.remaining - (Date.now() - run.since));
    return { ...this.stopped(run), remaining };
  }

  private stopped(run: Run): Run {
    if (run.timer !== null) {
      clearTimeout(run.timer);
    }
    return { ...run, timer: null };
  }
}
