import { describe, expect, it } from 'vitest';
import type { RunState } from '../../src/state/run-state';
import {
  InterpreterError,
  absorb,
  advance,
  asRecord,
  boolean,
  completeFrame,
  lookupOutput,
  makeEnv,
  mismatch,
  newFrame,
  opsOf,
  planAt,
  popFrame,
  present,
  propagate,
  pushFrame,
  rootFrame,
  runVars,
  setOutputs,
  setOwnerOutputs,
  setRootOutputs,
  setRunVar,
  text,
  topFrame,
  withTop,
} from '../../src/interpret/frames';
import { NOW, branch, contextOf, effect, lit, planOf, seq, stateOf } from './core-support';

function stacked(): RunState {
  const state = stateOf();
  const call = { ...newFrame(state, 'call', 'body'), id: 'c1' };
  const scope = { ...newFrame(state, 'branch', 'body'), id: 'b1' };
  return { ...state, frames: [...state.frames, call, scope] };
}

describe('plan paths', () => {
  const plan = planOf(seq(branch('br', [['row', lit(true), seq(effect('inner'))]])));

  it('lead to the operation they name', () => {
    expect(planAt(plan, 'body').op).toBe('seq');
    expect(planAt(plan, 'body/ops/0').op).toBe('branch');
    expect(planAt(plan, 'body/ops/0/rows/0/then/ops/0').op).toBe('effect');
  });

  it('are refused when they lead nowhere or to something that is not an operation', () => {
    expect(() => planAt(plan, 'body/ops/4')).toThrow(InterpreterError);
    expect(() => planAt(plan, 'body/ops/0/rows')).toThrow(
      'expected a plan operation, received body/ops/0/rows',
    );
    expect(() => planAt(plan, 'nowhere')).toThrow(InterpreterError);
    expect(() => planAt(plan, 'body/op/deeper')).toThrow(InterpreterError);
  });

  it('list the operations of a sequence and treat any other operation as a list of one', () => {
    expect(opsOf(seq(effect('a'), effect('b')))).toHaveLength(2);
    expect(opsOf(effect('a'))).toHaveLength(1);
  });
});

describe('the frame stack', () => {
  it('names a new frame after the step that makes it', () => {
    const state = stateOf();
    const frame = newFrame({ ...state, budgets: { ...state.budgets, steps: 12 } }, 'branch', 'p', {
      k: 1,
    });
    expect(frame).toEqual({
      id: 'f12',
      kind: 'branch',
      path: 'p',
      pc: 0,
      locals: { k: 1 },
      outputs: {},
    });
    expect(newFrame(state, 'loop', 'p').locals).toEqual({});
  });

  it('push, replace and pop frames', () => {
    const state = pushFrame(stateOf(), newFrame(stateOf(), 'branch', 'p'));
    expect(topFrame(state).kind).toBe('branch');
    const moved = withTop(state, (frame) => ({ ...frame, pc: 5 }));
    expect(moved.frames.map((frame) => frame.pc)).toEqual([0, 5]);
    expect(popFrame(moved).frames).toHaveLength(1);
  });

  it('refuse to read the top of an empty stack', () => {
    expect(() => topFrame({ ...stateOf(), frames: [] })).toThrow(InterpreterError);
  });

  it('move on one operation and forget what that activation captured', () => {
    const state = {
      ...stateOf(),
      captures: { 'f0:0/a': 1, 'f0:0/b': 2, 'f0:1/c': 3, 'f1:0/d': 4 },
    };
    const moved = advance(state);
    expect(moved.frames[0]?.pc).toBe(1);
    expect(moved.captures).toEqual({ 'f0:1/c': 3, 'f1:0/d': 4 });
  });

  it('forget everything a popped frame captured', () => {
    const state = {
      ...stacked(),
      captures: { 'b1:0/a': 1, 'b1:3/b': 2, 'c1:0/c': 3, 'f0:0/d': 4 },
    };
    expect(popFrame(state).captures).toEqual({ 'c1:0/c': 3, 'f0:0/d': 4 });
  });

  it('collect new captures into the state exactly once', () => {
    const env = makeEnv(contextOf(planOf(seq(effect('a')))), stateOf(), NOW);
    env.scratch.captured.set('f0:0/x', 1);
    expect(absorb(env, env.state).captures).toEqual({ 'f0:0/x': 1 });
    expect(absorb(env, env.state).captures).toEqual({});
  });
});

