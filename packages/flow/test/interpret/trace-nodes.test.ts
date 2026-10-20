import { describe, expect, it } from 'vitest';
import { branch, contextOf, effect, lit, planOf, run, seq, setVar, stateOf } from './core-support';

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

describe('the node records of a run', () => {
  it('open an effect as running and close it as succeeded when it resolves', () => {
    const plan = planOf(seq(effect('first')));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.nodes.map((entry) => [entry.node, entry.status])).toEqual([
      ['first', 'running'],
      ['first', 'succeeded'],
    ]);
  });

  it('close an effect as failed with its error when it fails', () => {
    const plan = planOf(seq(effect('first')));
    const trace = run(contextOf(plan), stateOf(), {
      resolve: () => ({ ok: false, class: 'Failed', message: 'broken' }),
    });
    expect(trace.nodes.map((entry) => [entry.node, entry.status])).toEqual([
      ['first', 'running'],
      ['first', 'failed'],
    ]);
    expect(trace.nodes[1]?.error).toMatchObject({ class: 'Failed', message: 'broken' });
  });

  it('record a scope owner after its children, as the old trace did', () => {
    const plan = planOf(seq(branch('pick', [['row', lit(true), seq(effect('inner'))]])));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.nodes.map((entry) => `${entry.node}:${entry.status}`)).toEqual([
      'inner:running',
      'inner:succeeded',
      'pick:succeeded',
    ]);
  });

  it('record a synchronous node once as succeeded', () => {
    const plan = planOf(seq(setVar('count', { name: 'n', to: lit(1) })));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.nodes.map((entry) => [entry.node, entry.status])).toEqual([
      ['count', 'succeeded'],
    ]);
  });
});
