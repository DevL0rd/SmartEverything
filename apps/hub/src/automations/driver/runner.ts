import { background, failureLine } from '@smarteverything/logging';
import {
  abandonCleanup,
  cleanupGraceEnd,
  isCleaning,
  requestCancel,
} from '@smarteverything/flow/interpret/cancel';
import { FLOW_ERRORS } from '@smarteverything/flow/state/errors';
import { step } from '@smarteverything/flow/interpret/step';
import { resumeResult, wakeAt, wakeResume } from '@smarteverything/flow/interpret/waits';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type {
  EffectRequest,
  NodeResult,
  Outcome,
  StepEvent,
  StepRecord,
} from '@smarteverything/flow/interpret/frames';
import type {
  CancelReason,
  RunState,
  SingleWait,
  Wait,
} from '@smarteverything/flow/state/run-state';
import type { Logger } from '@smarteverything/logging';
import type { Cancel } from '../../clock';
import type { Ending, DriverPorts, RunKind, RunScope, RunStart } from './ports';
import type { Runnable, SliceEnd, SliceLimit } from './scheduler';

const SLOW_NODE_MS = 20;

const WATCHED: ReadonlySet<Wait['kind']> = new Set([
  'event',
  'condition',
  'answer',
  'refill',
  'breakpoint',
]);

type Phase = 'ready' | 'effect' | 'parked' | 'finished';

export interface RunHooks {
  readonly schedule: (run: LiveRun) => void;
  readonly parked: (run: LiveRun) => void;
  readonly finished: (run: LiveRun, ending: Ending) => void;
}

export interface RunDeps {
  readonly scope: RunScope;
  readonly ports: DriverPorts;
  readonly hooks: RunHooks;
  readonly log: Logger;
}

export class LiveRun implements Runnable {
  readonly runId: string;
  readonly automationId: string;
  readonly kind: RunKind;
  readonly name: string;
  private state: RunState;
  private readonly context: RunStart['context'];
  private phase: Phase = 'ready';
  private begun: boolean;
  private resolution: NodeResult | undefined;
  private records: StepRecord[] = [];
  private wakers: Cancel[] = [];
  private grace: Cancel | undefined;
  private unwinding = false;
  private effectToken = 0;
  private parkToken = 0;
  private slow = false;
  private hasHeld = false;
  private now = 0;
  private readonly scope: RunScope;
  private readonly ports: DriverPorts;
  private readonly hooks: RunHooks;
  private readonly log: Logger;

  constructor(start: RunStart, recovered: boolean, deps: RunDeps) {
    this.scope = deps.scope;
    this.ports = deps.ports;
    this.hooks = deps.hooks;
    this.log = deps.log;
    this.state = start.state;
    this.context = start.context;
    this.runId = start.state.runId;
    this.automationId = start.state.automationId;
    this.kind = start.kind;
    this.name = start.name;
    this.begun = recovered;
  }

  get held(): boolean {
    return this.hasHeld;
  }

  private get ready(): boolean {
    return this.phase === 'ready';
  }

  begin(): void {
    this.now = this.ports.clock.now().getTime();
    const { wait } = this.state;
    if (this.begun && wait !== undefined) this.park(wait, true);
    else this.hooks.schedule(this);
  }

  slice(limit: SliceLimit): SliceEnd {
    this.now = this.ports.clock.now().getTime();
    let steps = 0;
    while (this.ready) {
      steps += 1;
      if (this.advance() && limit.exhausted(steps)) {
        this.flushRecords();
        return 'ready';
      }
    }
    this.flushRecords();
    return 'idle';
  }

  crashed(cause: unknown): void {
    const error = FLOW_ERRORS.Failed(failureLine(cause), {
      node: this.automationId,
      path: 'driver',
      at: this.now,
    });
    this.finish({ status: 'failed', error });
  }

  cancel(reason: CancelReason): boolean {
    if (this.phase === 'finished' || isCleaning(this.state)) return false;
    this.now = this.ports.clock.now().getTime();
    this.state = requestCancel(this.state, reason, this.now);
    this.unwinding = true;
    this.interrupt();
    return true;
  }

  leave(): boolean {
    if (this.phase !== 'parked') return false;
    this.disarm();
    this.parkToken += 1;
    this.phase = 'finished';
    return true;
  }

  private interrupt(): void {
    if (this.phase === 'ready') return;
    this.disarm();
    this.effectToken += 1;
    this.parkToken += 1;
    this.resolution = undefined;
    this.phase = 'ready';
    this.hooks.schedule(this);
  }

  private nextEvent(): StepEvent {
    const { now } = this;
    if (!this.begun) {
      this.begun = true;
      return { kind: 'start', now };
    }
    const result = this.resolution;
    if (result === undefined) return { kind: 'run', now };
    this.resolution = undefined;
    return { kind: 'resolved', now, result };
  }

  private advance(): boolean {
    const before = this.state.frames.at(-1);
    const started = this.ports.monotonic();
    const result = step(this.context, this.state, this.nextEvent());
    this.noteSlow(started, before === undefined ? 'run' : `${before.path}:${String(before.pc)}`);
    this.state = result.state;
    this.records.push(...result.records);
    this.apply(result.outcome);
    this.watchCleanup();
    return this.phase === 'ready';
  }

  private noteSlow(started: number, nodePath: string): void {
    const ms = this.ports.monotonic() - started;
    if (ms <= SLOW_NODE_MS || this.slow) return;
    this.slow = true;
    this.log.warn('automation.slow_node', { runId: this.runId, nodePath, ms });
  }

