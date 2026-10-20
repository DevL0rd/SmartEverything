import { ApiError } from '@smarteverything/domain';
import type { SignalInput } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { fullBucket, refilled } from '@smarteverything/flow/state/budgets';
import type { Bucket, BucketRate, BudgetLimits } from '@smarteverything/flow/state/budgets';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { Clock } from '../../clock';
import { Decisions, REFUSAL_MESSAGES } from './decisions';
import type { DecisionLog, DecisionReason, PendingDecision } from './decisions';
import { RunCancels } from './cancel';
import { FirstHolds } from './first-holds';
import { ModeBook, bookIdOf } from './modes';
import type { ModePolicy, Ticket } from './modes';
import type { DriverPorts, RunStart } from './ports';
import { LiveRun } from './runner';
import { Scheduler } from './scheduler';
import type { CancelReason } from '@smarteverything/flow/state/run-state';

const START_BUCKET: BucketRate = { burst: 10, perMinute: 30 };

const FEEDBACK_REPEATS = 3;

const STORM_LOG_INTERVAL_MS = 60_000;

export interface CauseLink {
  readonly automationId: string;
  readonly runId: string;
}

export interface Occurrence {
  readonly automationId: string;
  readonly name: string;
  readonly policy: ModePolicy;
  readonly limits: Pick<BudgetLimits, 'startBucket' | 'feedback'>;
  readonly startRate?: BucketRate | undefined;
  readonly trigger: SignalInput | null;
  readonly causeChain: readonly CauseLink[];
  readonly manual: boolean;
  readonly urgent: boolean;
  readonly startedBy: string | null;
  readonly admit?: ((trigger: SignalInput | null) => Checked<boolean>) | undefined;
  readonly start: (runId: string) => RunStart;
}

export type Verdict =
  { readonly admitted: true } | { readonly admitted: false; readonly reason: DecisionReason };

const ADMITTED: Verdict = { admitted: true };

function refusedFor(reason: DecisionReason): Verdict {
  return { admitted: false, reason };
}

export class Admission {
  private readonly buckets = new Map<string, Bucket>();
  private readonly stormLogged = new Map<string, number>();

  constructor(
    private readonly clock: Pick<Clock, 'now'>,
    private readonly decisions: Decisions,
    private readonly onStorm: (automationId: string, name: string) => void,
    private readonly log: Logger = new Logger('hub.automations'),
  ) {}

  check(occurrence: Occurrence): Verdict {
    const verdict =
      this.storm(occurrence) ?? this.feedback(occurrence) ?? this.admit(occurrence) ?? ADMITTED;
    if (!verdict.admitted) this.decisions.record(occurrence.automationId, verdict.reason);
    return verdict;
  }

  forget(automationId: string): void {
    this.buckets.delete(automationId);
    this.stormLogged.delete(automationId);
  }

  private storm(occurrence: Occurrence): Verdict | null {
    if (!occurrence.limits.startBucket || occurrence.manual || occurrence.urgent) return null;
    const now = this.clock.now().getTime();
    const rate = occurrence.startRate ?? START_BUCKET;
    const held = this.buckets.get(occurrence.automationId) ?? fullBucket(rate, now);
    const bucket = refilled(held, rate, now);
    if (bucket.tokens >= 1) {
      this.buckets.set(occurrence.automationId, { ...bucket, tokens: bucket.tokens - 1 });
      return null;
    }
    this.buckets.set(occurrence.automationId, bucket);
    this.announceStorm(occurrence, now);
    return refusedFor('storm');
  }

  private announceStorm(occurrence: Occurrence, now: number): void {
    const last = this.stormLogged.get(occurrence.automationId);
    if (last !== undefined && now - last < STORM_LOG_INTERVAL_MS) return;
    this.stormLogged.set(occurrence.automationId, now);
    this.log.warn('automation.storm', { automationId: occurrence.automationId });
    this.onStorm(occurrence.automationId, occurrence.name);
  }

