import {
  ApiError,
  AUTOMATION_TRACE_KEPT,
  type AutomationRunRow,
  type AutomationRunStatus,
  type AutomationRunStep,
  type CommandRow,
} from '@smarteverything/domain';
import { Logger, background, failureLine } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type {
  AutomationRunsRepository,
  NewAutomationRun,
} from '../store/repositories/automation-runs';
import type { RunHooks } from './run-context';

export interface RunPolicy {
  readonly mode: 'single' | 'restart' | 'queue' | 'parallel';
  readonly max: number | undefined;
}

export interface OwnedRunTask extends NewAutomationRun {
  readonly policy: RunPolicy;
  readonly admit?: () => void;
  readonly alive?: () => void;
  readonly parentSignal?: AbortSignal;
  readonly execute: (hooks: RunHooks) => Promise<string | null>;
}

export interface OwnedRunAdmission {
  readonly row: AutomationRunRow;
  readonly finished: Promise<string | null>;
}

interface PendingRun {
  readonly id: string;
  readonly task: OwnedRunTask;
  readonly controller: AbortController;
  readonly finish: (error: string | null) => void;
  readonly detachParent: () => void;
  readonly trace: AutomationRunStep[];
  readonly commandIds: string[];
  readonly queuedAt: number;
  running: boolean;
}

function concurrencyOf(policy: RunPolicy): number {
  if (policy.mode !== 'parallel') return 1;
  return policy.max ?? Infinity;
}

function terminalStatus(cancelled: boolean, error: string | null): AutomationRunStatus {
  if (cancelled) return 'cancelled';
  return error === null ? 'succeeded' : 'failed';
}

export class OwnedAutomationRuns {
  private readonly completions = new Map<string, Promise<string | null>>();
  private readonly pending = new Map<string, PendingRun>();
  private readonly reasons = new Map<string, string>();
  private readonly started = new Map<string, number>();
  private readonly stepStarted = new Map<string, number>();
  private stopped = false;
  private pumpingPaused = false;

  constructor(
    private readonly store: AutomationRunsRepository,
    private readonly clock: Clock,
    private readonly log: Logger = new Logger('hub.automations'),
  ) {
    store.interruptUnfinished();
    this.log.debug('automation.runs_ready', {});
  }

  start(task: OwnedRunTask): OwnedRunAdmission {
    if (this.stopped)
      throw new ApiError('conflict', 'The hub is stopping; no new automation runs can start.');
    task.admit?.();
    const row = this.store.create(task);
    const reason = this.refusal(task);
    const fields = {
      runId: row.id,
      automationId: task.automationId,
      revision: task.revision,
      parentRunId: task.parentRunId,
      mode: task.policy.mode,
      max: task.policy.max,
      active: this.target(task.automationId).length,
    };
    if (reason !== null) {
      this.log.info('automation.run_ignored', { ...fields, reason });
      return {
        row: this.store.update(row.id, {
          status: 'ignored',
          error: reason,
          finished_at: this.now(),
        }),
        finished: Promise.resolve(reason),
      };
    }
    this.log.debug('automation.run_admitted', fields);
    if (task.policy.mode === 'restart') this.cancelAutomation(task.automationId);
    const finished = new Promise<string | null>((finish) => {
      this.pending.set(row.id, this.pendingRun(row.id, task, finish));
    });
    this.completions.set(row.id, finished);
    if (task.parentSignal?.aborted === true) this.stop(row.id);
    this.pump(task.automationId);
    return { row: this.store.byId(row.id), finished };
  }

  stop(id: string): AutomationRunRow {
    const row = this.store.byId(id);
    const pending = this.pending.get(id);
    if (pending === undefined || pending.controller.signal.aborted) return row;
    this.cancel(pending, 'The automation run was cancelled.');
    return this.store.byId(id);
  }

  cancelAutomation(automationId: string, key?: string): void {
    this.pumpingPaused = true;
    for (const run of [...this.pending.values()]) {
      if (
        run.task.automationId === automationId &&
        (key === undefined || run.task.controlKey === key)
      )
        this.stop(run.id);
    }
    this.pumpingPaused = false;
  }

  revalidate(): void {
    for (const run of [...this.pending.values()]) {
      if (run.controller.signal.aborted) continue;
      try {
        run.task.alive?.();
      } catch (cause) {
        this.cancel(run, failureLine(cause));
      }
    }
  }

  shutdown(): void {
    this.stopped = true;
    for (const id of [...this.pending.keys()]) this.stop(id);
  }

  async settled(): Promise<void> {
    await Promise.all(this.completions.values());
  }

  private now(): string {
    return this.clock.now().toISOString();
  }

