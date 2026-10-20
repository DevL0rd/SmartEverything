import { Logger } from '@smarteverything/logging';

export const SLICE_STEPS = 256;

const SLICE_MILLISECONDS = 4;

export type SliceEnd = 'ready' | 'idle';

export interface SliceLimit {
  readonly exhausted: (steps: number) => boolean;
}

export interface Runnable {
  readonly slice: (limit: SliceLimit) => SliceEnd;
  readonly crashed: (cause: unknown) => void;
}

export interface SchedulerOptions {
  readonly monotonic: () => number;
  readonly yieldNow?: (resume: () => void) => void;
  readonly log?: Logger;
}

export class Scheduler {
  private readonly queue: Runnable[] = [];
  private readonly queued = new Set<Runnable>();
  private readonly log: Logger;
  private readonly yieldNow: (resume: () => void) => void;
  private pumping = false;

  constructor(private readonly options: SchedulerOptions) {
    this.log = options.log ?? new Logger('hub.automations');
    this.yieldNow = options.yieldNow ?? ((resume): void => void setImmediate(resume));
  }

  get waiting(): number {
    return this.queue.length;
  }

  schedule(runnable: Runnable): void {
    if (this.queued.has(runnable)) return;
    this.queued.add(runnable);
    this.queue.push(runnable);
    this.wake();
  }

  private wake(): void {
    if (this.pumping) return;
    this.pumping = true;
    this.yieldNow(() => {
      this.pump();
    });
  }

  private pump(): void {
    const runnable = this.queue.shift();
    if (runnable === undefined) {
      this.pumping = false;
      return;
    }
    this.queued.delete(runnable);
    if (this.runSlice(runnable) === 'ready') this.schedule(runnable);
    if (this.queue.length === 0) {
      this.pumping = false;
      return;
    }
    this.yieldNow(() => {
      this.pump();
    });
  }

  private runSlice(runnable: Runnable): SliceEnd {
    const started = this.options.monotonic();
    const limit: SliceLimit = {
      exhausted: (steps) =>
        steps >= SLICE_STEPS || this.options.monotonic() - started >= SLICE_MILLISECONDS,
    };
    try {
      return runnable.slice(limit);
    } catch (cause) {
      this.log.error('automation.slice_crashed', cause);
      try {
        runnable.crashed(cause);
      } catch (fault) {
        this.log.error('automation.crash_handler_failed', fault);
      }
      return 'idle';
    }
  }
}
