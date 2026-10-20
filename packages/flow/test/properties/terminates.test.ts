import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planOps } from '../../src/compile/manifest';
import { cases } from '../arbitraries/program-arb';
import { LOOP_ITERATIONS, NAMED_CLASSES, STEPS_TOTAL, runToEnd } from '../arbitraries/rig';
import { LONG, RUNS } from './support';

describe('every generated program', () => {
  it(
    'ends, parks or fails with a named class within the budgets',
    () => {
      fc.assert(
        fc.property(cases, ({ rig, seed }) => {
          const finished = runToEnd(rig, seed);
          const { ending, state } = finished;
          if (ending.kind === 'failed') expect(NAMED_CLASSES.has(ending.errorClass)).toBe(true);
          if (ending.kind === 'done') expect(ending.status).toBe('succeeded');
          if (state.budgets.steps > STEPS_TOTAL) {
            expect(ending).toEqual({ kind: 'failed', errorClass: 'BudgetExceeded' });
          }
          for (const used of Object.values(state.budgets.iterations)) {
            expect(used).toBeLessThanOrEqual(LOOP_ITERATIONS + 1);
          }
        }),
        { numRuns: RUNS },
      );
    },
    LONG,
  );

  it('reaches every kind of operation the interpreter has', () => {
    const seen = new Set<string>();
    const outcomes = new Set<string>();
    for (const { rig, seed } of fc.sample(cases, { numRuns: 300, seed: 11 })) {
      for (const op of [...planOps(rig.main), ...planOps(rig.callee)]) seen.add(op.op);
      const { ending } = runToEnd(rig, seed);
      outcomes.add(ending.kind === 'failed' ? ending.errorClass : ending.kind);
    }
    for (const op of ['loop', 'wait', 'call', 'parallel', 'try', 'branch', 'effect', 'set_var']) {
      expect(seen.has(op)).toBe(true);
    }
    expect(outcomes.has('done')).toBe(true);
    expect(outcomes.has('LimitExceeded')).toBe(true);
    expect(outcomes.size).toBeGreaterThan(4);
  });
});
