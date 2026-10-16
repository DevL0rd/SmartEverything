import {
  ApiError,
  MAX_AUTOMATION_TRACE,
  type AutomationRunRow,
  type AutomationRunPolicy,
  type AutomationRunStatus,
  type AutomationRunStep,
  type AutomationSequenceRow,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import { describeError } from '../commands/executor';
import type {
  AutomationRunsRepository,
  NewAutomationRun,
} from '../store/repositories/automation-runs';
import type { ActionExecutionContext } from './run-context';

export interface OwnedRunTask extends NewAutomationRun {
  readonly validate: () => void;
  readonly parentSignal?: AbortSignal;
  readonly execute: (context: ActionExecutionContext) => Promise<string | null>;
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
  readonly trace: AutomationRunStep[];
  running: boolean;
  cancelReason: string | null;
  currentNode: string | null;
  readonly detachParent: () => void;
}

function concurrencyOf(policy: AutomationRunPolicy | undefined): number {
  if (policy === undefined) return Infinity;
  return policy.mode === 'parallel' ? policy.limit : 1;
}

function terminalStatus(cancelled: boolean, error: string | null): AutomationRunStatus {
  if (cancelled) return 'cancelled';
  return error === null ? 'succeeded' : 'failed';
}

export class OwnedAutomationRuns {
  private readonly completions = new Map<string, Promise<string | null>>();
  private readonly pending = new Map<string, PendingRun>();
  private stopped = false;
  private pumpingPaused = false;

  constructor(
    private readonly store: AutomationRunsRepository,
    private readonly clock: Clock,
  ) {
    store.interruptUnfinished();
  }

  start(task: OwnedRunTask): OwnedRunAdmission {
    if (this.stopped)
      throw new ApiError('conflict', 'The hub is stopping; no new automation runs can start.');
    task.validate();
    const row = this.store.create(task);
    const reason = this.refusal(task);
    if (reason !== null)
      return {
        row: this.store.update(row.id, {
          status: 'ignored',
          error: reason,
          finished_at: this.now(),
        }),
        finished: Promise.resolve(reason),
      };
    if (task.definition.runPolicy?.mode === 'restart') this.cancelTarget(task.automationId);
    const finished = new Promise<string | null>((finish) => {
      const controller = new AbortController();
      const cancelParent = (): void => {
        this.stop(row.id);
      };
      task.parentSignal?.addEventListener('abort', cancelParent, { once: true });
      this.pending.set(row.id, {
        id: row.id,
        task,
        controller,
        detachParent: (): void => {
          task.parentSignal?.removeEventListener('abort', cancelParent);
        },
        finish,
        trace: [],
        running: false,
        cancelReason: null,
        currentNode: null,
      });
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

  cancelTarget(automationId: string, controlKey?: string): void {
    this.pumpingPaused = true;
    for (const run of [...this.pending.values()]) {
      if (
        run.task.automationId === automationId &&
        (controlKey === undefined || run.task.definition.controlKey === controlKey)
      )
        this.stop(run.id);
    }
    this.pumpingPaused = false;
  }

  revalidate(): void {
    for (const run of [...this.pending.values()]) {
      if (run.controller.signal.aborted) continue;
      try {
        run.task.validate();
      } catch (cause) {
        this.cancel(run, describeError(cause));
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

  private target(automationId: string): PendingRun[] {
    return [...this.pending.values()].filter((run) => run.task.automationId === automationId);
  }

  private refusal(task: OwnedRunTask): string | null {
    const policy = task.definition.runPolicy;
    const runs = this.target(task.automationId);
    if (policy?.mode === 'single' && runs.length > 0)
      return 'Single policy ignored this occurrence because an automation run is active.';
    if (policy?.mode === 'parallel' && runs.length >= policy.limit)
      return 'Parallel policy ignored this occurrence because its concurrency limit is reached.';
    if (policy?.mode === 'queue' && runs.filter((run) => !run.running).length >= policy.limit)
      return 'Queue policy ignored this occurrence because its FIFO queue is full.';
    return null;
  }

  private pump(automationId: string): void {
    if (this.stopped || this.pumpingPaused) return;
    const runs = this.target(automationId);
    let running = runs.filter((run) => run.running).length;
    for (const run of runs.filter((entry) => !entry.running)) {
      const policy = run.task.definition.runPolicy;
      const limit = concurrencyOf(policy);
      if (running >= limit) break;
      run.running = true;
      running += 1;
      void this.execute(run);
    }
  }

  private context(run: PendingRun): ActionExecutionContext {
    return {
      runId: run.id,
      ownerProfileId: run.task.ownerProfileId,
      signal: run.controller.signal,
      authorize: run.task.validate,
      sequence: (id): AutomationSequenceRow => {
        const sequence = run.task.sequences?.get(id);
        if (sequence === undefined)
          throw new ApiError('conflict', 'Sequence was not included in the admitted run snapshot.');
        return sequence;
      },
      sceneActions: (id) => run.task.references[id],
      step: (node, status, error): void => {
        const nodeId =
          typeof node === 'string'
            ? node
            : `${run.task.automationId}:${run.task.revision}:${String(node)}`;
        const index = run.trace.findLastIndex(
          (entry) => entry.nodeId === nodeId && entry.status === 'running',
        );
        const previous = run.trace[index];
        const step = { nodeId, status, error, commandIds: previous?.commandIds ?? [] };
        if (status === 'running' || previous === undefined)
          run.trace.push({ ...step, commandIds: [] });
        else run.trace.splice(index, 1, step);
        const active = run;
        active.currentNode = nodeId;
        if (run.trace.length > MAX_AUTOMATION_TRACE) run.trace.shift();
        this.store.update(run.id, { current_node: nodeId, trace: run.trace });
      },
      commands: (rows): void => {
        this.store.retainCommands(run.id, rows);
        const index = run.trace.findLastIndex(
          (entry) => entry.nodeId === run.currentNode && entry.status === 'running',
        );
        const current = run.trace[index];
        if (current === undefined)
          throw new ApiError('conflict', 'An automation command has no owning step.');
        run.trace.splice(index, 1, {
          ...current,
          commandIds: [...current.commandIds, ...rows.map((row) => row.id)].slice(
            -MAX_AUTOMATION_TRACE,
          ),
        });
        this.store.update(run.id, { trace: run.trace });
      },
    };
  }

  private async execute(run: PendingRun): Promise<void> {
    let error: string | null;
    try {
      run.task.validate();
      this.store.update(run.id, { status: 'running', started_at: this.now() });
      error = await run.task.execute(this.context(run));
    } catch (cause) {
      error = describeError(cause);
    }
    this.complete(run, error);
  }

  private cancel(run: PendingRun, reason: string): void {
    const active = run;
    active.cancelReason = reason;
    run.controller.abort();
    if (run.running) this.store.update(run.id, { status: 'cancelling', error: reason });
    else this.complete(run, reason);
  }

  private complete(run: PendingRun, error: string | null): void {
    run.detachParent();
    this.pending.delete(run.id);
    this.completions.delete(run.id);
    const cancelled = run.controller.signal.aborted;
    this.store.update(run.id, {
      status: terminalStatus(cancelled, error),
      current_node: null,
      error: cancelled ? run.cancelReason : error,
      finished_at: this.now(),
    });
    run.finish(cancelled ? run.cancelReason : error);
    this.pump(run.task.automationId);
  }
}
