import { randomUUID } from 'node:crypto';
import { CORE_FRAMES, CORE_OPS } from '@smarteverything/flow/interpret/core-ops';
import type { Plan, PlanOp } from '@smarteverything/flow/compile/plan';
import type { Evaluated, NodeResult, StepContext } from '@smarteverything/flow/interpret/frames';
import { rootFrame } from '@smarteverything/flow/interpret/frames';
import { TRY_FRAMES, TRY_OPS } from '@smarteverything/flow/interpret/try';
import { waitOps } from '@smarteverything/flow/interpret/waits';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import { resolveBudgets, startBudgets } from '@smarteverything/flow/state/budgets';
import type { RunState, Wait } from '@smarteverything/flow/state/run-state';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import type { DroppedRun } from '../../../src/store/repositories/automation-decisions';
import { RunDriver } from '../../../src/automations/driver/admission';
import type { Occurrence, Submission } from '../../../src/automations/driver/admission';
import type {
  DriverPorts,
  Ending,
  FinishedRun,
  RefusedStart,
  RunKind,
  RunScope,
  RunStart,
} from '../../../src/automations/driver/ports';
import type { ModePolicy } from '../../../src/automations/driver/modes';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';

export const START = '2026-10-18T12:00:00.000Z';

let counter = 0;

