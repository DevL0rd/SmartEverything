import { SIGNAL_MATCHER } from '@smarteverything/domain';
import type {
  BudgetOverrides,
  PortValue,
  SignalInput,
  StructuredOutput,
} from '@smarteverything/domain';
import type { Plan, PlanOp } from '../../src/compile/plan';
import type { WaitSpec } from '../../src/compile/plan-parts';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import {
  CONCURRENT_EACH_FRAMES,
  CONCURRENT_EACH_OPS,
} from '../../src/interpret/for-each-concurrent';
import type { NodeResult, Outcome, StepContext, StepEvent } from '../../src/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '../../src/interpret/loops';
import { PARALLEL_FRAMES, PARALLEL_OPS } from '../../src/interpret/parallel';
import { step } from '../../src/interpret/step';
import { TRY_FRAMES, TRY_OPS } from '../../src/interpret/try';
import { resumeResult, waitOps } from '../../src/interpret/waits';
import { resolveBudgets } from '../../src/state/budgets';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState } from '../../src/state/run-state';
import { NOW, at, contextOf, planOf, stateOf } from './core-support';
import type { CatchRow } from './errors-support';
import { tryOp } from './errors-support';

export {
  NOW,
  effect,
  wired,
  fail,
  lit,
  output,
  planOf,
  ret,
  seq,
  setVar,
  stateOf,
} from './core-support';
export { row, tryOp } from './errors-support';
export { breakOp, continueOp, forEach } from './loops-support';

export function parallelContext(plan: Plan, overrides: BudgetOverrides = {}): StepContext {
  return contextOf(plan, undefined, {
    limits: resolveBudgets(overrides),
    ops: {
      ...CORE_OPS,
      ...LOOP_OPS,
      ...TRY_OPS,
      ...waitOps({ nextOccurrence: () => ({ ok: true, value: NOW }) }),
      ...PARALLEL_OPS,
      ...CONCURRENT_EACH_OPS,
    },
    frames: {
      ...CORE_FRAMES,
      ...LOOP_FRAMES,
      ...TRY_FRAMES,
      ...PARALLEL_FRAMES,
      ...CONCURRENT_EACH_FRAMES,
    },
  });
}

export function delay(key: string, ms: PortValue | number): PlanOp {
  const duration: PortValue = typeof ms === 'number' ? { lit: ms } : ms;
  const wait: WaitSpec = { kind: 'duration', duration, ifLate: 'run' };
  return { op: 'wait', at: at(key), durable: true, wait };
}

export function listen(key: string, timeoutMs?: number): PlanOp {
  const matcher = SIGNAL_MATCHER.parse({ source: 'device', kind: 'state', subject: 'door' });
  const wait: WaitSpec = {
    kind: 'event',
    matcher,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
  return { op: 'wait', at: at(key), durable: true, wait };
}

export function doorSignal(at: number): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: 'door',
    field: 'open',
    value: true,
    previous: false,
    at: new Date(at).toISOString(),
    profileId: null,
    data: {},
  };
}

export function guarded(key: string, body: PlanOp, cleanup: PlanOp): PlanOp {
  const rows: CatchRow[] = [];
  return tryOp(key, body, rows, { finally: cleanup });
}

type Kind<K extends PlanOp['op']> = Extract<PlanOp, { op: K }>;

export interface ParallelSpec {
  readonly join?: Kind<'parallel'>['join'];
  readonly errors?: Kind<'parallel'>['errors'];
  readonly outputs?: StructuredOutput[];
}

export function parallel(
  key: string,
  branches: readonly [string, PlanOp][],
  spec: ParallelSpec = {},
): PlanOp {
  return {
    op: 'parallel',
    at: at(key),
    join: spec.join ?? 'all',
    errors: spec.errors ?? 'failFast',
    branches: branches.map(([name, body]) => ({ name, body })),
    outputs: spec.outputs,
  };
}

export interface Driven {
  readonly state: RunState;
  readonly outcome: Outcome;
  readonly requests: readonly { readonly key: string; readonly at: number }[];
  readonly parks: number;
  readonly now: number;
}

export interface DriveOptions {
  readonly work?: number;
  readonly cancelOnPark?: boolean;
  readonly refuse?: string;
  readonly limit?: number;
  readonly signal?: { readonly at: number; readonly signal: SignalInput };
}

function woken(
  wait: Extract<Outcome, { kind: 'park' }>['wait'],
  state: RunState,
  options: DriveOptions,
): { event: StepEvent; state: RunState; now: number } {
  const leaves = wait.kind === 'any' ? wait.waits : [wait];
  const timer = leaves
    .filter((leaf) => leaf.kind === 'duration')
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  const heard = options.signal;
  const listener = leaves.find((leaf) => leaf.kind === 'event');
  if (heard !== undefined && listener !== undefined && heard.at <= (timer?.dueAt ?? heard.at)) {
    const result = resumeResult(listener, { kind: 'signal', signal: heard.signal });
    return { event: { kind: 'resolved', now: heard.at, result }, state, now: heard.at };
  }
  if (timer === undefined) throw new Error('unexpected park');
  const result = resumeResult(timer, { kind: 'due', recovered: false });
  return { event: { kind: 'resolved', now: timer.dueAt, result }, state, now: timer.dueAt };
}

function resolved(
  state: RunState,
  now: number,
  outcome: Outcome,
  options: DriveOptions,
): { event: StepEvent; state: RunState; now: number } | null {
  if (outcome.kind === 'continue') return { event: { kind: 'run', now }, state, now };
  if (outcome.kind === 'effect') {
    const later = now + (options.work ?? 0);
    const refused = outcome.request.node.key === options.refuse;
    const result: NodeResult = refused
      ? { ok: false, class: 'Refused', message: 'the device refused' }
      : { ok: true, value: {} };
    return { event: { kind: 'resolved', now: later, result }, state, now: later };
  }
  if (outcome.kind !== 'park') return null;
  if (options.cancelOnPark === true) {
    const cancel = { reason: 'user_stop' as const, requestedAt: now };
    return { event: { kind: 'run', now }, state: { ...state, cancel }, now };
  }
  return woken(outcome.wait, state, options);
}

export function drive(ctx: StepContext, initial: RunState, options: DriveOptions = {}): Driven {
  const requests: Driven['requests'][number][] = [];
  let state = initial;
  let now = NOW;
  let event: StepEvent = { kind: 'start', now };
  let parks = 0;
  for (let steps = 0; steps < (options.limit ?? 20_000); steps += 1) {
    const stepped = step(ctx, state, event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    const { outcome } = stepped;
    if (outcome.kind === 'effect') requests.push({ key: outcome.request.node.key, at: now - NOW });
    if (outcome.kind === 'park') parks += 1;
    const moved = resolved(stepped.state, now, outcome, options);
    if (moved === null) {
      return { state: stepped.state, outcome, requests, parks, now: now - NOW };
    }
    ({ state, now, event } = moved);
  }
  throw new Error('the run did not stop');
}

export function execute(
  body: PlanOp,
  options: DriveOptions & { overrides?: BudgetOverrides; variables?: Plan['variables'] } = {},
): Driven {
  const plan = planOf(
    body,
    options.variables === undefined ? {} : { variables: options.variables },
  );
  return drive(parallelContext(plan, options.overrides), stateOf(), options);
}

export const keys = (driven: Driven): string[] => driven.requests.map((request) => request.key);

export function failure(driven: Driven): { class: string; message: string } | undefined {
  return driven.outcome.kind === 'failed' ? driven.outcome.error : undefined;
}
