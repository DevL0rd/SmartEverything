import { describe, expect, it } from 'vitest';
import type { Variable } from '@smarteverything/domain';
import type { NodeResult, PureEvaluator } from '../../src/interpret/frames';
import {
  NOW,
  compute,
  contextOf,
  effect,
  wired,
  lit,
  planOf,
  readOp,
  run,
  seq,
  setVar,
  spy,
  stateOf,
} from './core-support';

const params = (trace: ReturnType<typeof run>, index = 0): unknown => trace.requests[index]?.params;

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

const persistent = (name: string): Variable => ({
  name,
  type: { t: 'number' },
  initial: lit(0),
  persist: true,
});

describe('the reserved roots', () => {
  it('give the trigger payload, the inputs, the home and the run', () => {
    const state = stateOf({
      payload: { device: 'lamp', key: 'press', at: '2026-10-18T03:30:00+07:00' },
      inputs: { a: 'x' },
    });
    const plan = planOf(
      seq(
        effect('fx', {
          t: wired('trigger.device'),
          k: wired('trigger.key'),
          i: wired('inputs.a'),
          h: wired('home.name'),
          r: wired('run.id'),
          o: wired('run.automation'),
          s: wired('run.startedAt'),
        }),
      ),
    );
    const trace = run(contextOf(plan), state);
    expect(params(trace)).toEqual({
      t: 'lamp',
      k: 'press',
      i: 'x',
      h: 'Home',
      r: state.runId,
      o: { automation: state.automationId },
      s: new Date(NOW).toISOString(),
    });
  });

  it('give nothing for a trigger field when the run has no trigger payload', () => {
    const plan = planOf(seq(effect('fx', { t: wired('trigger.device') })));
    expect(params(run(contextOf(plan), stateOf()))).toEqual({});
  });

  it('give the run variables', () => {
    const plan = planOf(
      seq(setVar('s', { name: 'k', to: lit(2) }), effect('fx', { v: wired('vars.k') })),
    );
    expect(params(run(contextOf(plan), stateOf()))).toEqual({ v: 2 });
  });
});

describe('persistent variables', () => {
  it('are read once per activation, captured, and only when named', () => {
    const log = spy();
    const plan = planOf(seq(effect('fx', { a: wired('vars.p'), b: wired('vars.p') })), {
      variables: [persistent('p'), persistent('q')],
    });
    const trace = run(contextOf(plan, log), stateOf());
    expect(log.variables).toEqual(['p']);
    expect(params(trace)).toEqual({ a: 100, b: 100 });
    expect(trace.state.captures).toEqual({ 'f0:0/vars.p': 100 });
  });

  it('keep the value captured earlier in the same activation', () => {
    const log = spy();
    const plan = planOf(seq(effect('fx', { a: wired('vars.p') })), {
      variables: [persistent('p')],
    });
    const first = run(contextOf(plan, log), stateOf());
    const again = run(contextOf(plan, log), first.state, { start: false });
    expect(log.variables).toEqual(['p']);
    expect(params(again)).toEqual({ a: 100 });
  });

  it('are left out when they have no value', () => {
    const plan = planOf(seq(effect('fx', { a: wired('vars.p') })), {
      variables: [persistent('p')],
    });
    const ctx = contextOf(plan, spy(), {
      reads: {
        node: () => ({ ok: true, value: {} }),
        variable: () => ({ ok: true, value: undefined }),
      },
    });
    expect(params(run(ctx, stateOf()))).toEqual({});
  });

  it('fail the step when they cannot be read', () => {
    const plan = planOf(seq(effect('fx', { a: wired('vars.p') })), {
      variables: [persistent('p')],
    });
    const ctx = contextOf(plan, spy(), {
      reads: {
        node: () => ({ ok: true, value: {} }),
        variable: () => ({ ok: false, class: 'NotFound', message: 'gone' }),
      },
    });
    expect(run(ctx, stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'NotFound', message: 'gone' },
    });
  });
});

describe('nodes that have not run', () => {
  it('give nothing through a wire', () => {
    const plan = planOf(seq(effect('fx', { seen: wired('x.value') })));
    expect(params(run(contextOf(plan), stateOf()))).toEqual({});
  });
});

