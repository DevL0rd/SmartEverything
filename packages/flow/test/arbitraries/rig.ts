import { ERROR_CLASS, NODE_REGISTRY } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import type { Plan } from '../../src/compile/plan';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { PLAN } from '../../src/compile/plan';
import { lower } from '../../src/compile/lower';
import type { LowerContext } from '../../src/compile/lower';
import type { Program } from '../../src/program/walk';
import { CALL_FRAMES, callOps, calleeOf } from '../../src/interpret/calls';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import {
  CONCURRENT_EACH_FRAMES,
  CONCURRENT_EACH_OPS,
} from '../../src/interpret/for-each-concurrent';
import type {
  EffectRequest,
  NodeResult,
  Outcome,
  StepContext,
  StepEvent,
  StepRecord,
  StepResult,
} from '../../src/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '../../src/interpret/loops';
import { PARALLEL_FRAMES, PARALLEL_OPS, lanesOf } from '../../src/interpret/parallel';
import { step } from '../../src/interpret/step';
import { TRY_FRAMES, TRY_OPS } from '../../src/interpret/try';
import { resumeResult, wakeAt, wakeResume, waitOps } from '../../src/interpret/waits';
import { resolveBudgets } from '../../src/state/budgets';
import { RUN_STATE } from '../../src/state/run-state';
import type { Frame, PlanRef, RunState, Wait } from '../../src/state/run-state';
import { PROBE, automation, functionProgram } from '../check/c23-support';
import { NOW, contextOf, stateOf } from '../interpret/core-support';

const RUN_ID = '66666666-6666-4666-8666-666666666666';
const AUTOMATION_ID = '77777777-7777-4777-8777-777777777777';

export const CALLEE_ID = '55555555-5555-4555-8555-555555555555';

const CALLEE_REF: PlanRef = { id: CALLEE_ID, revision: 1, hash: 'c'.repeat(64) };

export const STEPS_TOTAL = 900;

export const LOOP_ITERATIONS = 24;

const LIMITS = resolveBudgets({
  stepsInARow: 400,
  stepsTotal: STEPS_TOTAL,
  loopIterations: LOOP_ITERATIONS,
});

export const NAMED_CLASSES: ReadonlySet<string> = new Set(ERROR_CLASS.options);

const lowerContext: LowerContext = {
  kinds: (id) => (id === PROBE.id ? PROBE : NODE_REGISTRY.get(id)),
};

export const VARIABLES = [{ name: 'i', type: { t: 'number' as const }, initial: { lit: 0 } }];

export function compileProgram(program: Program): Plan {
  const lowered = lower(program, lowerContext);
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  return PLAN.parse(lowered.plan);
}

export function compiled(nodes: readonly FlowNode[], subject: 'automation' | 'function'): Plan {
  const program =
    subject === 'automation'
      ? { ...automation(nodes), variables: VARIABLES }
      : { ...functionProgram(nodes), variables: VARIABLES };
  const lowered = lower(program, lowerContext);
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  return PLAN.parse(lowered.plan);
}

export interface Rig {
  readonly main: Plan;
  readonly callee: Plan;
  readonly shape?: FunctionInterface;
}

const NO_PORTS: FunctionInterface = { inputs: [], outputs: [], exits: ['done'] };

