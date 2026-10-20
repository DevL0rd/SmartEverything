import type { JsonValue, LoopLimit, PortValue } from '@smarteverything/domain';
import type { Plan, PlanOp } from '../../src/compile/plan';
import type { LoopGap } from '../../src/compile/plan-parts';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import { step } from '../../src/interpret/step';
import type {
  NodeResult,
  Outcome,
  StepContext,
  StepEvent,
  StepRecord,
} from '../../src/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '../../src/interpret/loops';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState, Wait } from '../../src/state/run-state';
import { NOW, at, contextOf } from './core-support';

export { NOW, at, effect, wired, lit, planOf, seq, stateOf } from './core-support';

type Kind<K extends PlanOp['op']> = Extract<PlanOp, { op: K }>;

export function loopContext(plan: Plan, extra: Partial<StepContext> = {}): StepContext {
  return contextOf(plan, undefined, {
    ops: { ...CORE_OPS, ...LOOP_OPS },
    frames: { ...CORE_FRAMES, ...LOOP_FRAMES },
    ...extra,
  });
}

export const counter = (initial = 0): Plan['variables'] => [
  { name: 'i', type: { t: 'number' }, initial: { lit: initial } },
];

export const bump = (): PlanOp => ({
  op: 'set_var',
  at: at('bump'),
  mode: 'change',
  source: 'run',
  name: 'i',
  change: { op: 'add', amount: { lit: 1 }, edge: 'wrap' },
  retry: 'idempotent',
  budget: 'none',
});

export function gap(ms: number, skipAfterLast = true): LoopGap {
  return { ms, skipAfterLast, clipToDeadline: true };
}

export function limit(extra: Partial<LoopLimit> = {}): LoopLimit {
  return { onLimit: 'end', ...extra };
}

export interface LoopSpec {
  readonly source: Kind<'loop'>['source'];
  readonly test?: Kind<'loop'>['test'];
  readonly entryTest?: boolean;
  readonly order?: Kind<'loop'>['order'];
  readonly gap?: LoopGap | undefined;
  readonly limit?: LoopLimit | undefined;
}

export function loop(key: string, spec: LoopSpec, body: PlanOp): PlanOp {
  return {
    op: 'loop',
    at: at(key),
    source: spec.source,
    test: spec.test,
    entryTest: spec.entryTest ?? false,
    order: spec.order ?? 'gap_then_test',
    gap: spec.gap,
    limit: spec.limit,
    body,
  };
}

export function repeat(
  key: string,
  times: PortValue,
  body: PlanOp,
  spec: Partial<LoopSpec> = {},
): PlanOp {
  return loop(key, { source: { kind: 'count', times }, ...spec }, body);
}

export function whileLoop(
  key: string,
  when: PortValue,
  body: PlanOp,
  spec: Partial<LoopSpec> = {},
): PlanOp {
  const base: LoopSpec = {
    source: { kind: 'open' },
    test: { when, stopWhen: false },
    entryTest: true,
    gap: spec.gap,
    limit: spec.limit,
  };
  return loop(key, base, body);
}

export function doUntil(
  key: string,
  when: PortValue,
  body: PlanOp,
  spec: Partial<LoopSpec> = {},
): PlanOp {
  const base: LoopSpec = {
    source: { kind: 'open' },
    test: { when, stopWhen: true },
    order: 'test_then_gap',
    gap: spec.gap,
    limit: spec.limit,
  };
  return loop(key, base, body);
}

export function forEach(
  key: string,
  items: PortValue,
  body: PlanOp,
  extra: { collect?: PortValue; reverse?: boolean; concurrency?: number } & Partial<LoopSpec> = {},
): PlanOp {
  const { collect, reverse, concurrency, ...spec } = extra;
  const source: Kind<'loop'>['source'] = {
    kind: 'items',
    items,
    concurrency: concurrency ?? 1,
    reverse: reverse ?? false,
    ...(collect === undefined ? {} : { collect }),
  };
  return loop(key, { source, ...spec }, body);
}

export function range(
  key: string,
  bounds: { from: PortValue; to: PortValue; step: PortValue },
  body: PlanOp,
): PlanOp {
  return loop(key, { source: { kind: 'range', ...bounds } }, body);
}

