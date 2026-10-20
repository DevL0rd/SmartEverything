import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import {
  breakOp,
  continueOp,
  delay,
  drive,
  effect,
  execute,
  wired,
  fail,
  failure,
  forEach,
  guarded,
  keys,
  lit,
  parallelContext,
  planOf,
  seq,
  stateOf,
} from './parallel-support';
import type { Driven } from './parallel-support';
import { branch, compute } from './core-support';

const results = (driven: Driven): unknown => {
  const outputs = driven.state.frames[0]?.outputs ?? {};
  return outputs['fe'];
};

const itemIs = (key: string, op: string, value: number): PlanOp =>
  compute(key, 'logic.compare', { a: wired('fe.item'), op: lit(op), b: lit(value) });

describe('for each with concurrency', () => {
  it('runs passes together and collects the results in source order', () => {
    const body = seq(delay('pause', wired('fe.item')), effect('done', { item: wired('fe.item') }));
    const driven = execute(
      forEach('fe', lit([300, 100, 200]), body, { collect: wired('fe.item'), concurrency: 3 }),
    );
    expect(driven.requests.map((request) => request.at)).toEqual([100, 200, 300]);
    expect(results(driven)).toEqual({ results: [300, 100, 200] });
  });

  it('never runs more passes at once than the concurrency allows', () => {
    const body = seq(delay('pause', 1000), effect('done'));
    const run = (concurrency: number): number =>
      execute(forEach('fe', lit([1, 2, 3, 4]), body, { concurrency })).now;
    expect(run(2)).toBe(2000);
    expect(run(4)).toBe(1000);
  });

  it('gives every pass its own scope outputs', () => {
    const body = effect('seen', {
      index: wired('fe.index'),
      position: wired('fe.position'),
      first: wired('fe.first'),
      last: wired('fe.last'),
      count: wired('fe.count'),
    });
    const driven = execute(forEach('fe', lit(['a', 'b']), body, { concurrency: 2 }));
    expect(driven.requests).toHaveLength(2);
    expect(driven.outcome.kind).toBe('done');
  });

  it('skips the collect of a pass that continues', () => {
    const body = seq(
      itemIs('two', 'eq', 2),
      branch('br', [['skip', wired('two.result'), continueOp('fe')]]),
    );
    const driven = execute(
      forEach('fe', lit([1, 2, 3]), body, { collect: wired('fe.item'), concurrency: 2 }),
    );
    expect(results(driven)).toEqual({ results: [1, 3] });
  });

  it('breaks by cancelling running passes and never starting the pending ones', () => {
    const slow = guarded('g', delay('long', 9000), effect('cleanup'));
    const body = seq(
      itemIs('one', 'eq', 1),
      itemIs('more', 'gt', 1),
      branch('br', [
        ['first', wired('one.result'), seq(delay('d', 100), breakOp('fe'))],
        ['rest', wired('more.result'), slow],
      ]),
    );
    const driven = execute(
      forEach('fe', lit([1, 2, 3, 4]), body, { collect: wired('fe.item'), concurrency: 2 }),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(keys(driven)).toEqual(['cleanup']);
    expect(driven.now).toBe(100);
  });

  it('cancels the running passes and raises when one pass fails', () => {
    const slow = guarded('g', delay('long', 9000), effect('cleanup'));
    const body = seq(
      itemIs('two', 'eq', 2),
      itemIs('other', 'ne', 2),
      branch('br', [
        ['bad', wired('two.result'), seq(delay('d', 10), fail(lit('pass failed')))],
        ['ok', wired('other.result'), slow],
      ]),
    );
    const driven = execute(forEach('fe', lit([1, 2, 3, 4]), body, { concurrency: 3 }));
    expect(failure(driven)?.message).toBe('pass failed');
    expect(keys(driven)).toEqual(['cleanup', 'cleanup']);
  });

  it('collects nothing and skips the body for an empty list', () => {
    const empty = execute(
      forEach('fe', lit([]), effect('never'), { collect: lit(1), concurrency: 2 }),
    );
    expect(keys(empty)).toEqual([]);
    expect(results(empty)).toEqual({ results: [] });
    const quiet = execute(forEach('fe', lit([]), effect('never'), { concurrency: 2 }));
    expect(results(quiet)).toBeUndefined();
  });

  it('reports a list that is not a list', () => {
    const driven = execute(forEach('fe', lit(5), effect('never'), { concurrency: 2 }));
    expect(failure(driven)?.class).toBe('TypeError');
  });

  it('keeps one pass at a time when the concurrency is 1', () => {
    const body = seq(delay('pause', 1000), effect('done'));
    const driven = execute(forEach('fe', lit([1, 2, 3]), body, { concurrency: 1 }));
    expect(driven.now).toBe(3000);
  });

  it('refuses a concurrency wider than the width budget', () => {
    const plan = planOf(forEach('fe', lit([1, 2, 3]), effect('x'), { concurrency: 3 }));
    const driven = drive(parallelContext(plan, { parallelWidthRegion: 2 }), stateOf());
    expect(failure(driven)?.class).toBe('BudgetExceeded');
  });

  it('refuses more passes than the iteration budget', () => {
    const plan = planOf(forEach('fe', lit([1, 2, 3]), effect('x'), { concurrency: 2 }));
    const driven = drive(parallelContext(plan, { loopIterations: 2 }), stateOf());
    expect(failure(driven)?.class).toBe('LimitExceeded');
  });

  it('reverses the list before dividing it into passes', () => {
    const body = effect('seen', { item: wired('fe.item') });
    const driven = execute(
      forEach('fe', lit([1, 2]), body, {
        collect: wired('fe.item'),
        concurrency: 2,
        reverse: true,
      }),
    );
    expect(results(driven)).toEqual({ results: [2, 1] });
  });

  it('raises an error of the collected value', () => {
    const divide = compute('split', 'math.divide', { a: wired('fe.item'), b: lit(0) });
    const driven = execute(
      forEach('fe', lit([1, 2]), seq(divide, effect('x')), {
        collect: wired('split.result'),
        concurrency: 2,
      }),
    );
    expect(failure(driven)?.class).toBe('MathError');
  });
});
