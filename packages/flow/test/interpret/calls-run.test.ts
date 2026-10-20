import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import { CORE_OPS } from '../../src/interpret/core-ops';
import { RUN_AUTOMATION_KIND, RUN_OPS } from '../../src/interpret/run-automation';
import { resolveBudgets } from '../../src/state/budgets';
import {
  BROKEN,
  at,
  broken,
  contextOf,
  wired,
  failedClass,
  lit,
  planOf,
  plus,
  run,
  seq,
  stateOf,
  uuid,
} from './core-support';

const TARGET = uuid();

function runOp(
  extra: Partial<Extract<PlanOp, { op: 'run' }>> = {},
  inputs: Extract<PlanOp, { op: 'run' }>['inputs'] = {},
): PlanOp {
  return {
    op: 'run',
    at: at('r'),
    automation: TARGET,
    wait: false,
    allowSelf: false,
    inputs,
    detached: true,
    ...extra,
  };
}

function ctx(
  body: PlanOp,
  ancestry?: number,
  values: readonly PlanOp[] = [],
): ReturnType<typeof contextOf> {
  return contextOf(planOf(seq(body, ret(), ...values)), undefined, {
    ops: { ...CORE_OPS, ...RUN_OPS },
    limits: resolveBudgets(ancestry === undefined ? {} : { ancestry }),
  });
}

function ret(): PlanOp {
  return { op: 'return', at: at('end'), values: {} };
}

describe('run automation', () => {
  it('asks the driver for a detached run with the evaluated inputs', () => {
    const state = stateOf({ inputs: { n: 2 } });
    const body = runOp({}, { a: lit(1), b: wired('more.value') });
    const trace = run(ctx(body, undefined, [plus('more', 'inputs.n', 1)]), state);
    expect(trace.outcome).toMatchObject({
      kind: 'effect',
      request: {
        kind: RUN_AUTOMATION_KIND,
        node: { key: 'r' },
        path: 'body/ops/0',
        key: `${state.runId}/f0:0`,
        retry: 'external',
        budget: 'none',
        params: {
          automation: TARGET,
          inputs: { a: 1, b: 3 },
          wait: false,
          parentRunId: state.runId,
          causeChain: [{ automationId: state.automationId, runId: state.runId }],
        },
      },
    });
  });

  it('extends the cause chain of the run with itself', () => {
    const parent = { automationId: uuid(), runId: uuid() };
    const state = stateOf({ causeChain: [parent] });
    const trace = run(ctx(runOp()), state);
    expect(trace.requests[0]?.params['causeChain']).toEqual([
      parent,
      { automationId: state.automationId, runId: state.runId },
    ]);
  });

  it('continues without outputs after a detached run starts', () => {
    const trace = run(ctx(runOp()), stateOf(), { resolve: () => ({ ok: true, value: { x: 1 } }) });
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    expect(trace.state.frames[0]?.outputs['r']).toEqual({});
  });

  it('asks to wait only when the node says so and keeps the callee outputs', () => {
    const trace = run(ctx(runOp({ wait: true })), stateOf(), {
      resolve: () => ({ ok: true, value: { x: 1 } }),
    });
    expect(trace.requests[0]?.params['wait']).toBe(true);
    expect(trace.state.frames[0]?.outputs['r']).toEqual({ x: 1 });
  });

  it('propagates the failure of a waited run as an error', () => {
    const trace = run(ctx(runOp({ wait: true })), stateOf(), {
      resolve: () => ({ ok: false, class: 'Failed', message: 'callee failed' }),
    });
    expect(failedClass(trace)).toBe('Failed');
    expect(trace.outcome).toMatchObject({ error: { message: 'callee failed' } });
  });

  it('raises a run that could not start even when it is not waited for', () => {
    const trace = run(ctx(runOp()), stateOf(), {
      resolve: () => ({ ok: false, class: 'NotFound', message: 'no such automation' }),
    });
    expect(failedClass(trace)).toBe('NotFound');
  });

  it('raises an input that cannot be evaluated', () => {
    const trace = run(ctx(runOp({}, { a: BROKEN }), undefined, [broken()]), stateOf());
    expect(failedClass(trace)).toBe('MathError');
    expect(trace.requests).toEqual([]);
  });
});

describe('run automation ancestry', () => {
  it('refuses to run the automation itself', () => {
    const state = stateOf();
    const trace = run(ctx(runOp({ automation: state.automationId })), state);
    expect(failedClass(trace)).toBe('Forbidden');
    expect(trace.requests).toEqual([]);
  });

  it('refuses an automation that is an ancestor in the cause chain', () => {
    const state = stateOf({ causeChain: [{ automationId: TARGET, runId: uuid() }] });
    const trace = run(ctx(runOp()), state);
    expect(failedClass(trace)).toBe('Forbidden');
    expect(trace.outcome.kind === 'failed' ? trace.outcome.error.message : '').toContain(TARGET);
  });

  it('runs itself when the node allows it', () => {
    const state = stateOf();
    const trace = run(ctx(runOp({ automation: state.automationId, allowSelf: true })), state);
    expect(trace.outcome.kind).toBe('effect');
  });

  it('has no chain limit unless the automation sets one', () => {
    const chain = Array.from({ length: 500 }, () => ({ automationId: uuid(), runId: uuid() }));
    const trace = run(ctx(runOp({ allowSelf: true })), stateOf({ causeChain: chain }));
    expect(trace.outcome.kind).toBe('effect');
  });

  it('stops at the ancestry budget set on the automation even when the node allows itself', () => {
    const chain = Array.from({ length: 8 }, () => ({ automationId: uuid(), runId: uuid() }));
    const state = stateOf({ causeChain: chain });
    const trace = run(ctx(runOp({ allowSelf: true }), 8), state);
    expect(failedClass(trace)).toBe('BudgetExceeded');
    expect(trace.outcome).toMatchObject({
      error: { detail: { budget: 'ancestry', limit: 8, used: 9 } },
    });
  });

  it('allows a chain exactly as long as the budget', () => {
    const chain = Array.from({ length: 7 }, () => ({ automationId: uuid(), runId: uuid() }));
    const trace = run(ctx(runOp(), 8), stateOf({ causeChain: chain }));
    expect(trace.outcome.kind).toBe('effect');
  });

  it('follows the ancestry budget set on the automation', () => {
    const state = stateOf({ causeChain: [{ automationId: uuid(), runId: uuid() }] });
    const trace = run(ctx(runOp(), 1), state);
    expect(failedClass(trace)).toBe('BudgetExceeded');
  });
});
