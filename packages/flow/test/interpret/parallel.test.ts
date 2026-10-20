import { describe, expect, it } from 'vitest';
import { NOW } from './parallel-support';
import type { PlanOp } from '../../src/compile/plan';
import {
  delay,
  doorSignal,
  effect,
  execute,
  wired,
  fail,
  failure,
  guarded,
  keys,
  listen,
  lit,
  output,
  parallel,
  ret,
  row,
  seq,
  setVar,
  tryOp,
} from './parallel-support';

const rootOutputs = (driven: ReturnType<typeof execute>): Record<string, unknown> =>
  driven.state.frames[0]?.outputs ?? {};

describe('parallel branches', () => {
  it('runs every branch and then continues after the region', () => {
    const driven = execute(
      seq(
        parallel('p', [
          ['one', seq(effect('a1'), effect('a2'))],
          ['two', seq(effect('b1'))],
        ]),
        effect('after'),
      ),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(keys(driven).sort()).toEqual(['a1', 'a2', 'after', 'b1']);
    expect(keys(driven).at(-1)).toBe('after');
  });

  it('lets branches wait at the same time so the region lasts as long as the longest wait', () => {
    const driven = execute(
      parallel('p', [
        ['slow', seq(delay('d1', 5000), effect('slow'))],
        ['quick', seq(delay('d2', 2000), effect('quick'))],
      ]),
    );
    expect(driven.requests).toEqual([
      { key: 'quick', at: 2000 },
      { key: 'slow', at: 5000 },
    ]);
    expect(driven.now).toBe(5000);
  });

  it('reads the parent run variables inside a branch', () => {
    const variables = [{ name: 'i', type: { t: 'number' as const }, initial: lit(4) }];
    const driven = execute(
      parallel('p', [
        ['one', effect('seen', { value: wired('vars.i') })],
        ['two', effect('other')],
      ]),
      { variables },
    );
    expect(driven.outcome.kind).toBe('done');
  });

  it('refuses a branch that writes a run variable', () => {
    const variables = [{ name: 'i', type: { t: 'number' as const }, initial: lit(0) }];
    const driven = execute(
      parallel('p', [
        ['writer', setVar('bump', { name: 'i', to: lit(9) })],
        ['reader', seq(delay('d', 100), effect('late'))],
      ]),
      { variables },
    );
    expect(failure(driven)?.message).toContain('wrote a run variable');
    expect(keys(driven)).not.toContain('late');
  });

  it('keeps the outputs of every branch in source order', () => {
    const outputs = [
      output('result', { one: lit('first'), two: lit('second') }),
      output('count', { two: lit(2) }),
    ];
    const driven = execute(
      seq(
        parallel(
          'r',
          [
            ['two', seq(delay('d', 10))],
            ['one', seq(effect('e'))],
          ],
          { outputs },
        ),
        effect('use', { result: wired('r.result'), count: wired('r.count') }),
      ),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(rootOutputs(driven)['r']).toEqual({ result: 'first', count: 2 });
  });

  it('reports settled branches without raising their errors', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['good', effect('good')],
          ['bad', fail(lit('boom'))],
        ],
        { join: 'settled' },
      ),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(rootOutputs(driven)['r']).toMatchObject({
      status: [
        { branch: 'good', ok: true },
        { branch: 'bad', ok: false },
      ],
    });
  });
});

describe('mixed waits', () => {
  const race = (): PlanOp =>
    parallel(
      'r',
      [
        ['door', seq(listen('door'), effect('opened'))],
        ['timeout', seq(delay('t', 60_000), effect('timedOut'))],
      ],
      { join: 'first' },
    );

  it('lets a device event win a race against a timer branch', () => {
    const driven = execute(race(), { signal: { at: NOW + 1000, signal: doorSignal(NOW + 1000) } });
    expect(keys(driven)).toEqual(['opened']);
    expect(driven.now).toBe(1000);
  });

  it('lets the timer win when no event arrives', () => {
    const driven = execute(race());
    expect(keys(driven)).toEqual(['timedOut']);
    expect(driven.now).toBe(60_000);
  });

  it('parks on a combined wait when every branch waits for an event', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['a', seq(listen('a'), effect('a-done'))],
          ['b', seq(listen('b'), effect('b-done'))],
        ],
        { join: 'first' },
      ),
      { signal: { at: NOW + 500, signal: doorSignal(NOW + 500) } },
    );
    expect(keys(driven)).toEqual(['a-done']);
  });
});

