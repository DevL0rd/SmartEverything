import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import {
  contextOf,
  effect,
  wired,
  lit,
  planOf,
  run,
  seq,
  setVar,
  spy,
  stateOf,
  BROKEN,
  broken,
  plus,
} from './core-support';

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

describe('effects', () => {
  it('asks the driver for the effect with the evaluated parameters and waits', () => {
    const op = effect(
      'fx',
      { a: lit(1), b: wired('more.value') },
      { retry: 'relative', budget: 'command' },
    );
    const state = stateOf({ inputs: { n: 2 } });
    const trace = run(contextOf(planOf(seq(op, plus('more', 'inputs.n', 1)))), state);
    expect(trace.outcome).toMatchObject({
      kind: 'effect',
      request: {
        kind: 'test.effect',
        node: { key: 'fx' },
        path: 'body/ops/0',
        activation: 'f0:0',
        key: `${state.runId}/f0:0`,
        params: { a: 1, b: 3 },
        retry: 'relative',
        budget: 'command',
      },
    });
    expect(trace.state.frames[0]?.pc).toBe(0);
  });

  it('leaves out parameters that evaluate to nothing', () => {
    const trace = run(
      contextOf(planOf(seq(effect('fx', { a: wired('inputs.missing') })))),
      stateOf(),
    );
    expect(trace.requests[0]?.params).toEqual({});
  });

  it('fails when a parameter fails', () => {
    const trace = run(
      contextOf(planOf(seq(effect('fx', { a: BROKEN }), broken()))),
      stateOf({ inputs: { n: 1 } }),
    );
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'MathError' } });
  });

  it('stores the outputs it is resolved with where later steps can see them', () => {
    const plan = planOf(seq(effect('fx'), effect('second', { v: wired('fx.value') })));
    const trace = run(contextOf(plan), stateOf(), {
      resolve: () => ({ ok: true, value: { value: 'done' } }),
    });
    expect(trace.requests.map((request) => request.params)).toEqual([{}, { v: 'done' }]);
    expect(trace.state.frames[0]?.outputs['fx']).toEqual({ value: 'done' });
  });

  it('clears the wait and the steps-since-suspension count when it is resolved', () => {
    const plan = planOf(seq(effect('fx')));
    const waiting = run(contextOf(plan), stateOf());
    expect(waiting.state.budgets.sinceSuspend).toBe(1);
    const resolved = run(contextOf(plan), waiting.state, { resolve: ok, start: false });
    expect(resolved.state.budgets.sinceSuspend).toBeLessThan(2);
    expect(resolved.outcome.kind).toBe('done');
  });

  it('fails with the class of the failure it is resolved with', () => {
    const plan = planOf(seq(effect('fx')));
    const trace = run(contextOf(plan), stateOf(), {
      resolve: () => ({ ok: false, class: 'Refused', message: 'no' }),
    });
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Refused', message: 'no', path: 'body/ops/0' },
    });
  });
});

