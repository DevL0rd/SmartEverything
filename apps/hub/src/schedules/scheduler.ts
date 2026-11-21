import {
  ApiError,
  SCHEDULE_LIMITS,
  isScheduleActive,
  type ScheduleRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { stepLineOf } from './book';
import { finalStateOf, missedRun, resultOf, withResults } from './results';
import type { StepRunner } from './steps';
import { background } from '@smarteverything/logging';

const DAY_MS = 86_400_000;

export interface SchedulerOptions {
  readonly store: Store;
  readonly steps: StepRunner;
  readonly clock: Clock;
  readonly log: Logger;
}

interface Run {
  readonly row: ScheduleRow;
  readonly lateMs: number;
}

function lastDue(row: ScheduleRow, now: number): number {
  let index = row.occurrence;
  row.occurrences.forEach((at, candidate) => {
    if (candidate > index && Date.parse(at) <= now) {
      index = candidate;
    }
  });
  return index;
}

export class Scheduler {
  private cancel: Cancel | null = null;
  private armedFor: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly active = new Set<string>();
  private arming: Promise<void> = Promise.resolve();

  constructor(private readonly options: SchedulerOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'scheduled_actions') {
        this.arm();
      }
    });
    background(this.started(), 'scheduler.start_failed');
  }

  private async started(): Promise<void> {
    await this.purge();
    for (const row of await this.options.store.host.call('schedules', 'interrupted')) {
      background(this.resume(row), 'scheduler.resume_failed');
    }
    this.arm();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancel?.();
    this.cancel = null;
    this.armedFor = null;
  }

  async runNow(row: ScheduleRow): Promise<ScheduleRow> {
    if (row.state !== 'scheduled' && row.state !== 'waiting') {
      throw new ApiError('conflict', 'Only an action that is waiting to run can run now.');
    }
    return await this.options.store.host.call('schedules', 'update', row.id, {
      nextAt: this.options.clock.now().toISOString(),
    });
  }

  runStepAgain(row: ScheduleRow, index: number): ScheduleRow {
    const step = row.steps[index];
    if (step === undefined || step.kind === 'wait') {
      throw new ApiError('invalid_request', `Step ${String(index + 1)} is not a step that runs.`);
    }
    if (row.state === 'running' || this.active.has(row.id)) {
      throw new ApiError('conflict', 'It is running right now; try again when it has finished.');
    }
    void this.options.steps
      .run(step, row, stepLineOf(row, index))
      .then(async (outcome) => {
        const fresh = await this.options.store.host.call('schedules', 'byId', row.id);
        const results = withResults(fresh.results, [
          resultOf({
            occurrence: fresh.occurrence,
            step: index,
            at: this.options.clock.now(),
            outcome,
            lateMs: 0,
          }),
        ]);
        await this.options.store.host.call('schedules', 'update', row.id, {
          results,
          ...(isScheduleActive(fresh.state) ? {} : { state: finalStateOf(results) }),
        });
      })
      .catch((cause: unknown) => {
        this.options.log.error('schedule.step_again_failed', cause, { scheduleId: row.id });
      });
    return row;
  }

  async cancelRun(row: ScheduleRow): Promise<ScheduleRow> {
    if (!isScheduleActive(row.state)) {
      throw new ApiError('conflict', 'It has already finished.');
    }
    return await this.options.store.host.call('schedules', 'update', row.id, {
      state: 'cancelled',
      nextAt: null,
      finishedAt: this.options.clock.now().toISOString(),
    });
  }

  private arm(): void {
    this.arming = this.arming
      .then(() => this.armed())
      .catch((cause: unknown) => {
        this.options.log.error('schedule.arm_failed', cause);
      });
  }

  private async armed(): Promise<void> {
    const next = await this.options.store.host.call('schedules', 'nextDueAt');
    if (next === this.armedFor) {
      return;
    }
    this.cancel?.();
    this.cancel = null;
    this.armedFor = next;
    if (next === null) {
      return;
    }
    if (Date.parse(next) <= this.options.clock.now().getTime()) {
      this.armedFor = null;
      background(this.fire(), 'scheduler.fire_failed');
      return;
    }
    this.cancel = this.options.clock.at(new Date(next), () => {
      this.cancel = null;
      this.armedFor = null;
      background(this.fire(), 'scheduler.fire_failed');
    });
  }

  private async fire(): Promise<void> {
    await this.purge();
    const now = this.options.clock.now();
    for (const row of await this.options.store.host.call('schedules', 'due', now.toISOString())) {
      background(this.begin(row, now), 'scheduler.begin_failed');
    }
    this.arm();
  }

  private async begin(row: ScheduleRow, now: Date): Promise<void> {
    if (this.active.has(row.id) || row.next_at === null) {
      return;
    }
    const waiting = row.state === 'waiting';
    const occurrence = waiting ? row.occurrence : lastDue(row, now.getTime());
    const skipped = occurrence - row.occurrence;
    const dueAt = skipped > 0 ? (row.occurrences[occurrence] ?? row.next_at) : row.next_at;
    const lateMs = Math.max(0, now.getTime() - Date.parse(dueAt));
    const claimed = await this.options.store.host.call('schedules', 'update', row.id, {
      state: 'running',
      occurrence,
      step: waiting ? row.step : 0,
      ...(skipped > 0
        ? { results: withResults(row.results, [missedRun(row.occurrence, skipped, now)]) }
        : {}),
    });
    await this.run({ row: claimed, lateMs });
  }

  private async resume(row: ScheduleRow): Promise<void> {
    const step = row.steps[row.step];
    const lateMs = Math.max(0, this.options.clock.now().getTime() - Date.parse(row.updated_at));
    if (step === undefined || (await this.options.steps.isRepeatable(step))) {
      await this.run({ row, lateMs });
      return;
    }
    const interrupted = resultOf({
      occurrence: row.occurrence,
      step: row.step,
      at: this.options.clock.now(),
      outcome: {
        outcome: 'failed',
        line: stepLineOf(row, row.step),
        detail: 'Interrupted by a restart and not run again. Use Run now to run it.',
      },
      lateMs,
      as: 'interrupted',
    });
    const next = await this.options.store.host.call('schedules', 'update', row.id, {
      step: row.step + 1,
      results: withResults(row.results, [interrupted]),
    });
    await this.run({ row: next, lateMs });
  }

  private async run(run: Run): Promise<void> {
    const id = run.row.id;
    this.active.add(id);
    try {
      let index: number | null = run.row.step;
      while (index !== null && index < run.row.steps.length) {
        index = await this.runStep(id, index, run.lateMs);
      }
      if (index === null) {
        return;
      }
      await this.finishOccurrence(id);
    } catch (cause) {
      this.options.log.error('schedule.run_failed', cause, { scheduleId: id });
      await this.options.store.host.call('schedules', 'update', id, {
        state: 'failed',
        nextAt: null,
        finishedAt: this.options.clock.now().toISOString(),
      });
    } finally {
      this.active.delete(id);
    }
  }

  private async runStep(id: string, index: number, lateMs: number): Promise<number | null> {
    const { store, clock } = this.options;
    const row = await store.host.call('schedules', 'byId', id);
    const step = row.steps[index];
    if (row.state !== 'running' || step === undefined) {
      return null;
    }
    if (step.kind === 'wait') {
      await store.host.call('schedules', 'update', id, {
        state: 'waiting',
        step: index + 1,
        nextAt: new Date(clock.now().getTime() + step.seconds * 1000).toISOString(),
      });
      return null;
    }
    const outcome = await this.options.steps.run(step, row, stepLineOf(row, index));
    const fresh = await store.host.call('schedules', 'byId', id);
    const result = resultOf({
      occurrence: fresh.occurrence,
      step: index,
      at: clock.now(),
      outcome,
      lateMs,
    });
    const next = outcome.outcome === 'failed' && step.stopOnFailure ? row.steps.length : index + 1;
    await store.host.call('schedules', 'update', id, {
      step: next,
      results: withResults(fresh.results, [result]),
    });
    return next;
  }

  private async finishOccurrence(id: string): Promise<void> {
    const { store, clock } = this.options;
    const row = await store.host.call('schedules', 'byId', id);
    if (row.state !== 'running') {
      return;
    }
    const next = row.occurrence + 1;
    const nextAt = row.occurrences[next];
    if (nextAt !== undefined) {
      await store.host.call('schedules', 'update', id, {
        state: 'scheduled',
        occurrence: next,
        step: 0,
        nextAt,
      });
      return;
    }
    await store.host.call('schedules', 'update', id, {
      state: finalStateOf(row.results),
      nextAt: null,
      finishedAt: clock.now().toISOString(),
    });
  }

  private async purge(): Promise<void> {
    const before = new Date(
      this.options.clock.now().getTime() - SCHEDULE_LIMITS.keepFinishedDays * DAY_MS,
    );
    const removed = await this.options.store.host.call(
      'schedules',
      'purgeFinished',
      before.toISOString(),
    );
    if (removed > 0) {
      this.options.log.info('schedule.purged', { removed });
    }
  }
}