describe('joins', () => {
  const cleanup = (name: string): PlanOp =>
    guarded(
      name,
      seq(delay(`${name}-wait`, 9000), effect(`${name}-late`)),
      effect(`${name}-clean`),
    );

  it('first takes the winner and cancels the rest so their finally blocks run', () => {
    const outputs = [output('result', { quick: lit('fast'), slow: lit('slow') })];
    const driven = execute(
      parallel(
        'r',
        [
          ['slow', cleanup('slow')],
          ['quick', seq(delay('d', 100), effect('quick'))],
        ],
        { join: 'first', outputs },
      ),
    );
    expect(keys(driven)).toEqual(['quick', 'slow-clean']);
    expect(rootOutputs(driven)['r']).toEqual({ result: 'fast' });
  });

  it('first with failFast ends with the earliest error', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['slow', cleanup('slow')],
          ['bad', seq(delay('d', 50), fail(lit('early')))],
        ],
        { join: 'first' },
      ),
    );
    expect(failure(driven)?.message).toBe('early');
    expect(keys(driven)).toEqual(['slow-clean']);
  });

  it('first with settle ignores an error while another branch can still win', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['bad', fail(lit('ignored'))],
          ['good', seq(delay('d', 50), effect('good'))],
        ],
        { join: 'first', errors: 'settle' },
      ),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(keys(driven)).toEqual(['good']);
  });

  it('first with settle raises the first error when no branch succeeds', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['one', fail(lit('first error'))],
          ['two', seq(delay('d', 50), fail(lit('second error')))],
        ],
        { join: 'first', errors: 'settle' },
      ),
    );
    expect(failure(driven)?.message).toBe('first error');
  });

  it('all with failFast cancels the siblings on the first error and raises it', () => {
    const driven = execute(
      parallel('r', [
        ['slow', cleanup('slow')],
        ['bad', seq(delay('d', 10), fail(lit('stop it')))],
      ]),
    );
    expect(failure(driven)?.message).toBe('stop it');
    expect(keys(driven)).toEqual(['slow-clean']);
    expect(driven.now).toBe(10);
  });

  it('all with settle lets the siblings finish and then raises the first error', () => {
    const driven = execute(
      parallel(
        'r',
        [
          ['bad', fail(lit('late news'))],
          ['slow', seq(delay('d', 500), effect('finished'))],
        ],
        { errors: 'settle' },
      ),
    );
    expect(keys(driven)).toEqual(['finished']);
    expect(failure(driven)?.message).toBe('late news');
  });

  it('lets an outer try catch the error of a region', () => {
    const driven = execute(
      tryOp(
        'guard',
        parallel('r', [
          ['slow', cleanup('slow')],
          ['bad', seq(delay('d', 5), fail(lit('caught')))],
        ]),
        [row('rescue', effect('rescued'))],
      ),
    );
    expect(driven.outcome.kind).toBe('done');
    expect(keys(driven)).toEqual(['slow-clean', 'rescued']);
  });

  it('propagates a return from a branch after cancelling the others', () => {
    const driven = execute(
      seq(
        parallel('r', [
          ['slow', cleanup('slow')],
          ['leave', seq(delay('d', 20), ret({}, 'done'))],
        ]),
        effect('never'),
      ),
    );
    expect(driven.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    expect(keys(driven)).toEqual(['slow-clean']);
  });
});

describe('cancellation and budgets', () => {
  it('unwinds every branch when the run is cancelled while they wait', () => {
    const driven = execute(
      parallel('r', [
        ['one', guarded('g1', delay('w1', 9000), effect('f1'))],
        ['two', guarded('g2', delay('w2', 9000), effect('f2'))],
      ]),
      { cancelOnPark: true },
    );
    expect(driven.outcome).toMatchObject({ kind: 'done', status: 'cancelled' });
    expect(keys(driven).sort()).toEqual(['f1', 'f2']);
  });

  it('refuses a region wider than the width budget', () => {
    const driven = execute(
      parallel('r', [
        ['a', effect('a')],
        ['b', effect('b')],
        ['c', effect('c')],
      ]),
      { overrides: { parallelWidthRegion: 2 } },
    );
    expect(failure(driven)?.class).toBe('BudgetExceeded');
    expect(keys(driven)).toEqual([]);
  });

  it('counts nested regions against the width of the run', () => {
    const inner = parallel('x', [
      ['i1', effect('i1')],
      ['i2', effect('i2')],
    ]);
    const driven = execute(
      parallel('r', [
        ['a', inner],
        ['b', effect('b')],
      ]),
      { overrides: { parallelWidthRun: 3 } },
    );
    expect(failure(driven)?.class).toBe('BudgetExceeded');
  });

  it('runs a region inside a branch', () => {
    const inner = parallel('x', [
      ['i1', seq(delay('d1', 30), effect('i1'))],
      ['i2', seq(delay('d2', 10), effect('i2'))],
    ]);
    const driven = execute(
      parallel('r', [
        ['a', seq(inner, effect('a-after'))],
        ['b', effect('b')],
      ]),
    );
    expect(keys(driven)).toEqual(['b', 'i2', 'i1', 'a-after']);
  });
});
