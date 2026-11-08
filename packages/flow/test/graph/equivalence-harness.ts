import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { Plan } from '../../src/compile/plan';
import { CALL_FRAMES, callOps, planOwner } from '../../src/interpret/calls';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import {
  CONCURRENT_EACH_FRAMES,
  CONCURRENT_EACH_OPS,
} from '../../src/interpret/for-each-concurrent';
import type {
  Evaluated,
  Outcome,
  Outputs,
  StepContext,
  StepEvent,
  StepRecord,
  VarChangeResult,
} from '../../src/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '../../src/interpret/loops';
import { PARALLEL_FRAMES, PARALLEL_OPS } from '../../src/interpret/parallel';
import { withPolicy } from '../../src/interpret/policy';
import { stateOps } from '../../src/interpret/state-ops';
import { step } from '../../src/interpret/step';
import { TRY_FRAMES, TRY_OPS } from '../../src/interpret/try';
import { resumeResult, wakeAt, wakeResume, waitOps } from '../../src/interpret/waits';
import { pureEvaluators } from '../../src/nodes/pure';
import { VAR_CHANGE_REQUEST, changeVariable } from '../../src/nodes/state/var-change';
import { resolveBudgets } from '../../src/state/budgets';
import type { RunState, Wait } from '../../src/state/run-state';
import { stateOf } from '../interpret/core-support';
import { EFFECTS, READS, fakeOf, handled } from './equivalence-world';
import type { Fake, TracedWrite, World } from './equivalence-world';

export type { Callee, TracedWrite, World } from './equivalence-world';

export interface Scenario {
  readonly name: string;
  readonly trigger: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly now: number;
}

export interface TracedNode {
  readonly node: string;
  readonly status: string;
  readonly iteration: readonly number[];
  readonly instant: boolean;
}

export type TracedOutcome =
  | {
      readonly kind: 'done';
      readonly status: string;
      readonly exit: string;
      readonly outputs: Outputs;
    }
  | { readonly kind: 'failed'; readonly errorClass: string; readonly message: string };

export interface Trace {
  readonly effects: readonly { readonly kind: string; readonly params: Outputs }[];
  readonly waits: readonly {
    readonly kind: string;
    readonly durable: boolean;
    readonly due?: number;
  }[];
  readonly writes: readonly TracedWrite[];
  readonly nodes: readonly TracedNode[];
  readonly outcome: TracedOutcome;
  readonly steps: number;
}

export type ComparedField = 'effects' | 'waits' | 'writes' | 'nodes' | 'outcome';

export interface TraceDifference {
  readonly field: ComparedField;
  readonly before: string;
  readonly after: string;
}

const START = Date.UTC(2026, 9, 24, 9, 0, 0);

const RUN_ID = '66666666-6666-4666-8666-666666666666';
const AUTOMATION_ID = '77777777-7777-4777-8777-777777777777';
const STEP_CAP = 5000;

function tickScenario(tick: number): Scenario {
  return {
    name: `tick ${String(tick)}`,
    trigger: 'tick',
    payload: { tick, at: new Date(START).toISOString() },
    inputs: {},
    now: START,
  };
}

export function scenariosFor(trigger: string): readonly Scenario[] {
  if (trigger !== 'tick') throw new Error(`no fixed scenario is defined for trigger ${trigger}`);
  return [1, 2, 3].map(tickScenario);
}

function runChange(request: Parameters<StepContext['changeVar']>[0]): VarChangeResult {
  const changed = changeVariable(
    request.current,
    VAR_CHANGE_REQUEST.parse({ ...request.change, amount: request.amount }),
  );
  if (!changed.ok) return { ok: false, class: changed.errorClass, message: changed.message };
  return {
    ok: true,
    value: { value: changed.value, previous: changed.previous, wrapped: changed.wrapped },
  };
}

function memoryPort(fake: Fake): Parameters<typeof stateOps>[0] {
  return {
    memory: {
      recall: (automationId, slot) => fake.kept.get(`${automationId}/${slot}`),
      keep: (automationId, slot, memory): void => {
        fake.kept.set(`${automationId}/${slot}`, memory);
        fake.writes.push({ store: 'kept', name: slot, value: memory });
      },
    },
    clock: { localTime: (at) => ({ msOfDay: at % 86_400_000, localAsUtc: new Date(at) }) },
  };
}

function contextOf(plan: Plan, fake: Fake, scenario: Scenario, world: World): StepContext {
  const now = (): number => scenario.now;
  const callee = world.callee;
  return {
    plan: (frame, state) =>
      callee !== undefined && planOwner(state, frame) !== null ? callee.plan : plan,
    pure: pureEvaluators(
      { timeZone: 'UTC', now, trigger: () => scenario.trigger },
      STATIC_KIND_LOOKUP,
    ),
    reads: {
      node: (request) => handled(READS, request.kind)(fake, request.inputs),
      variable: (name): Evaluated => ({ ok: true, value: fake.variables.get(name) }),
    },
    changeVar: runChange,
    limits: resolveBudgets(),
    home: { timeZone: 'UTC' },
    ops: withPolicy({
      ...CORE_OPS,
      ...TRY_OPS,
      ...LOOP_OPS,
      ...PARALLEL_OPS,
      ...callOps(() => ({
        ok: true,
        value: callee?.shape ?? { inputs: [], outputs: [], exits: [] },
      })),
      ...waitOps({ nextOccurrence: (_clock, after) => ({ ok: true, value: after + 60_000 }) }),
      ...stateOps(memoryPort(fake)),
      ...CONCURRENT_EACH_OPS,
    }),
    frames: {
      ...CORE_FRAMES,
      ...TRY_FRAMES,
      ...LOOP_FRAMES,
      ...PARALLEL_FRAMES,
      ...CONCURRENT_EACH_FRAMES,
      ...CALL_FRAMES,
    },
  };
}