function at(key: string): { id: string; key: string } {
  counter += 1;
  return { id: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`, key };
}

export function seq(...ops: PlanOp[]): PlanOp {
  return { op: 'seq', ops };
}

export function effect(key: string): PlanOp {
  return {
    op: 'effect',
    at: at(key),
    kind: 'test.effect',
    params: {},
    retry: 'idempotent',
    budget: 'none',
  };
}

export function guard(key: string): PlanOp {
  return { op: 'guard', at: at(key), condition: { lit: true }, quietly: true };
}

export function pause(key: string, milliseconds: number): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: false,
    wait: { kind: 'duration', duration: { lit: milliseconds }, ifLate: 'run' },
  };
}

export function guarded(key: string, body: PlanOp, cleanup: PlanOp): PlanOp {
  return { op: 'try', at: at(key), body, catches: [], finally: cleanup };
}

export function condition(key: string): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: false,
    wait: { kind: 'condition', condition: { lit: false }, timeoutMs: 60_000 },
  };
}

function contextOf(body: PlanOp): StepContext {
  const plan: Plan = { version: 1, subject: 'automation', exits: [], variables: [], body };
  return {
    plan: () => plan,
    pure: () => undefined,
    reads: {
      node: (): NodeResult => ({ ok: true, value: {} }),
      variable: (): Evaluated => ({ ok: true, value: 0 }),
    },
    changeVar: () => ({ ok: true, value: { value: 0, wrapped: false } }),
    limits: resolveBudgets(),
    home: {},
    ops: {
      ...CORE_OPS,
      ...TRY_OPS,
      ...waitOps({ nextOccurrence: () => ({ ok: true, value: 0 }) }),
    },
    frames: { ...CORE_FRAMES, ...TRY_FRAMES },
  };
}

export function stateAt(now: number): RunState {
  const automationId = randomUUID();
  return {
    runId: randomUUID(),
    automationId,
    revision: 1,
    planRefs: [{ id: automationId, revision: 1, hash: 'a'.repeat(64) }],
    trigger: null,
    payload: {},
    inputs: {},
    ownerProfileId: null,
    origin: null,
    causeChain: [],
    frames: [rootFrame()],
    captures: {},
    budgets: startBudgets(resolveBudgets(), now),
    seed: 1,
  };
}

export interface Watched {
  readonly wait: Wait;
  readonly resume: (resume: WaitResume) => void;
  cancelled: boolean;
}

const OK: NodeResult = { ok: true, value: {} };

export function runIdOf(submission: Submission): string {
  if (submission.kind === 'refused') throw new Error('the submission was refused');
  return submission.runId;
}

export class Harness {
  readonly clock = new TestClock(START);
  readonly requests: EffectRequest[] = [];
  readonly afterCancel: EffectRequest[] = [];
  readonly started: string[] = [];
  readonly queued: string[] = [];
  readonly dropped: string[] = [];
  readonly finished: { runId: string; ending: Ending; kind: RunKind }[] = [];
  readonly parked: RunState[] = [];
  readonly recorded: FinishedRun[] = [];
  readonly refused: RefusedStart[] = [];
  readonly decisions: DroppedRun[] = [];
  readonly watched: Watched[] = [];
  readonly storms: string[] = [];
  readonly records: StepRecord[] = [];
  readonly yields: (() => void)[] = [];
  perform: (request: EffectRequest, scope: RunScope) => Promise<NodeResult> = () =>
    Promise.resolve(OK);
  readonly driver: RunDriver;

  constructor() {
    this.driver = new RunDriver({
      ports: this.ports(),
      decisions: {
        record: (dropped): void => {
          this.decisions.push(dropped);
        },
      },
      yieldNow: (resume): void => {
        this.yields.push(resume);
      },
    });
  }

  async settle(): Promise<void> {
    for (let round = 0; round < 40; round += 1) {
      await Promise.resolve();
      for (const resume of this.yields.splice(0)) resume();
    }
  }

  async advance(milliseconds: number): Promise<void> {
    this.clock.advanceTo(new Date(this.clock.now().getTime() + milliseconds).toISOString());
    await this.settle();
  }

  private ports(): DriverPorts {
    return {
      clock: this.clock,
      monotonic: () => 0,
      ids: randomUUID,
      storm: (id): void => {
        this.storms.push(id);
      },
      perform: (request, scope): Promise<NodeResult> => {
        this.requests.push(request);
        return this.perform(request, scope);
      },
      watch: (wait, resume) => {
        const entry: Watched = { wait, resume, cancelled: false };
        this.watched.push(entry);
        return () => {
          entry.cancelled = true;
        };
      },
      afterCancel: (request) => this.afterCancel.push(request),
      refused: (start) => this.refused.push(start),
      recordRun: (run) => this.recorded.push(run),
      sink: {
        queued: (state) => this.queued.push(state.runId),
        dropped: (state, because) => this.dropped.push(`${state.runId}:${because}`),
        started: (state) => this.started.push(state.runId),
        slice: (_id, records) => this.records.push(...records),
        parked: (state) => this.parked.push(state),
        resumed: () => undefined,
        finished: (state, ending, kind) => this.finished.push({ runId: state.runId, ending, kind }),
      },
    };
  }
}

export interface OccurrenceOptions {
  readonly body: PlanOp;
  readonly automationId?: string;
  readonly policy?: ModePolicy;
  readonly manual?: boolean;
  readonly urgent?: boolean;
  readonly startBucket?: boolean;
  readonly feedback?: boolean;
  readonly kind?: RunKind;
  readonly causeChain?: Occurrence['causeChain'];
  readonly admit?: Occurrence['admit'];
  readonly now?: number;
}

export function occurrence(options: OccurrenceOptions): Occurrence {
  const automationId = options.automationId ?? randomUUID();
  const now = options.now ?? Date.parse(START);
  return {
    automationId,
    name: 'Test automation',
    policy: options.policy ?? { mode: 'single' },
    limits: { startBucket: options.startBucket ?? true, feedback: options.feedback ?? true },
    trigger: null,
    causeChain: options.causeChain ?? [],
    manual: options.manual ?? false,
    urgent: options.urgent ?? false,
    startedBy: null,
    admit: options.admit,
    start: (runId): RunStart => ({
      state: { ...stateAt(now), runId, automationId },
      context: contextOf(options.body),
      name: 'Test automation',
      kind: options.kind ?? 'live',
      startedBy: null,
      key: options.policy?.key,
    }),
  };
}
