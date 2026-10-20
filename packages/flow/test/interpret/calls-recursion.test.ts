import { describe, expect, it } from 'vitest';
import type { Plan, PlanOp } from '../../src/compile/plan';
import { step } from '../../src/interpret/step';
import type { RunState } from '../../src/state/run-state';
import { branch, compute, wired, failedClass, lit, planOf, ret, seq, NOW } from './core-support';
import {
  begin,
  callOp,
  contextFor,
  drive,
  functionPlan,
  iface,
  input,
  output,
  probe,
  start,
} from './calls-support';
import type { Rig } from './calls-support';

const NUMBER_IO = iface({ inputs: [input('n')], outputs: [output('value')] });
const FLAG_IO = iface({
  inputs: [input('n')],
  outputs: [{ name: 'value', type: { t: 'boolean' } }],
});

const LESS: PlanOp = compute('less', 'math.subtract', { a: wired('inputs.n'), b: lit(1) });

function whenZero(base: PlanOp, otherwise: PlanOp): PlanOp {
  const isZero = compute('isZero', 'logic.compare', {
    a: wired('inputs.n'),
    op: lit('lte'),
    b: lit(0),
  });
  return seq(isZero, LESS, branch('base', [['zero', wired('isZero.result'), base]], otherwise));
}

function selfCalling(combine: string, base: number): Plan {
  const combined = compute('combined', combine, { a: wired('inputs.n'), b: wired('c.value') });
  return functionPlan(
    whenZero(
      seq(ret({ value: lit(base) })),
      seq(
        callOp('c', 'self', { n: wired('less.result') }),
        combined,
        ret({ value: wired('combined.result') }),
      ),
    ),
  );
}

function recursion(n: number, combine: string, base: number): Rig {
  return {
    caller: planOf(seq(callOp('c', 'self', { n: lit(n) }), ret({ result: wired('c.value') }))),
    callees: { self: selfCalling(combine, base) },
    interfaces: { self: NUMBER_IO },
  };
}

const factorial = (n: number): Rig => recursion(n, 'math.multiply', 1);

const sumTo = (n: number): Rig => recursion(n, 'math.add', 0);

function parity(other: string, atZero: boolean): PlanOp {
  return whenZero(
    seq(ret({ value: lit(atZero) })),
    seq(callOp('c', other, { n: wired('less.result') }), ret({ value: wired('c.value') })),
  );
}

function evenness(n: number): Rig {
  return {
    caller: planOf(seq(callOp('c', 'even', { n: lit(n) }), ret({ result: wired('c.value') }))),
    callees: {
      even: functionPlan(parity('odd', true)),
      odd: functionPlan(parity('even', false)),
    },
    interfaces: { even: FLAG_IO, odd: FLAG_IO },
  };
}

const ENDLESS: Rig = {
  caller: planOf(seq(callOp('c', 'fn1'), probe())),
  callees: { fn1: functionPlan(seq(callOp('again', 'fn1'))) },
};

function callFrames(state: RunState): number {
  return state.frames.filter((frame) => frame.kind === 'call').length;
}

function advance(rig: Rig, from: RunState, steps: number): RunState {
  let state = from;
  for (let taken = 0; taken < steps; taken += 1) {
    state = step(contextFor(rig, state), state, { kind: 'run', now: NOW }).state;
  }
  return state;
}

describe('recursion', () => {
  it('lets a Custom Node call itself until its base case, like a factorial', () => {
    expect(start(factorial(5)).outcome).toMatchObject({ kind: 'done', outputs: { result: 120 } });
    expect(start(factorial(0)).outcome).toMatchObject({ kind: 'done', outputs: { result: 1 } });
  });

  it('has no depth limit: a thousand nested calls finish with every frame unwound', () => {
    const trace = start(sumTo(1000));
    expect(trace.outcome).toMatchObject({ kind: 'done', outputs: { result: 500_500 } });
    expect(callFrames(trace.state)).toBe(0);
  });

  it('runs mutual recursion between two Custom Nodes', () => {
    expect(start(evenness(7)).outcome).toMatchObject({ outputs: { result: false } });
    expect(start(evenness(10)).outcome).toMatchObject({ outputs: { result: true } });
  });

  it('stops a deep recursion when the run is stopped', () => {
    const deep = advance(ENDLESS, begin(ENDLESS), 1500);
    expect(callFrames(deep)).toBeGreaterThan(100);
    const stopped = drive(ENDLESS, { ...deep, cancel: { reason: 'user_stop', requestedAt: NOW } });
    expect(stopped.outcome).toMatchObject({
      kind: 'done',
      status: 'cancelled',
      reason: 'user_stop',
    });
    expect(stopped.requests).toEqual([]);
  });

  it('fails a runaway recursion on the run state memory guard, not on a depth number', () => {
    const trace = start({ ...ENDLESS, budgets: { runStateBytes: 64 * 1024 } });
    expect(failedClass(trace)).toBe('BudgetExceeded');
    expect(trace.outcome).toMatchObject({
      error: { detail: { budget: 'run_state', limit: 64 * 1024 } },
    });
    expect(trace.steps).toBeGreaterThan(100);
  });
});