function initialState(scenario: Scenario, world: World): RunState {
  const callee = world.callee;
  const own = { id: AUTOMATION_ID, revision: 1, hash: 'a'.repeat(64) };
  const planRefs =
    callee === undefined ? [own] : [own, { id: callee.id, revision: 1, hash: 'c'.repeat(64) }];
  return stateOf({
    runId: RUN_ID,
    automationId: AUTOMATION_ID,
    planRefs,
    payload: scenario.payload,
    inputs: scenario.inputs,
  });
}

function iterationOf(state: RunState): readonly number[] {
  return state.frames.flatMap((frame) => (frame.loop === undefined ? [] : [frame.loop.index]));
}

function nodesOf(
  records: readonly StepRecord[],
  state: RunState,
  running: Set<string>,
): readonly TracedNode[] {
  return records.flatMap((record) => {
    if (record.kind !== 'node') return [];
    if (record.status === 'running') running.add(record.activation);
    const instant = record.status === 'succeeded' && !running.has(record.activation);
    return [{ node: record.node, status: record.status, iteration: iterationOf(state), instant }];
  });
}

function tracedOutcome(outcome: Outcome): TracedOutcome | undefined {
  if (outcome.kind === 'done') {
    const { status, exit, outputs } = outcome;
    return { kind: 'done', status, exit, outputs };
  }
  if (outcome.kind === 'failed') {
    return { kind: 'failed', errorClass: outcome.error.class, message: outcome.error.message };
  }
  return undefined;
}

function wakeFor(wait: Wait, now: number): { event: StepEvent; now: number } {
  const leaves = wait.kind === 'any' ? wait.waits : [wait];
  const timed = leaves.flatMap((leaf) => {
    const dueAt = wakeAt(leaf);
    return dueAt === undefined ? [] : [{ leaf, dueAt }];
  });
  const [first] = timed.sort((left, right) => left.dueAt - right.dueAt);
  const resume = first === undefined ? undefined : wakeResume(first.leaf, first.dueAt, false);
  if (first === undefined || resume === undefined) {
    throw new Error(`the scenario has no resolution for a ${wait.kind} wait`);
  }
  const at = Math.max(now, first.dueAt);
  return {
    event: { kind: 'resolved', now: at, result: resumeResult(first.leaf, resume) },
    now: at,
  };
}

export function runScenario(plan: Plan, scenario: Scenario, world: World = {}): Trace {
  const fake = fakeOf(world);
  const effects: Trace['effects'][number][] = [];
  const waits: Trace['waits'][number][] = [];
  const nodes: TracedNode[] = [];
  const running = new Set<string>();
  let state = initialState(scenario, world);
  let now = scenario.now;
  let event: StepEvent = { kind: 'start', now };
  for (let steps = 1; steps <= STEP_CAP; steps += 1) {
    const stepped = step(contextOf(plan, fake, scenario, world), state, event);
    state = stepped.state;
    nodes.push(...nodesOf(stepped.records, state, running));
    const { outcome } = stepped;
    const finished = tracedOutcome(outcome);
    if (finished !== undefined) {
      return { effects, waits, writes: fake.writes, nodes, outcome: finished, steps };
    }
    if (outcome.kind === 'effect') {
      const { kind, params } = outcome.request;
      effects.push({ kind, params });
      event = { kind: 'resolved', now, result: handled(EFFECTS, kind)(fake, params) };
    } else if (outcome.kind === 'park') {
      const { wait } = outcome;
      const due = wakeAt(wait);
      waits.push({ kind: wait.kind, durable: wait.durable, ...(due === undefined ? {} : { due }) });
      ({ event, now } = wakeFor(wait, now));
    } else {
      event = { kind: 'run', now };
    }
  }
  throw new Error('the run did not stop');
}

const FIELDS: readonly ComparedField[] = ['effects', 'waits', 'writes', 'nodes', 'outcome'];

export interface CompareOptions {
  readonly ignoreInstant?: boolean;
}

function comparable(trace: Trace, field: ComparedField, options: CompareOptions): unknown {
  if (field !== 'nodes' || options.ignoreInstant !== true) return trace[field];
  return trace.nodes.filter((node) => !node.instant);
}

export function compareTraces(
  before: Trace,
  after: Trace,
  options: CompareOptions = {},
): readonly TraceDifference[] {
  return FIELDS.flatMap((field) => {
    const left = JSON.stringify(comparable(before, field, options));
    const right = JSON.stringify(comparable(after, field, options));
    return left === right ? [] : [{ field, before: left, after: right }];
  });
}

export function stepDelta(before: Trace, after: Trace): number {
  return after.steps - before.steps;
}