  private feedback(occurrence: Occurrence): Verdict | null {
    if (!occurrence.limits.feedback) return null;
    const repeats = occurrence.causeChain.filter(
      (link) => link.automationId === occurrence.automationId,
    ).length;
    if (repeats < FEEDBACK_REPEATS) return null;
    this.log.warn('automation.feedback_refused', {
      automationId: occurrence.automationId,
      repeats,
    });
    return refusedFor('feedback');
  }

  private admit(occurrence: Occurrence): Verdict | null {
    if (occurrence.admit === undefined) return null;
    const admitted = occurrence.admit(occurrence.trigger);
    if (admitted.ok && admitted.value) return null;
    if (!admitted.ok) {
      this.log.warn('automation.admit_failed', {
        automationId: occurrence.automationId,
        class: admitted.class,
      });
    }
    return refusedFor('admit_false');
  }
}

export type Submission =
  | { readonly kind: 'started'; readonly runId: string }
  | { readonly kind: 'queued'; readonly runId: string }
  | { readonly kind: 'refused'; readonly reason: DecisionReason; readonly error: ApiError };

export interface DriverOptions {
  readonly ports: DriverPorts;
  readonly decisions: DecisionLog;
  readonly log?: Logger;
  readonly yieldNow?: (resume: () => void) => void;
}

interface Owner {
  readonly automationId: string;
  readonly key: string | undefined;
  readonly bookId: string;
}

function ownerOf(automationId: string, key: string | undefined): Owner {
  return { automationId, key, bookId: bookIdOf(automationId, key) };
}

function once<T>(make: () => T): () => T {
  let held: T | undefined;
  return () => (held ??= make());
}

export class RunDriver {
  private readonly scheduler: Scheduler;
  private readonly cancels = new RunCancels();
  private readonly holds = new FirstHolds();
  private readonly modes = new ModeBook<() => RunStart>();
  private readonly decisions: Decisions;
  private readonly admission: Admission;
  private readonly runs = new Map<string, LiveRun>();
  private readonly owners = new Map<string, Owner>();
  private readonly log: Logger;
  private readonly ports: DriverPorts;
  private stopped = false;
  private readonly idle: (() => void)[] = [];

  constructor(options: DriverOptions) {
    this.ports = options.ports;
    this.log = options.log ?? new Logger('hub.automations');
    this.decisions = new Decisions(options.decisions, this.ports.clock);
    this.admission = new Admission(this.ports.clock, this.decisions, this.ports.storm, this.log);
    this.scheduler = new Scheduler({
      monotonic: this.ports.monotonic,
      log: this.log,
      ...(options.yieldNow === undefined ? {} : { yieldNow: options.yieldNow }),
    });
  }

  get active(): number {
    return this.runs.size;
  }

  submit(occurrence: Occurrence): Submission {
    if (this.stopped)
      throw new ApiError('conflict', 'The hub is stopping; no new automation runs can start.');
    const verdict = this.admission.check(occurrence);
    if (!verdict.admitted) return this.refuse(occurrence, verdict.reason);
    const runId = this.ports.ids();
    const payload = once(() => occurrence.start(runId));
    const owner = ownerOf(occurrence.automationId, occurrence.policy.key);
    const mode = this.modes.request(
      owner.bookId,
      { runId, payload },
      occurrence.policy,
      this.ports.clock.now().getTime(),
    );
    if (mode.kind === 'refused') return this.decide(occurrence, mode.reason);
    this.owners.set(runId, owner);
    if (mode.kind === 'start') {
      this.launch(payload(), false);
      return { kind: 'started', runId };
    }
    this.ports.sink.queued(payload().state, payload().kind);
    for (const superseded of mode.superseded) this.drop(superseded, 'stale');
    for (const active of mode.cancel) this.cancels.cancel(active, 'restart_mode');
    return { kind: 'queued', runId };
  }

  run(start: RunStart): string {
    this.launch(start, false);
    return start.state.runId;
  }

  adopt(start: RunStart): void {
    if (start.state.wait === undefined) {
      throw new TypeError('Only a run parked on a wait can be adopted after a restart.');
    }
    if (start.kind === 'live') this.own(start);
    this.launch(start, true);
  }

