import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InterpreterError, newFrame, pushFrame } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { resolveBudgets } from '../../src/state/budgets';
import {
  NOW,
  BROKEN,
  broken,
  plus,
  compute,
  contextOf,
  effect,
  wired,
  guard,
  lit,
  planOf,
  run,
  seq,
  spy,
  stateOf,
} from './core-support';

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

describe('starting a run', () => {
  it('gives the run variables their initial values and counts no step', () => {
    const plan = planOf(seq(plus('more', 'inputs.n', 1)), {
      variables: [
        { name: 'a', type: { t: 'number' }, initial: lit(1) },
        { name: 'b', type: { t: 'number' }, initial: wired('more.value') },
        { name: 'p', type: { t: 'number' }, initial: lit(9), persist: true },
      ],
    });
    const stepped = step(contextOf(plan), stateOf({ inputs: { n: 4 } }), {
      kind: 'start',
      now: NOW,
    });
    expect(stepped.outcome).toEqual({ kind: 'continue' });
    expect(stepped.state.frames[0]?.locals).toEqual({ a: 1, b: 5 });
    expect(stepped.state.budgets.steps).toBe(0);
  });

  it('fails when an initial value fails or has no value', () => {
    const variable = (initial: ReturnType<typeof lit>): ReturnType<typeof planOf> =>
      planOf(seq(broken()), { variables: [{ name: 'a', type: { t: 'number' }, initial }] });
    const failing = run(contextOf(variable(BROKEN)), stateOf({ inputs: { n: 1 } }));
    expect(failing.outcome).toMatchObject({ kind: 'failed', error: { class: 'MathError' } });
    const absent = run(contextOf(variable(wired('inputs.missing'))), stateOf());
    expect(absent.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Invalid', message: 'the initial value of a is absent' },
    });
  });
});

describe('stepping', () => {
  it('counts each step and takes one operation per step', () => {
    const plan = planOf(seq(effect('a'), effect('b')));
    const first = step(contextOf(plan), stateOf(), { kind: 'run', now: NOW });
    expect(first.outcome.kind).toBe('effect');
    expect(first.state.budgets.steps).toBe(1);
  });

  it('runs a plan whose root is a single operation', () => {
    const trace = run(contextOf(planOf(effect('only'))), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['only']);
    expect(trace.outcome.kind).toBe('done');
  });

  it('ends a run of skipped operations after one step for each and one to finish', () => {
    const plan = planOf(seq(compute('a', 'test.add', {}), compute('b', 'test.add', {})));
    expect(run(contextOf(plan), stateOf()).steps).toBe(4);
  });

  it('fails with BudgetExceeded when too many steps pass without a suspension', () => {
    const plan = planOf(seq(guard('a', lit(true)), guard('b', lit(true)), guard('c', lit(true))));
    const ctx = contextOf(plan, spy(), { limits: resolveBudgets({ stepsInARow: 2 }) });
    const trace = run(ctx, stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: {
        class: 'BudgetExceeded',
        detail: { budget: 'steps_in_a_row', limit: 2, used: 3 },
      },
    });
  });

  it('fails with BudgetExceeded when the total number of steps is used up', () => {
    const plan = planOf(seq(effect('a'), effect('b'), effect('c')));
    const ctx = contextOf(plan, spy(), { limits: resolveBudgets({ stepsTotal: 3 }) });
    const trace = run(ctx, stateOf(), { resolve: ok });
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'BudgetExceeded', detail: { budget: 'steps_total' } },
    });
  });

  it('reports no operation as an error of the plan path when the frame points nowhere', () => {
    const state = stateOf();
    const broken = { ...state, frames: [{ ...state.frames[0]!, path: 'body/ops/9' }] };
    expect(() => step(contextOf(planOf(seq())), broken, { kind: 'run', now: NOW })).toThrow(
      InterpreterError,
    );
  });

  it('fails when an operation has no interpreter', () => {
    const plan = planOf(seq(effect('a')));
    const ctx = contextOf(plan, spy(), { ops: {} });
    expect(run(ctx, stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Failed', message: 'no interpreter is registered for the operation effect' },
    });
  });

  it('fails when a frame kind has no interpreter', () => {
    const plan = planOf(seq());
    const state = stateOf();
    const loop = newFrame(state, 'loop', 'body');
    const ctx = contextOf(plan);
    const trace = run(ctx, pushFrame(state, loop), { start: false });
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'no interpreter is registered for the frame kind loop' },
    });
  });
});

describe('cancelling', () => {
  it('ends a parked run as cancelled with the reason and clears its wait', () => {
    const plan = planOf(seq(effect('a')));
    const parked = run(contextOf(plan), stateOf());
    const waiting = {
      ...parked.state,
      wait: { kind: 'breakpoint' as const, nodePath: 'body/ops/0', durable: false },
      cancel: { reason: 'user_stop' as const, requestedAt: NOW },
    };
    const stepped = step(contextOf(plan), waiting, { kind: 'run', now: NOW });
    expect(stepped.outcome).toEqual({
      kind: 'done',
      status: 'cancelled',
      exit: 'done',
      outputs: {},
      reason: 'user_stop',
    });
    expect(stepped.state.wait).toBeUndefined();
  });
});

describe('resolving', () => {
  it('settles the operation that is waiting and clears the wait', () => {
    const plan = planOf(seq(effect('a')));
    const parked = run(contextOf(plan), stateOf());
    const waiting = {
      ...parked.state,
      wait: { kind: 'breakpoint' as const, nodePath: 'body/ops/0', durable: false },
      budgets: { ...parked.state.budgets, sinceSuspend: 9 },
    };
    const stepped = step(contextOf(plan), waiting, {
      kind: 'resolved',
      now: NOW,
      result: { ok: true, value: { value: 1 } },
    });
    expect(stepped.state.wait).toBeUndefined();
    expect(stepped.state.budgets.sinceSuspend).toBe(0);
    expect(stepped.state.frames[0]?.pc).toBe(1);
  });

  it('is refused when no operation is waiting for it', () => {
    const plan = planOf(seq());
    expect(() =>
      step(contextOf(plan), stateOf(), {
        kind: 'resolved',
        now: NOW,
        result: { ok: true, value: {} },
      }),
    ).toThrow(InterpreterError);
  });

  it('fails when the waiting operation cannot be settled', () => {
    const plan = planOf(seq(guard('g', lit(true))));
    const stepped = step(contextOf(plan), stateOf(), {
      kind: 'resolved',
      now: NOW,
      result: { ok: true, value: {} },
    });
    expect(stepped.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'no interpreter is registered for settling the operation guard' },
    });
  });
});

describe('properties', () => {
  it('every straight run of effects and skipped nodes ends done with one request per effect', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('effect', 'skip', 'nested'), { maxLength: 20 }),
        (kinds) => {
          const ops = kinds.map((kind, index) => {
            if (kind === 'effect') return effect(`e${String(index)}`);
            if (kind === 'skip') return compute(`c${String(index)}`, 'test.add', {});
            return seq(effect(`n${String(index)}`));
          });
          const trace = run(contextOf(planOf(seq(...ops))), stateOf(), { resolve: ok });
          expect(trace.outcome.kind).toBe('done');
          expect(trace.requests).toHaveLength(kinds.filter((kind) => kind !== 'skip').length);
        },
      ),
      { numRuns: 20 },
    );
  });
});