function chainTo(
  frames: readonly Frame[],
  id: string,
  above: readonly Frame[],
): Frame[] | undefined {
  for (const [index, frame] of frames.entries()) {
    const chain = [...above, ...frames.slice(0, index + 1)];
    if (frame.id === id) return chain;
    for (const lane of frame.kind === 'parallel' ? lanesOf(frame) : []) {
      const found = chainTo(lane.frames, id, chain);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function ownerPlan(rig: Rig, chain: readonly Frame[]): Plan {
  return chain.some((held) => calleeOf(held) !== null) ? rig.callee : rig.main;
}

function planResolver(rig: Rig, state: RunState): StepContext['plan'] {
  let pusher: Plan | undefined;
  return (frame): Plan => {
    if (calleeOf(frame) !== null) {
      pusher ??= rig.callee;
      return rig.callee;
    }
    const chain = chainTo(state.frames, frame.id, []);
    if (chain === undefined) return pusher ?? rig.main;
    pusher ??= ownerPlan(rig, chain);
    return ownerPlan(rig, chain);
  };
}

function contextAt(rig: Rig, state: RunState): StepContext {
  return contextOf(rig.main, undefined, {
    plan: planResolver(rig, state),
    limits: LIMITS,
    ops: {
      ...CORE_OPS,
      ...LOOP_OPS,
      ...TRY_OPS,
      ...waitOps({ nextOccurrence: (_clock, after) => ({ ok: true, value: after + 1000 }) }),
      ...PARALLEL_OPS,
      ...CONCURRENT_EACH_OPS,
      ...callOps(() => ({ ok: true, value: rig.shape ?? NO_PORTS })),
    },
    frames: {
      ...CORE_FRAMES,
      ...LOOP_FRAMES,
      ...TRY_FRAMES,
      ...PARALLEL_FRAMES,
      ...CONCURRENT_EACH_FRAMES,
      ...CALL_FRAMES,
    },
  });
}

function hashOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function resolveEffect(request: EffectRequest, seed: number, turn: number): NodeResult {
  const roll = hashOf(`${String(seed)}/${request.node.key}/${String(turn)}`) % 12;
  if (roll === 0) return { ok: false, class: 'Refused', message: 'the device refused' };
  if (roll === 1) return { ok: false, class: 'Unreachable', message: 'the device is away' };
  return { ok: true, value: { roll } };
}

interface Journal {
  readonly effects: readonly string[];
  readonly nodes: readonly string[];
  readonly records: readonly StepRecord[];
  readonly parks: readonly Wait[];
}

export interface Cursor {
  readonly state: RunState;
  readonly event: StepEvent;
  readonly now: number;
  readonly journal: Journal;
}

type Ending =
  | { readonly kind: 'done'; readonly status: string }
  | { readonly kind: 'failed'; readonly errorClass: string }
  | { readonly kind: 'parked'; readonly wait: Wait };

export interface Finished {
  readonly ending: Ending;
  readonly state: RunState;
  readonly journal: Journal;
  readonly now: number;
}

export type Driven =
  | { readonly kind: 'finished'; readonly finished: Finished }
  | { readonly kind: 'paused'; readonly cursor: Cursor };

export function begin(seed: number): Cursor {
  return {
    state: stateOf({ seed, planRefs: [CALLEE_REF], runId: RUN_ID, automationId: AUTOMATION_ID }),
    event: { kind: 'start', now: NOW },
    now: NOW,
    journal: { effects: [], nodes: [], records: [], parks: [] },
  };
}

const ITERATION_CAP = 4000;

function wakeFor(wait: Wait, now: number): { event: StepEvent; now: number } | undefined {
  const leaf =
    wait.kind === 'any'
      ? [...wait.waits].sort((a, b) => (wakeAt(a) ?? Infinity) - (wakeAt(b) ?? Infinity))[0]
      : wait;
  const due = leaf === undefined ? undefined : wakeAt(leaf);
  if (leaf === undefined || due === undefined) return undefined;
  const at = Math.max(now, due);
  const resume = wakeResume(leaf, at, false);
  return resume === undefined
    ? undefined
    : { event: { kind: 'resolved', now: at, result: resumeResult(leaf, resume) }, now: at };
}

function parked(cursor: Cursor, wait: Wait): Driven {
  const finished: Finished = {
    ending: { kind: 'parked', wait },
    state: cursor.state,
    journal: cursor.journal,
    now: cursor.now,
  };
  return { kind: 'finished', finished };
}

function ended(cursor: Cursor, outcome: Outcome): Driven | undefined {
  const { state, journal, now } = cursor;
  if (outcome.kind === 'done') {
    const ending: Ending = { kind: 'done', status: outcome.status };
    return { kind: 'finished', finished: { ending, state, journal, now } };
  }
  if (outcome.kind === 'failed') {
    const ending: Ending = { kind: 'failed', errorClass: outcome.error.class };
    return { kind: 'finished', finished: { ending, state, journal, now } };
  }
  return undefined;
}

function journalled(cursor: Cursor, stepped: StepResult): Cursor {
  const { outcome } = stepped;
  const { effects, nodes, records, parks } = cursor.journal;
  const journal: Journal = {
    effects: outcome.kind === 'effect' ? [...effects, outcome.request.key] : effects,
    nodes: outcome.kind === 'effect' ? [...nodes, outcome.request.node.key] : nodes,
    records: [...records, ...stepped.records],
    parks: outcome.kind === 'park' ? [...parks, outcome.wait] : parks,
  };
  return { ...cursor, state: stepped.state, journal };
}

function advanced(cursor: Cursor, outcome: Outcome): Cursor {
  if (outcome.kind === 'effect') {
    const turn = cursor.journal.nodes.filter((key) => key === outcome.request.node.key).length;
    const result = resolveEffect(outcome.request, cursor.state.seed, turn);
    return { ...cursor, event: { kind: 'resolved', now: cursor.now, result } };
  }
  return { ...cursor, event: { kind: 'run', now: cursor.now } };
}

export interface DriveOptions {
  readonly pauseAtDurablePark?: number;
}

function afterPark(cursor: Cursor, wait: Wait): Driven {
  const woken = wakeFor(wait, cursor.now);
  return woken === undefined
    ? parked(cursor, wait)
    : { kind: 'paused', cursor: { ...cursor, ...woken } };
}

export function drive(rig: Rig, from: Cursor, options: DriveOptions = {}): Driven {
  let cursor = from;
  let durableParks = 0;
  for (let count = 0; count < ITERATION_CAP; count += 1) {
    const stepped = step(contextAt(rig, cursor.state), cursor.state, cursor.event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    cursor = journalled(cursor, stepped);
    const { outcome } = stepped;
    const finished = ended(cursor, outcome);
    if (finished !== undefined) return finished;
    if (outcome.kind !== 'park') {
      cursor = advanced(cursor, outcome);
      continue;
    }
    const pause = outcome.wait.durable && durableParks === options.pauseAtDurablePark;
    if (outcome.wait.durable) durableParks += 1;
    const next = afterPark(cursor, outcome.wait);
    if (next.kind === 'finished' || pause) return next;
    cursor = next.cursor;
  }
  throw new Error(`the run did not stop within ${String(ITERATION_CAP)} driver turns`);
}

export function runToEnd(rig: Rig, seed: number): Finished {
  const driven = drive(rig, begin(seed));
  if (driven.kind !== 'finished') throw new Error('the run paused without being asked to');
  return driven.finished;
}

export function reload(cursor: Cursor): Cursor {
  const state = RUN_STATE.parse(JSON.parse(JSON.stringify(cursor.state)));
  return { ...cursor, state };
}