  private apply(outcome: Outcome): void {
    switch (outcome.kind) {
      case 'continue':
        return;
      case 'effect':
        this.dispatch(outcome.request);
        return;
      case 'park':
        this.park(outcome.wait, false);
        return;
      case 'done':
        this.finish({ status: outcome.status, reason: outcome.reason, outputs: outcome.outputs });
        return;
      case 'failed':
        this.log.warn('automation.node_failed', {
          runId: this.runId,
          nodePath: outcome.error.path,
          class: outcome.error.class,
        });
        this.finish({ status: 'failed', error: outcome.error });
    }
  }

  private dispatch(request: EffectRequest): void {
    this.phase = 'effect';
    this.effectToken += 1;
    background(this.perform(this.effectToken, request), 'automation.effect_landing_failed', {
      runId: this.runId,
    });
  }

  private async perform(token: number, request: EffectRequest): Promise<void> {
    const result = await this.attempt(request);
    if (token === this.effectToken && this.phase === 'effect') {
      this.resolveWith(result);
      return;
    }
    this.ports.afterCancel(request, result, this.scope);
  }

  private async attempt(request: EffectRequest): Promise<NodeResult> {
    try {
      return await this.ports.perform(request, this.scope);
    } catch (cause) {
      this.log.error('automation.effect_crashed', cause, {
        runId: this.runId,
        nodePath: request.path,
      });
      return { ok: false, class: 'Failed', message: failureLine(cause) };
    }
  }

  private park(wait: Wait, recovered: boolean): void {
    this.phase = 'parked';
    this.parkToken += 1;
    const token = this.parkToken;
    const leaves = wait.kind === 'any' ? wait.waits : [wait];
    for (const leaf of leaves) this.arm(leaf, token, recovered);
    this.hasHeld = true;
    this.ports.sink.parked(this.state);
    this.hooks.parked(this);
    if (recovered) {
      const level = leaves.find((leaf) => leaf.kind === 'condition');
      if (level !== undefined) this.signalled(level, token, { kind: 'evaluate' });
    }
    this.log.debug('automation.run_parked', () => ({
      runId: this.runId,
      kind: wait.kind,
      wakeAt: wakeAt(wait),
    }));
  }

  private arm(wait: SingleWait, token: number, recovered: boolean): void {
    const due = wakeAt(wait);
    if (due !== undefined) {
      this.wakers.push(
        this.ports.clock.at(new Date(due), () => {
          this.woke(wait, token, recovered);
        }),
      );
    }
    if (WATCHED.has(wait.kind)) {
      this.wakers.push(
        this.ports.watch(
          wait,
          (resume) => {
            this.signalled(wait, token, resume);
          },
          this.scope,
        ),
      );
    }
  }

  private woke(wait: SingleWait, token: number, recovered: boolean): void {
    if (token !== this.parkToken || this.phase !== 'parked') return;
    const now = this.ports.clock.now().getTime();
    const resume = wakeResume(wait, now, recovered);
    if (resume === undefined) return;
    const due = wakeAt(wait);
    this.wakeUp(wait, resume, due === undefined ? 0 : Math.max(0, now - due));
  }

  private signalled(wait: SingleWait, token: number, resume: WaitResume): void {
    if (token !== this.parkToken || this.phase !== 'parked') return;
    this.wakeUp(wait, resume, 0);
  }

  private wakeUp(wait: SingleWait, resume: WaitResume, lateMs: number): void {
    this.disarm();
    this.ports.sink.resumed(this.state, lateMs);
    this.log.debug('automation.run_resumed', { runId: this.runId, lateMs });
    this.resolveWith(resumeResult(wait, resume));
  }

  private resolveWith(result: NodeResult): void {
    this.resolution = result;
    this.phase = 'ready';
    this.hooks.schedule(this);
  }

  private disarm(): void {
    for (const cancel of this.wakers) cancel();
    this.wakers = [];
  }

  private watchCleanup(): void {
    if (!this.unwinding) return;
    const end = cleanupGraceEnd(this.state);
    if (end === undefined) {
      this.grace?.();
      this.grace = undefined;
      return;
    }
    this.grace ??= this.ports.clock.at(new Date(end), () => {
      this.abandon();
    });
  }

  private abandon(): void {
    if (this.phase === 'finished') return;
    this.grace = undefined;
    this.now = this.ports.clock.now().getTime();
    this.log.warn('automation.cleanup_abandoned', { runId: this.runId });
    this.state = abandonCleanup(this.state, this.now);
    this.interrupt();
  }

  private flushRecords(): void {
    if (this.records.length === 0) return;
    const records = this.records;
    this.records = [];
    this.ports.sink.slice(this.runId, records);
  }

  private finish(ending: Ending): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.disarm();
    this.grace?.();
    this.grace = undefined;
    this.flushRecords();
    this.ports.sink.finished(this.state, ending, this.kind);
    this.report(ending);
    this.hooks.finished(this, ending);
  }

  private report(ending: Ending): void {
    const now = this.ports.clock.now().getTime();
    const error = ending.error?.message ?? null;
    const fields = { runId: this.runId, automationId: this.automationId, status: ending.status };
    if (ending.error?.class === 'BudgetExceeded') {
      this.log.warn('automation.budget_exceeded', { ...fields, nodePath: ending.error.path });
    }
    if (ending.status === 'failed') this.log.warn('automation.run_finished', fields);
    else this.log.info('automation.run_finished', fields);
    if (this.kind !== 'live') return;
    this.ports.recordRun({
      runId: this.runId,
      automationId: this.automationId,
      name: this.name,
      outcome: ending.status,
      durationMs: Math.max(0, now - this.state.budgets.startedAt),
      error,
    });
  }
}