  cancel(runId: string, reason: CancelReason): boolean {
    return this.cancels.cancel(runId, reason);
  }

  cancelAutomation(automationId: string, reason: CancelReason, key?: string): number {
    const matching = (runId: string): boolean => {
      const owner = this.owners.get(runId);
      return owner?.automationId === automationId && (key === undefined || owner.key === key);
    };
    for (const bookId of new Set([...this.owners.values()].map((owner) => owner.bookId))) {
      for (const ticket of this.modes.clearQueue(bookId, (held) => matching(held.runId))) {
        this.owners.delete(ticket.runId);
        this.ports.sink.dropped(ticket.payload().state, reason);
      }
    }
    return [...this.owners.keys()].filter((id) => matching(id) && this.cancels.cancel(id, reason))
      .length;
  }

  firstHold(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    return run === undefined || run.held ? Promise.resolve() : this.holds.wait(runId);
  }

  settled(): Promise<void> {
    if (this.runs.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.idle.push(resolve);
    });
  }

  pendingDecisions(automationId: string): readonly PendingDecision[] {
    return this.decisions.pending(automationId);
  }

  shutdown(keep: ReadonlySet<string> = new Set()): void {
    this.stopped = true;
    for (const [id, run] of [...this.runs]) {
      if (keep.has(id) && run.leave()) {
        this.runs.delete(id);
        this.cancels.close(id);
      } else {
        this.cancels.cancel(id, 'shutdown');
      }
    }
    this.decisions.flush();
  }

  private refuse(occurrence: Occurrence, reason: DecisionReason): Submission {
    const error = new ApiError('conflict', REFUSAL_MESSAGES[reason]);
    if (occurrence.manual) {
      this.ports.refused({
        automationId: occurrence.automationId,
        name: occurrence.name,
        reason,
        message: error.message,
        startedBy: occurrence.startedBy,
      });
    }
    return { kind: 'refused', reason, error };
  }

  private decide(occurrence: Occurrence, reason: DecisionReason): Submission {
    this.decisions.record(occurrence.automationId, reason);
    return this.refuse(occurrence, reason);
  }

  private own(start: RunStart): void {
    const owner = ownerOf(start.state.automationId, start.key);
    this.owners.set(start.state.runId, owner);
    this.modes.adopt(owner.bookId, start.state.runId);
  }

  private drop(ticket: Ticket<() => RunStart>, because: DecisionReason): void {
    this.owners.delete(ticket.runId);
    const start = ticket.payload();
    this.decisions.record(start.state.automationId, because);
    this.ports.sink.dropped(start.state, because);
  }

  private launch(start: RunStart, recovered: boolean): void {
    const { runId } = start.state;
    const signal = this.cancels.open(runId, (reason) => this.runs.get(runId)?.cancel(reason));
    const run = new LiveRun(start, recovered, {
      scope: { runId, automationId: start.state.automationId, signal },
      ports: this.ports,
      hooks: {
        schedule: (held): void => {
          this.scheduler.schedule(held);
        },
        parked: (held): void => {
          this.holds.reached(held.runId);
        },
        finished: (held): void => {
          this.ended(held);
        },
      },
      log: this.log,
    });
    this.runs.set(runId, run);
    if (!recovered) this.ports.sink.started(start.state, start.kind);
    run.begin();
  }

  private ended(run: LiveRun): void {
    this.runs.delete(run.runId);
    this.cancels.close(run.runId);
    this.holds.reached(run.runId);
    if (this.stopped) {
      this.owners.delete(run.runId);
      if (this.runs.size === 0) for (const resolve of this.idle.splice(0)) resolve();
      return;
    }
    if (run.kind !== 'live') return;
    const owner = this.owners.get(run.runId);
    this.owners.delete(run.runId);
    if (owner === undefined) return;
    const released = this.modes.release(owner.bookId, run.runId, this.ports.clock.now().getTime());
    for (const stale of released.stale) this.drop(stale, 'stale');
    for (const next of released.start) this.launch(next.payload(), false);
  }
}
