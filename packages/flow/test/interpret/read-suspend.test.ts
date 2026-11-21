import { describe, expect, it } from 'vitest';
import type { NodeResult, StepResult } from '../../src/interpret/frames';
import { READ_PENDING, type ReadPending } from '../../src/interpret/read-pending';
import { step } from '../../src/interpret/step';
import type { RunState } from '../../src/state/run-state';
import { NOW, contextOf, planOf, readOp, ret, seq, spy, stateOf, wired } from './core-support';

describe('a read that is still being fetched', () => {
  it('leaves the state untouched and answers read, then the same event goes on once the read is there', () => {
    let fetched = false;
    const node = (): NodeResult | ReadPending =>
      fetched ? { ok: true, value: { value: 7 } } : READ_PENDING;
    const plan = planOf(seq(readOp('r'), ret({ value: wired('r.value') })));
    const ctx = contextOf(plan, spy(), {
      reads: { node, variable: () => ({ ok: true, value: undefined }) },
    });
    let state: RunState = step(ctx, stateOf(), { kind: 'start', now: NOW }).state;
    let stepped: StepResult = step(ctx, state, { kind: 'run', now: NOW });
    for (let turn = 0; stepped.outcome.kind === 'continue' && turn < 20; turn += 1) {
      state = stepped.state;
      stepped = step(ctx, state, { kind: 'run', now: NOW });
    }
    expect(stepped.outcome).toEqual({ kind: 'read' });
    expect(stepped.state).toBe(state);
    expect(stepped.records).toEqual([]);
    fetched = true;
    const resumed = step(ctx, state, { kind: 'run', now: NOW });
    expect(resumed.outcome.kind).toBe('done');
    expect(resumed.outcome.kind === 'done' ? resumed.outcome.outputs : null).toEqual({ value: 7 });
  });
});