describe('run variables', () => {
  const count = (extra = {}): PlanOp => setVar('v', { name: 'count', ...extra });

  it('set a value that later steps read and report the previous one', () => {
    const plan = planOf(
      seq(
        count({ to: lit(5) }),
        plus('next', 'vars.count', 1),
        count({ to: wired('next.value') }),
        effect('fx', { now: wired('vars.count'), was: wired('v.previous'), got: wired('v.value') }),
      ),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(trace.requests[0]?.params).toEqual({ now: 6, was: 5, got: 6 });
    expect(trace.state.frames[0]?.locals).toEqual({ count: 6 });
  });

  it('write into the variables of the root frame from inside nested scopes', () => {
    const plan = planOf(seq(count({ to: lit(1) }), effect('fx')));
    expect(run(contextOf(plan), stateOf()).state.frames[0]?.locals).toEqual({ count: 1 });
  });

  it('change through the change rule with the current value and the amount', () => {
    const log = spy();
    const change = { op: 'add', edge: 'wrap' as const };
    const plan = planOf(
      seq(
        count({ to: lit(10) }),
        count({ mode: 'change', change: { ...change, amount: lit(5) } }),
        count({ mode: 'change', change }),
        effect('fx', { v: wired('vars.count'), prev: wired('v.previous'), w: wired('v.wrapped') }),
      ),
    );
    const trace = run(contextOf(plan, log), stateOf());
    expect(log.changes).toEqual(['add', 'add']);
    expect(trace.requests[0]?.params).toEqual({ v: 16, prev: 15, w: false });
  });

  it('fail with the class of a refused change', () => {
    const plan = planOf(seq(count({ mode: 'change', change: { op: 'add', edge: 'clamp' } })));
    const ctx = contextOf(plan, spy(), {
      changeVar: () => ({ ok: false, class: 'Invalid', message: 'too big' }),
    });
    expect(run(ctx, stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Invalid', message: 'too big' },
    });
  });

  it('fail when the amount fails', () => {
    const change = { op: 'add', edge: 'wrap' as const, amount: BROKEN };
    const trace = run(
      contextOf(planOf(seq(count({ mode: 'change', change }), broken()))),
      stateOf({ inputs: { n: 1 } }),
    );
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'MathError' } });
  });

  it('are refused when the step names no variable', () => {
    const trace = run(contextOf(planOf(seq(setVar('v', { to: lit(1) })))), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Invalid', message: 'v names no variable' },
    });
  });

  it('are refused when a set has no value or a change has no rule', () => {
    const noValue = run(contextOf(planOf(seq(count()))), stateOf());
    expect(noValue.outcome).toMatchObject({ error: { message: 'v has no value to set' } });
    const noRule = run(contextOf(planOf(seq(count({ mode: 'change' })))), stateOf());
    expect(noRule.outcome).toMatchObject({ error: { message: 'v has no change to apply' } });
  });

  it('are refused when the new value is absent or fails', () => {
    const absent = run(contextOf(planOf(seq(count({ to: wired('inputs.missing') })))), stateOf());
    expect(absent.outcome).toMatchObject({
      error: { class: 'TypeError', message: 'the value must be a value, received nothing' },
    });
    const failing = run(
      contextOf(planOf(seq(count({ to: BROKEN }), broken()))),
      stateOf({ inputs: { n: 1 } }),
    );
    expect(failing.outcome).toMatchObject({ error: { class: 'MathError' } });
  });
});

describe('persistent variables and values', () => {
  it('ask the driver to set an automation variable', () => {
    const plan = planOf(seq(setVar('v', { source: 'automation', name: 'level', to: lit(3) })));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'effect',
      request: {
        kind: 'var.set',
        node: { key: 'v' },
        params: { source: 'automation', target: 'level', to: 3 },
        retry: 'idempotent',
        budget: 'none',
      },
    });
    expect(trace.state.frames[0]?.locals).toEqual({});
  });

  it('ask the driver to change a home value by its identifier', () => {
    const change = { op: 'next', edge: 'wrap' as const, field: 'f', steps: [1, 2], amount: lit(2) };
    const plan = planOf(
      seq(
        setVar('v', { source: 'home', mode: 'change', value: 'value-id', name: 'ignored', change }),
      ),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(trace.requests[0]).toMatchObject({
      kind: 'var.change',
      params: {
        source: 'home',
        target: 'value-id',
        change: { op: 'next', edge: 'wrap', field: 'f', steps: [1, 2], amount: 2 },
      },
    });
  });

  it('leave the optional parts of a change out when they are not set', () => {
    const plan = planOf(
      seq(
        setVar('v', {
          source: 'automation',
          mode: 'change',
          name: 'n',
          change: { op: 'toggle', edge: 'clamp' },
        }),
      ),
    );
    expect(run(contextOf(plan), stateOf()).requests[0]?.params).toEqual({
      source: 'automation',
      target: 'n',
      change: { op: 'toggle', edge: 'clamp' },
    });
  });

  it('store what the driver answers where later steps can see it', () => {
    const plan = planOf(
      seq(
        setVar('v', { source: 'automation', name: 'level', to: lit(3) }),
        effect('fx', { got: wired('v.value') }),
      ),
    );
    const trace = run(contextOf(plan), stateOf(), {
      resolve: (request) =>
        request.kind === 'var.set' ? { ok: true, value: { value: 3 } } : { ok: true, value: {} },
    });
    expect(trace.requests[1]?.params).toEqual({ got: 3 });
  });

  it('fail when the driver refuses', () => {
    const plan = planOf(seq(setVar('v', { source: 'automation', name: 'level', to: lit(3) })));
    const trace = run(contextOf(plan), stateOf(), {
      resolve: () => ({ ok: false, class: 'Invalid', message: 'overflow' }),
    });
    expect(trace.outcome).toMatchObject({ error: { class: 'Invalid', message: 'overflow' } });
  });
});