describe('pure nodes', () => {
  it('are evaluated once for everything an activation needs from them', () => {
    const log = spy();
    const plan = planOf(
      seq(
        compute('sum', 'test.add', { a: lit(1), b: lit(2) }),
        effect('fx', { a: wired('sum.value'), b: wired('sum.value') }),
      ),
    );
    expect(params(run(contextOf(plan, log), stateOf()))).toEqual({ a: 3, b: 3 });
    expect(log.pure).toEqual(['add']);
  });

  it('are evaluated again for another activation', () => {
    const log = spy();
    const plan = planOf(
      seq(
        compute('sum', 'test.add', { a: lit(1), b: lit(2) }),
        effect('one', { a: wired('sum.value') }),
        effect('two', { a: wired('sum.value') }),
      ),
    );
    run(contextOf(plan, log), stateOf(), { resolve: ok });
    expect(log.pure).toEqual(['add', 'add']);
  });

  it('feed each other through their ports', () => {
    const plan = planOf(
      seq(
        compute('a', 'test.add', { a: lit(1), b: lit(2) }),
        compute('b', 'test.add', { a: wired('a.value'), b: lit(10) }),
        effect('fx', { v: wired('b.value') }),
      ),
    );
    expect(params(run(contextOf(plan), stateOf()))).toEqual({ v: 13 });
  });

  it('only evaluate the ports they ask for', () => {
    const log = spy();
    const plan = planOf(
      seq(
        compute('sel', 'test.select', {
          condition: lit(true),
          whenTrue: lit('yes'),
          whenFalse: wired('r.value'),
        }),
        readOp('r'),
        effect('fx', { v: wired('sel.value') }),
      ),
    );
    expect(params(run(contextOf(plan, log), stateOf()))).toEqual({ v: 'yes' });
    expect(log.reads).toEqual([]);
  });

  it('tell the evaluator which ports exist and answer nothing for the others', () => {
    let seen: unknown;
    const plan = planOf(
      seq(compute('sum', 'test.add', { a: lit(1) }), effect('fx', { v: wired('sum.value') })),
    );
    const ctx = contextOf(plan, spy(), {
      pure: (): PureEvaluator => ({
        evaluate: (request): NodeResult => {
          seen = [request.kind, request.ports.names, request.ports.get('missing')];
          return { ok: true, value: { value: 1 } };
        },
      }),
    });
    run(ctx, stateOf());
    expect(seen).toEqual(['test.add', ['a'], undefined]);
  });

  it('fail the step with the class the evaluator gives', () => {
    const plan = planOf(
      seq(compute('bad', 'test.fail', {}), effect('fx', { v: wired('bad.value') })),
    );
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'MathError', message: 'boom' },
    });
  });

  it('fail the step when no evaluator is registered for the kind', () => {
    const plan = planOf(
      seq(compute('sum', 'test.unknown', {}), effect('fx', { v: wired('sum.value') })),
    );
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Failed', message: 'no evaluator is registered for test.unknown' },
    });
  });
});

describe('read nodes', () => {
  it('are read once per activation and captured with their value', () => {
    const log = spy();
    const plan = planOf(
      seq(readOp('r'), effect('fx', { a: wired('r.value'), b: wired('r.value') })),
    );
    const trace = run(contextOf(plan, log), stateOf());
    expect(log.reads).toHaveLength(1);
    expect(params(trace)).toEqual({ a: 1, b: 1 });
    expect(trace.state.captures).toEqual({ 'f0:1/r': { value: 1 } });
    expect(trace.records).toEqual([
      { kind: 'capture', activation: 'f0:1', node: 'r', value: { value: 1 } },
    ]);
  });

  it('are read again for another activation', () => {
    const log = spy();
    const plan = planOf(
      seq(
        readOp('r'),
        effect('one', { a: wired('r.value') }),
        effect('two', { a: wired('r.value') }),
      ),
    );
    const trace = run(contextOf(plan, log), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.params)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('use the value already captured for the activation', () => {
    const log = spy();
    const plan = planOf(seq(readOp('r'), effect('fx', { a: wired('r.value') })));
    const first = run(contextOf(plan, log), stateOf());
    const again = run(contextOf(plan, log), first.state, { start: false });
    expect(log.reads).toHaveLength(1);
    expect(params(again)).toEqual({ a: 1 });
  });

  it('pass their evaluated inputs, the seed and the activation to the read port', () => {
    let seen: unknown;
    const plan = planOf(
      seq(readOp('r', { device: lit('lamp') }), effect('fx', { a: wired('r.value') })),
    );
    const ctx = contextOf(plan, spy(), {
      reads: {
        node: (request) => {
          seen = request;
          return { ok: true, value: { value: 0 } };
        },
        variable: () => ({ ok: true, value: 0 }),
      },
    });
    run(ctx, stateOf());
    expect(seen).toMatchObject({
      kind: 'test.read',
      node: { key: 'r' },
      inputs: { device: 'lamp' },
      seed: 7,
      activation: 'f0:1',
    });
  });

  it('fail the step when the read fails', () => {
    const plan = planOf(seq(readOp('r'), effect('fx', { a: wired('r.value') })));
    const ctx = contextOf(plan, spy(), {
      reads: {
        node: () => ({ ok: false, class: 'Unreachable', message: 'offline' }),
        variable: () => ({ ok: true, value: 0 }),
      },
    });
    expect(run(ctx, stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Unreachable', message: 'offline' },
    });
  });

  it('fail the step when an input of the read fails', () => {
    const plan = planOf(
      seq(
        compute('div', 'math.divide', { a: wired('inputs.n'), b: lit(0) }),
        readOp('r', { device: wired('div.result') }),
        effect('fx', { a: wired('r.value') }),
      ),
    );
    expect(run(contextOf(plan), stateOf({ inputs: { n: 1 } })).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'MathError' },
    });
  });
});
