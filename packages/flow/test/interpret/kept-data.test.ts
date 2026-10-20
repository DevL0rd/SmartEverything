import type { JsonValue, Variable } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { Plan, PlanOp } from '../../src/compile/plan';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { CALL_FRAMES, callOps, instanceOf, planOwner } from '../../src/interpret/calls';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import type {
  EffectRequest,
  Evaluated,
  NodeResult,
  ReadRequest,
  StepContext,
  StepEvent,
} from '../../src/interpret/frames';
import type { KeptScope } from '../../src/interpret/kept-types';
import { step } from '../../src/interpret/step';
import type { RunState } from '../../src/state/run-state';
import {
  at,
  plus,
  contextOf,
  wired,
  lit,
  NOW,
  planOf,
  readOp,
  ret,
  seq,
  setVar,
  stateOf,
} from './core-support';

const HASH = 'c'.repeat(64);
const COUNT: Variable = { name: 'count', type: { t: 'number' }, initial: lit(5), persist: true };
const RESULT: FunctionInterface = {
  inputs: [],
  outputs: [{ name: 'value', type: { t: 'number' } }],
  exits: [],
};

interface Store {
  readonly kept: Map<string, JsonValue>;
  readonly reads: (KeptScope | undefined)[];
  readonly nodeReads: ReadRequest[];
  readonly requests: EffectRequest[];
}

interface Call {
  readonly id: string;
  readonly op: PlanOp;
}

function callOp(key: string, fn: string): Call {
  const where = at(key);
  return { id: where.id, op: { op: 'call', at: where, fn, inputs: {}, detached: false } };
}

function counter(): Plan {
  return planOf(
    seq(
      setVar('bump', { source: 'automation', name: 'count', to: wired('next.value') }),
      ret({ value: wired('vars.count') }),
      plus('next', 'vars.count', 1),
    ),
    { subject: 'function', variables: [COUNT] },
  );
}

function keyOf(scope: KeptScope | undefined, name: string): string {
  return `${scope?.instance ?? 'automation'}/${name}`;
}

function context(
  caller: Plan,
  callees: Record<string, Plan>,
  store: Store,
  state: RunState,
): StepContext {
  const base = contextOf(caller);
  const reads = {
    node: (request: ReadRequest): NodeResult => {
      store.nodeReads.push(request);
      return { ok: true, value: { value: 1 } };
    },
    variable: (name: string, kept?: KeptScope): Evaluated => {
      store.reads.push(kept);
      return { ok: true, value: store.kept.get(keyOf(kept, name)) };
    },
  };
  return {
    ...base,
    reads,
    plan: (frame): Plan => {
      const owner = planOwner(state, frame);
      return owner === null ? caller : (callees[owner.id] ?? caller);
    },
    ops: { ...CORE_OPS, ...callOps(() => ({ ok: true, value: RESULT })) },
    frames: { ...CORE_FRAMES, ...CALL_FRAMES },
  };
}

function resolve(store: Store, request: EffectRequest): NodeResult {
  store.requests.push(request);
  const { instance, target, to, initial } = request.params;
  if (typeof target !== 'string' || to === undefined) return { ok: true, value: {} };
  const scope = typeof instance === 'string' ? { instance, type: COUNT.type } : undefined;
  const previous = store.kept.get(keyOf(scope, target)) ?? initial ?? null;
  store.kept.set(keyOf(scope, target), to);
  return { ok: true, value: { value: to, previous } };
}

function run(caller: Plan, callees: Record<string, Plan>, store: Store): RunState {
  const refs = Object.keys(callees).map((id) => ({ id, revision: 1, hash: HASH }));
  const initial = stateOf();
  let state: RunState = { ...initial, planRefs: [...initial.planRefs, ...refs] };
  let event: StepEvent = { kind: 'start', now: NOW };
  for (let steps = 0; steps < 1000; steps += 1) {
    const stepped = step(context(caller, callees, store, state), state, event);
    state = stepped.state;
    if (stepped.outcome.kind === 'effect') {
      event = { kind: 'resolved', now: NOW, result: resolve(store, stepped.outcome.request) };
    } else if (stepped.outcome.kind === 'continue') {
      event = { kind: 'run', now: NOW };
    } else {
      return state;
    }
  }
  throw new Error('the run did not stop');
}

function fresh(): Store {
  return { kept: new Map(), reads: [], nodeReads: [], requests: [] };
}

describe('data a Custom Node keeps per instance', () => {
  it('keeps the data of two instances of the same Custom Node apart', () => {
    const first = callOp('first', 'fn1');
    const second = callOp('second', 'fn1');
    const store = fresh();
    run(planOf(seq(first.op, second.op, first.op, ret({}))), { fn1: counter() }, store);
    expect(store.kept.get(`${first.id}/count`)).toBe(7);
    expect(store.kept.get(`${second.id}/count`)).toBe(6);
    expect(store.kept.has('automation/count')).toBe(false);
  });

  it('starts an instance from the start value and sends the instance, type and start value', () => {
    const only = callOp('only', 'fn1');
    const store = fresh();
    run(planOf(seq(only.op, ret({}))), { fn1: counter() }, store);
    expect(store.requests[0]?.params).toMatchObject({
      source: 'automation',
      target: 'count',
      to: 6,
      instance: only.id,
      type: { t: 'number' },
      initial: 5,
    });
    expect(store.reads.every((scope) => scope?.type.t === 'number')).toBe(true);
  });

  it('keys a nested instance by the path of call nodes', () => {
    const inner = callOp('inner', 'fn1');
    const outer = callOp('outer', 'fn2');
    const store = fresh();
    const wrapper = planOf(seq(inner.op, ret({})), { subject: 'function' });
    run(planOf(seq(outer.op, ret({}))), { fn1: counter(), fn2: wrapper }, store);
    expect([...store.kept.keys()]).toEqual([`${outer.id}/${inner.id}/count`]);
  });

  it('gives a read node inside an instance the instance and its kept data', () => {
    const only = callOp('only', 'fn1');
    const callee = planOf(seq(readOp('r'), ret({ value: wired('r.value') })), {
      subject: 'function',
      variables: [COUNT],
    });
    const store = fresh();
    run(planOf(seq(only.op, ret({}))), { fn1: callee }, store);
    const [request] = store.nodeReads;
    expect(request?.instance).toBe(only.id);
    expect(request?.kept('count')).toEqual({
      ok: true,
      value: { instance: only.id, type: { t: 'number' }, start: 5 },
    });
    expect(request?.kept('missing')).toEqual({ ok: true, value: undefined });
  });

  it('reads an automation variable without an instance', () => {
    const automation = planOf(seq(ret({ value: wired('vars.count') })), {
      variables: [{ ...COUNT, initial: lit(0) }],
    });
    const store = fresh();
    store.kept.set('automation/count', 3);
    run(automation, {}, store);
    expect(store.reads).toEqual([undefined]);
    expect(instanceOf(stateOf())).toBe('');
  });
});