describe('outputs and variables', () => {
  it('write the outputs of a node into the top frame, the nearest owner or the root', () => {
    const state = stacked();
    expect(setOutputs(state, 'k', 1).frames.map((frame) => frame.outputs)).toEqual([
      {},
      {},
      { k: 1 },
    ]);
    expect(setOwnerOutputs(state, 'k', 2).frames.map((frame) => frame.outputs)).toEqual([
      {},
      { k: 2 },
      {},
    ]);
    expect(setRootOutputs(state, 'k', 3).frames.map((frame) => frame.outputs)).toEqual([
      { k: 3 },
      {},
      {},
    ]);
  });

  it('keep the variables in the nearest root or call frame', () => {
    const state = setRunVar(stacked(), 'v', 1);
    expect(state.frames.map((frame) => frame.locals)).toEqual([{}, { v: 1 }, {}]);
    expect(runVars(state)).toEqual({ v: 1 });
  });

  it('are refused without a root or call frame', () => {
    const state = { ...stacked(), frames: [newFrame(stateOf(), 'branch', 'p')] };
    expect(() => runVars(state)).toThrow(InterpreterError);
    expect(() => setOwnerOutputs(state, 'k', 1)).toThrow(InterpreterError);
    expect(() => setRunVar(state, 'k', 1)).toThrow('expected a root or call frame, received none');
  });

  it('look nodes up from the innermost frame and stop at a call boundary', () => {
    const base = stacked();
    const frames = base.frames.map((frame, index) => ({
      ...frame,
      outputs:
        index === 0 ? { outer: 1, both: 'root' } : index === 1 ? { both: 'call' } : { inner: 3 },
    }));
    const state = { ...base, frames };
    expect(lookupOutput(state, 'inner')).toBe(3);
    expect(lookupOutput(state, 'both')).toBe('call');
    expect(lookupOutput(state, 'outer')).toBeUndefined();
    const flat = { ...base, frames: [frames[0]!, frames[2]!] };
    expect(lookupOutput(flat, 'outer')).toBe(1);
  });

  it('read a record or an empty one', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord('x')).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });
});

describe('environments', () => {
  it('name the operation of the step and its place', () => {
    const plan = planOf(seq(effect('a'), effect('b')));
    const state = { ...stateOf(), frames: [{ ...rootFrame(), pc: 1 }] };
    const env = makeEnv(contextOf(plan), state, NOW);
    expect(env.at.key).toBe('b');
    expect(env.path).toBe('body/ops/1');
    expect(env.activation).toBe('f0:1');
  });

  it('name the automation itself when the frame has run out of operations', () => {
    const plan = planOf(seq(effect('a')));
    const state = { ...stateOf(), frames: [{ ...rootFrame(), pc: 1 }] };
    const env = makeEnv(contextOf(plan), state, NOW);
    expect(env.op).toBeUndefined();
    expect(env.at).toEqual({ id: state.automationId, key: 'run' });
  });

  it('use the frame path itself when the frame holds a single operation', () => {
    const env = makeEnv(contextOf(planOf(effect('only'))), stateOf(), NOW);
    expect(env.path).toBe('body');
    expect(env.at.key).toBe('only');
  });
});

describe('completing frames', () => {
  it('hands the completion to the handler of the frame kind', () => {
    const plan = planOf(seq());
    const env = makeEnv(contextOf(plan), stateOf(), NOW);
    expect(completeFrame(env, { kind: 'normal' }).outcome).toMatchObject({ kind: 'done' });
  });

  it('pops the frame and hands the completion to the frame below', () => {
    const plan = planOf(seq(effect('a')));
    const state = pushFrame(stateOf(), newFrame(stateOf(), 'branch', 'body', { scope: 's' }));
    const env = makeEnv(contextOf(plan), state, NOW);
    const result = propagate(env, { kind: 'cancelled', reason: 'shutdown' });
    expect(result.state.frames).toHaveLength(1);
    expect(result.outcome).toMatchObject({ kind: 'done', status: 'cancelled' });
  });
});

describe('checking values', () => {
  it('accept a value of the kind they expect', () => {
    expect(boolean({ ok: true, value: true }, 'x')).toEqual({ ok: true, value: true });
    expect(text({ ok: true, value: 'a' }, 'x')).toEqual({ ok: true, value: 'a' });
    expect(present({ ok: true, value: 0 }, 'x')).toEqual({ ok: true, value: 0 });
  });

  it('refuse any other value naming what was expected and received', () => {
    expect(boolean({ ok: true, value: 1 }, 'the flag')).toEqual({
      ok: false,
      class: 'TypeError',
      message: 'the flag must be true or false, received 1',
    });
    expect(text({ ok: true, value: undefined }, 'the name')).toMatchObject({
      message: 'the name must be text, received nothing',
    });
    expect(present({ ok: true, value: undefined }, 'it')).toMatchObject({
      message: 'it must be a value, received nothing',
    });
    expect(mismatch('x', 'a list', [1])).toMatchObject({
      message: 'x must be a list, received [1]',
    });
  });

  it('pass a failure through unchanged', () => {
    const failure = { ok: false as const, class: 'Refused' as const, message: 'no' };
    expect(boolean(failure, 'x')).toBe(failure);
    expect(text(failure, 'x')).toBe(failure);
    expect(present(failure, 'x')).toBe(failure);
  });
});
