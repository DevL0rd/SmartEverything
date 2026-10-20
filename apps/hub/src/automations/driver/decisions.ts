import type { AutomationDecision } from '@smarteverything/domain';
import { DECISION_WINDOW_MS } from '../../store/repositories/automation-decisions';
import type { DroppedRun } from '../../store/repositories/automation-decisions';
import type { Clock } from '../../clock';

export type DecisionReason = AutomationDecision['reason'];

export interface DecisionLog {
  readonly record: (dropped: DroppedRun) => void;
}

export const REFUSAL_MESSAGES: Readonly<Record<DecisionReason, string>> = {
  admit_false: 'The automation was not started because its admission condition is false.',
  single_busy: 'Single mode ignored this occurrence because the automation is already running.',
  queue_full: 'Queue mode ignored this occurrence because its queue is full.',
  parallel_full: 'Parallel mode ignored this occurrence because its limit is reached.',
  stale: 'The occurrence waited longer than the allowed wait and was dropped.',
  storm: 'The automation was started too often and this occurrence was dropped.',
  feedback: 'The automation would be started by its own changes and this occurrence was dropped.',
};

export interface PendingDecision {
  readonly reason: DecisionReason;
  readonly windowStart: string;
  readonly count: number;
  readonly lastAt: string;
}

interface Window {
  readonly automationId: string;
  readonly reason: DecisionReason;
  readonly start: number;
  pending: number;
  lastAt: number;
  detail: AutomationDecision['detail'] | undefined;
  timer: NodeJS.Timeout | undefined;
}

export class Decisions {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly log: DecisionLog,
    private readonly clock: Pick<Clock, 'now'>,
  ) {}

  record(
    automationId: string,
    reason: DecisionReason,
    detail?: AutomationDecision['detail'],
  ): void {
    const now = this.clock.now().getTime();
    const start = now - (now % DECISION_WINDOW_MS);
    const key = `${automationId}|${reason}`;
    this.sweep(start);
    const held = this.windows.get(key);
    if (held?.start === start) {
      held.pending += 1;
      held.lastAt = now;
      return;
    }
    if (held !== undefined) this.close(key, held);
    const opened: Window = {
      automationId,
      reason,
      start,
      pending: 0,
      lastAt: now,
      detail,
      timer: undefined,
    };
    opened.timer = setTimeout(
      () => {
        if (this.windows.get(key) === opened) this.close(key, opened);
      },
      start + DECISION_WINDOW_MS - now + 1,
    );
    opened.timer.unref();
    this.windows.set(key, opened);
    this.log.record({
      automationId,
      reason,
      at: new Date(now).toISOString(),
      ...(detail === undefined ? {} : { detail }),
    });
  }

  pending(automationId: string): readonly PendingDecision[] {
    return [...this.windows.values()]
      .filter((held) => held.automationId === automationId && held.pending > 0)
      .map((held) => ({
        reason: held.reason,
        windowStart: new Date(held.start).toISOString(),
        count: held.pending,
        lastAt: new Date(held.lastAt).toISOString(),
      }));
  }

  flush(): void {
    for (const [key, held] of [...this.windows]) this.close(key, held);
  }

  private sweep(start: number): void {
    for (const [key, held] of [...this.windows]) {
      if (held.start < start) this.close(key, held);
    }
  }

  private close(key: string, held: Window): void {
    if (held.timer !== undefined) clearTimeout(held.timer);
    this.windows.delete(key);
    this.write(held);
  }

  private write(held: Window): void {
    if (held.pending === 0) return;
    this.log.record({
      automationId: held.automationId,
      reason: held.reason,
      at: new Date(held.lastAt).toISOString(),
      times: held.pending,
      ...(held.detail === undefined ? {} : { detail: held.detail }),
    });
  }
}
