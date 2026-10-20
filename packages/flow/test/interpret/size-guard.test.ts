import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import { resolveBudgets } from '../../src/state/budgets';
import { compute, lit, run, setVar, wired } from './core-support';
import { loopContext, planOf, seq, stateOf, whileLoop } from './loops-support';

const MORE: PlanOp = compute('more', 'test.concat', {
  a: wired('vars.text'),
  b: lit('xxxxxxxxxxxxxxxx'),
});

const GROW: PlanOp = seq(MORE, setVar('grow', { name: 'text', to: wired('more.value') }));

function growing(): ReturnType<typeof planOf> {
  return planOf(whileLoop('forever', { lit: true }, seq(GROW)), {
    variables: [{ name: 'text', type: { t: 'text' }, initial: { lit: '' } }],
  });
}

describe('the run state size guard', () => {
  it('stops a loop that keeps growing a run variable without any limit on the loop', () => {
    const plan = growing();
    const ctx = { ...loopContext(plan), limits: resolveBudgets({ runStateBytes: 200_000 }) };
    const trace = run(ctx, stateOf(), { limit: 100_000 });
    expect(trace.outcome.kind).toBe('failed');
    if (trace.outcome.kind === 'failed') {
      expect(trace.outcome.error.class).toBe('BudgetExceeded');
      expect(trace.outcome.error.message).toContain('run_state');
    }
  });

  it('checks at once when one write passes the check step and is larger than the whole budget', () => {
    const once = compute('once', 'test.concat', { a: wired('vars.text'), b: lit('x') });
    const plan = planOf(seq(once, setVar('big', { name: 'text', to: wired('once.value') })), {
      variables: [{ name: 'text', type: { t: 'text' }, initial: { lit: 'y'.repeat(70_000) } }],
    });
    const ctx = { ...loopContext(plan), limits: resolveBudgets({ runStateBytes: 1_000 }) };
    const trace = run(ctx, stateOf());
    expect(trace.outcome.kind).toBe('failed');
  });

  it('leaves a small run alone', () => {
    const plan = planOf(seq(GROW), {
      variables: [{ name: 'text', type: { t: 'text' }, initial: { lit: '' } }],
    });
    const trace = run(loopContext(plan), stateOf());
    expect(trace.outcome.kind).toBe('done');
  });
});