export const breakOp = (target: string): PlanOp => ({ op: 'break', at: at('break'), target });

export const continueOp = (target: string): PlanOp => ({
  op: 'continue',
  at: at('continue'),
  target,
});

export interface Driven {
  readonly state: RunState;
  readonly outcome: Outcome;
  readonly records: readonly StepRecord[];
  readonly nodes: readonly Extract<StepRecord, { kind: 'node' }>[];
  readonly requests: readonly {
    readonly key: string;
    readonly at: number;
    readonly params: Record<string, JsonValue>;
  }[];
  readonly parks: readonly Wait[];
  readonly now: number;
  readonly steps: number;
}

export interface DriveOptions {
  readonly work?: number;
  readonly cancelOnPark?: boolean;
  readonly failGap?: boolean;
  readonly failEffects?: boolean;
  readonly limit?: number;
}

function nearestDeadline(state: RunState): number | undefined {
  const deadlines = state.frames.flatMap((frame) => frame.loop?.deadlineAt ?? []);
  return deadlines.length === 0 ? undefined : Math.min(...deadlines);
}

interface Turn {
  readonly state: RunState;
  readonly now: number;
  readonly event: StepEvent;
}

function afterEffect(turn: Turn, options: DriveOptions): Turn {
  const finishes = turn.now + (options.work ?? 0);
  const deadline = nearestDeadline(turn.state);
  if (deadline !== undefined && finishes > deadline) {
    const cancel = { reason: 'loop_limit' as const, requestedAt: deadline };
    return {
      state: { ...turn.state, cancel },
      now: deadline,
      event: { kind: 'run', now: deadline },
    };
  }
  const result: NodeResult =
    options.failEffects === true
      ? { ok: false, class: 'Failed', message: 'the work failed' }
      : { ok: true, value: {} };
  const event: StepEvent = { kind: 'resolved', now: finishes, result };
  return { state: turn.state, now: finishes, event };
}

function afterPark(turn: Turn, wait: Wait, options: DriveOptions): Turn {
  if (wait.kind !== 'duration') throw new Error('unexpected park');
  if (options.cancelOnPark === true) {
    const cancel = { reason: 'user_stop' as const, requestedAt: turn.now };
    return {
      state: { ...turn.state, cancel },
      now: turn.now,
      event: { kind: 'run', now: turn.now },
    };
  }
  const result: NodeResult =
    options.failGap === true
      ? { ok: false, class: 'Failed', message: 'the wake failed' }
      : { ok: true, value: {} };
  return {
    state: turn.state,
    now: wait.dueAt,
    event: { kind: 'resolved', now: wait.dueAt, result },
  };
}

function advanceTurn(turn: Turn, outcome: Outcome, options: DriveOptions): Turn | null {
  if (outcome.kind === 'continue') return { ...turn, event: { kind: 'run', now: turn.now } };
  if (outcome.kind === 'effect') return afterEffect(turn, options);
  if (outcome.kind === 'park') return afterPark(turn, outcome.wait, options);
  return null;
}

export function drive(ctx: StepContext, initial: RunState, options: DriveOptions = {}): Driven {
  const records: StepRecord[] = [];
  const nodes: Extract<StepRecord, { kind: 'node' }>[] = [];
  const requests: Driven['requests'][number][] = [];
  const parks: Wait[] = [];
  let turn: Turn = { state: initial, now: NOW, event: { kind: 'start', now: NOW } };
  for (let steps = 1; steps <= (options.limit ?? 50_000); steps += 1) {
    const stepped = step(ctx, turn.state, turn.event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    for (const entry of stepped.records) {
      if (entry.kind === 'node') nodes.push(entry);
      else records.push(entry);
    }
    const { outcome } = stepped;
    if (outcome.kind === 'effect') {
      const { request } = outcome;
      const params = { ...request.params };
      requests.push({ key: request.node.key, at: turn.now - NOW, params });
    }
    if (outcome.kind === 'park') parks.push(outcome.wait);
    const moved = advanceTurn({ ...turn, state: stepped.state }, outcome, options);
    if (moved === null) {
      const { state } = stepped;
      return { state, outcome, records, nodes, requests, parks, now: turn.now - NOW, steps };
    }
    turn = moved;
  }
  throw new Error('the run did not stop');
}
