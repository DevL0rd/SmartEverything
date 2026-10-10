import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import { ScheduleBook } from './book';
import { Scheduler } from './scheduler';
import { StepRunner, type AiTurns } from './steps';

export interface SchedulesOptions {
  readonly store: Store;
  readonly tools: ToolHub;
  readonly ai: AiTurns | null;
  readonly clock: Clock;
  readonly log: Logger;
}

export interface Schedules {
  readonly book: ScheduleBook;
  readonly scheduler: Scheduler;
}

export function startSchedules(options: SchedulesOptions): Schedules {
  const book = new ScheduleBook(options.store, options.tools, options.clock, options.ai !== null);
  const scheduler = new Scheduler({
    store: options.store,
    steps: new StepRunner(options.tools, options.store, options.ai),
    clock: options.clock,
    log: options.log.forArea('hub.schedules'),
  });
  scheduler.start();
  return { book, scheduler };
}
