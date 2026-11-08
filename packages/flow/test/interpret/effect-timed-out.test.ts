import { describe, expect, it } from 'vitest';
import { contextOf, effect, planOf, run, seq, stateOf } from './core-support';

function ring(timedOut: boolean | undefined): string[] {
  const lane = effect('gaveUp');
  const body = seq(effect('ring', {}, { scopes: { timedOut: seq(lane) } }), effect('after'));
  const trace = run(contextOf(planOf(body)), stateOf(), {
    resolve: (request) => ({
      ok: true,
      value: request.node.key === 'ring' && timedOut !== undefined ? { timedOut } : {},
    }),
  });
  return trace.requests.map((request) => request.node.key);
}

describe('effect timed out exit', () => {
  it('runs the timed out lane and then the rest when the effect reports it timed out', () => {
    expect(ring(true)).toEqual(['ring', 'gaveUp', 'after']);
  });

  it('skips the lane when the effect did not time out', () => {
    expect(ring(false)).toEqual(['ring', 'after']);
    expect(ring(undefined)).toEqual(['ring', 'after']);
  });

  it('continues when nothing is wired to the timed out exit', () => {
    const trace = run(contextOf(planOf(seq(effect('ring'), effect('after')))), stateOf(), {
      resolve: () => ({ ok: true, value: { timedOut: true } }),
    });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['ring', 'after']);
  });
});