  private pendingRun(
    id: string,
    task: OwnedRunTask,
    finish: (error: string | null) => void,
  ): PendingRun {
    const cancelParent = (): void => {
      this.stop(id);
    };
    task.parentSignal?.addEventListener('abort', cancelParent, { once: true });
    return {
      id,
      task,
      controller: new AbortController(),
      finish,
      detachParent: (): void => {
        task.parentSignal?.removeEventListener('abort', cancelParent);
      },
      trace: [],
      commandIds: [],
      queuedAt: this.clock.now().getTime(),
      running: false,
    };
  }

  private target(automationId: string): PendingRun[] {
    return [...this.pending.values()].filter((run) => run.task.automationId === automationId);
  }

  private refusal(task: OwnedRunTask): string | null {
    const { mode, max } = task.policy;
    const runs = this.target(task.automationId);
    if (mode === 'single' && runs.length > 0)
      return 'Single mode ignored this occurrence because the automation is already running.';
    if (mode === 'parallel' && max !== undefined && runs.length >= max)
      return 'Parallel mode ignored this occurrence because its limit is reached.';
    if (mode === 'queue' && max !== undefined && runs.filter((run) => !run.running).length >= max)
      return 'Queue mode ignored this occurrence because its queue is full.';
    return null;
  }

  private pump(automationId: string): void {
    if (this.stopped || this.pumpingPaused) return;
    const runs = this.target(automationId);
    let running = runs.filter((run) => run.running).length;
    for (const run of runs.filter((entry) => !entry.running)) {
      if (running >= concurrencyOf(run.task.policy)) break;
      run.running = true;
      running += 1;
      background(this.execute(run), 'owned_runs.execute_failed');
    }
  }

  private hooks(run: PendingRun): RunHooks {
    return {
      runId: run.id,
      signal: run.controller.signal,
      begin: (nodeId): void => {
        this.stepStarted.set(run.id, this.clock.now().getTime());
        this.store.update(run.id, { current_node: nodeId });
      },
      end: (step): void => {
        if (step.status !== 'running') {
          this.log.debug('automation.step_finished', () => ({
            runId: run.id,
            automationId: run.task.automationId,
            nodeId: step.nodeId,
            status: step.status,
            commands: run.commandIds.length,
            error: step.error ?? undefined,
            durationMs: this.clock.now().getTime() - (this.stepStarted.get(run.id) ?? 0),
          }));
        }
        run.trace.push({ ...step, commandIds: run.commandIds.splice(0) });
        if (run.trace.length > AUTOMATION_TRACE_KEPT) run.trace.shift();
        this.store.update(run.id, { trace: run.trace });
      },
      commands: (rows: readonly CommandRow[]): void => {
        this.store.retainCommands(run.id, rows);
        run.commandIds.push(...rows.map((row) => row.id));
      },
    };
  }

  private async execute(run: PendingRun): Promise<void> {
    let error: string | null;
    const startedAt = this.clock.now().getTime();
    this.started.set(run.id, startedAt);
    this.log.debug('automation.run_started', {
      runId: run.id,
      automationId: run.task.automationId,
      waitedMs: startedAt - run.queuedAt,
    });
    try {
      run.task.alive?.();
      this.store.update(run.id, { status: 'running', started_at: this.now() });
      error = await run.task.execute(this.hooks(run));
    } catch (cause) {
      error = failureLine(cause);
    }
    this.complete(run, error);
  }

  private cancel(run: PendingRun, reason: string): void {
    this.reasons.set(run.id, reason);
    this.log.info('automation.run_cancelling', {
      runId: run.id,
      automationId: run.task.automationId,
      running: run.running,
      reason,
    });
    run.controller.abort();
    if (run.running) this.store.update(run.id, { status: 'cancelling', error: reason });
    else this.complete(run, reason);
  }

  private complete(run: PendingRun, error: string | null): void {
    run.detachParent();
    this.pending.delete(run.id);
    this.completions.delete(run.id);
    const cancelled = run.controller.signal.aborted;
    const outcome = cancelled ? (this.reasons.get(run.id) ?? null) : error;
    this.reasons.delete(run.id);
    this.stepStarted.delete(run.id);
    const status = terminalStatus(cancelled, error);
    const finishedAt = this.clock.now().getTime();
    const summary = {
      runId: run.id,
      automationId: run.task.automationId,
      status,
      steps: run.trace.length,
      waitedMs: (this.started.get(run.id) ?? finishedAt) - run.queuedAt,
      durationMs: finishedAt - (this.started.get(run.id) ?? finishedAt),
      error: outcome ?? undefined,
    };
    if (status === 'failed') this.log.warn('automation.run_finished', summary);
    else this.log.info('automation.run_finished', summary);
    this.started.delete(run.id);
    this.store.update(run.id, {
      status,
      current_node: null,
      error: outcome,
      finished_at: this.now(),
    });
    run.finish(outcome);
    this.pump(run.task.automationId);
  }
}
