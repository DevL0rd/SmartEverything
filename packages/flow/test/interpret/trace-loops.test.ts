import { describe, expect, it } from 'vitest';
import {
  drive,
  effect,
  limit,
  lit,
  loopContext,
  planOf,
  repeat,
  seq,
  stateOf,
} from './loops-support';
import type { Driven } from './loops-support';

function trace(driven: Driven): string[] {
  return driven.nodes.map((entry) => `${entry.node}:${entry.status}`);
}

function execute(body: ReturnType<typeof seq>): Driven {
  return drive(loopContext(planOf(body)), stateOf());
}

describe('the node records of loops', () => {
  it('record a loop once after its body, as the old trace did', () => {
    const driven = execute(seq(repeat('lp', lit(2), seq(effect('work')))));
    expect(trace(driven)).toEqual([
      'work:running',
      'work:succeeded',
      'work:running',
      'work:succeeded',
      'lp:succeeded',
    ]);
  });

  it('record nested loops innermost first, each once', () => {
    const inner = repeat('inner', lit(2), seq(effect('work')));
    const driven = execute(seq(repeat('outer', lit(2), seq(inner))));
    expect(trace(driven).filter((entry) => entry.startsWith('inner'))).toEqual([
      'inner:succeeded',
      'inner:succeeded',
    ]);
    expect(trace(driven).filter((entry) => entry.startsWith('outer'))).toEqual(['outer:succeeded']);
    expect(trace(driven).at(-1)).toBe('outer:succeeded');
  });

  it('record every loop around a failing node as failed, innermost first', () => {
    const inner = repeat('inner', lit(3), seq(effect('work')));
    const plan = planOf(seq(repeat('outer', lit(5), seq(inner))));
    const driven = drive(loopContext(plan), stateOf(), { failEffects: true });
    expect(trace(driven)).toEqual(['work:running', 'work:failed', 'inner:failed', 'outer:failed']);
  });

  it('record a loop that reaches its iteration limit with fail as failed once', () => {
    const op = repeat('lp', lit(5), seq(effect('work')), {
      limit: limit({ iterations: 2, onLimit: 'fail' }),
    });
    const driven = execute(seq(op));
    expect(trace(driven).filter((entry) => entry.startsWith('lp'))).toEqual(['lp:failed']);
  });

  it('record a loop with a refused count as failed once', () => {
    const driven = execute(seq(repeat('lp', lit(-1), seq(effect('work')))));
    expect(trace(driven)).toEqual(['lp:failed']);
  });
});
