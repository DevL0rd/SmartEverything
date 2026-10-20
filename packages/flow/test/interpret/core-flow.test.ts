import { describe, expect, it } from 'vitest';
import {
  branch,
  compute,
  contextOf,
  effect,
  wired,
  failedClass,
  guard,
  lit,
  output,
  planOf,
  readOp,
  ret,
  run,
  seq,
  setVar,
  spy,
  stateOf,
  switchOp,
} from './core-support';

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

function resultOf(trace: ReturnType<typeof run>, key: string): unknown {
  return trace.state.frames[0]?.outputs[key];
}

describe('sequences', () => {
  it('end a run with no operations as succeeded through the default exit', () => {
    const plan = planOf(seq());
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toEqual({ kind: 'done', status: 'succeeded', exit: 'done', outputs: {} });
  });

  it('run a nested sequence in order and then continue after it', () => {
    const plan = planOf(
      seq(effect('first'), seq(effect('second'), effect('third')), effect('fourth')),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
    expect(trace.outcome.kind).toBe('done');
  });

  it('skip pure and read nodes that sit in the sequence because they are evaluated on demand', () => {
    const log = spy();
    const plan = planOf(seq(compute('sum', 'test.add', { a: lit(1), b: lit(2) }), readOp('r')));
    const trace = run(contextOf(plan, log), stateOf());
    expect(trace.outcome.kind).toBe('done');
    expect(log.pure).toEqual([]);
    expect(log.reads).toEqual([]);
  });
});

describe('if', () => {
  it('runs the first row whose condition holds and no later row', () => {
    const plan = planOf(
      seq(
        branch('br', [
          ['no', lit(false), seq(effect('a'))],
          ['yes', lit(true), seq(effect('b'))],
          ['also', lit(true), seq(effect('c'))],
        ]),
        effect('after'),
      ),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['b', 'after']);
  });

  it('evaluates conditions lazily and stops at the first true one', () => {
    const log = spy();
    const plan = planOf(
      seq(
        branch('br', [
          ['one', lit(true), seq()],
          ['two', wired('sum.value'), seq()],
        ]),
        compute('sum', 'test.add', { a: lit(1), b: lit(1) }),
      ),
    );
    run(contextOf(plan, log), stateOf());
    expect(log.pure).toEqual([]);
  });

  it('runs the else scope when no row holds', () => {
    const plan = planOf(
      seq(branch('br', [['no', lit(false), seq(effect('a'))]], seq(effect('other')))),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['other']);
  });

  it('does nothing when no row holds and there is no else', () => {
    const plan = planOf(seq(branch('br', [['no', lit(false), seq(effect('a'))]]), effect('after')));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(resultOf(trace, 'br')).toBeUndefined();
  });

  it('leaves an empty output record when nothing ran but outputs are declared', () => {
    const plan = planOf(
      seq(branch('br', [['no', lit(false), seq()]], undefined, [output('x', { no: lit(1) })])),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(resultOf(trace, 'br')).toEqual({});
  });

  it('fails with TypeError naming the row when a condition is not true or false', () => {
    const plan = planOf(seq(branch('br', [['row-one', lit('yes'), seq()]])));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: {
        class: 'TypeError',
        message: 'the condition of row-one must be true or false, received "yes"',
      },
    });
  });

  it('collects structured outputs from the scope that ran, at the end of that scope', () => {
    const plan = planOf(
      seq(
        branch(
          'br',
          [
            ['big', lit(true), seq(compute('c', 'test.add', { a: lit(40), b: lit(2) }))],
            ['small', lit(false), seq()],
          ],
          seq(),
          [
            output('answer', { big: wired('c.value'), small: lit(1), else: lit(0) }),
            output('only', { small: lit('x') }),
          ],
        ),
      ),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(resultOf(trace, 'br')).toEqual({ answer: 42 });
  });

  it('keeps an output absent when its wire gives nothing', () => {
    const plan = planOf(
      seq(
        branch('br', [['a', lit(true), seq()]], undefined, [
          output('x', { a: wired('inputs.missing') }),
        ]),
      ),
    );
    const trace = run(contextOf(plan), stateOf({ inputs: {} }));
    expect(resultOf(trace, 'br')).toEqual({});
  });

  it('raises the failure of an output value as an error of the run', () => {
    const plan = planOf(
      seq(
        branch('br', [['a', lit(true), seq()]], undefined, [
          output('x', { a: wired('bad.value') }),
        ]),
        compute('bad', 'test.fail', {}),
      ),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(failedClass(trace)).toBe('MathError');
  });

  it('lets a scope see the outputs of earlier steps of the enclosing scopes', () => {
    const plan = planOf(
      seq(
        effect('fx'),
        branch('br', [['a', lit(true), seq(effect('inner', { v: wired('fx.value') }))]]),
      ),
    );
    const trace = run(contextOf(plan), stateOf(), {
      resolve: () => ({ ok: true, value: { value: 5 } }),
    });
    expect(trace.requests[1]?.params).toEqual({ v: 5 });
  });
});

describe('switch', () => {
  const keys = (trace: ReturnType<typeof run>): readonly string[] =>
    trace.requests.map((request) => request.node.key);

  function numbers(subject: number, extra = {}): readonly string[] {
    const plan = planOf(
      seq(
        switchOp(
          'sw',
          wired('inputs.s'),
          [
            ['low', { range: { max: 10 } }, seq(effect('low'))],
            ['mid', { range: { min: 10, max: 20 } }, seq(effect('mid'))],
            ['listed', { in: [30, 40] }, seq(effect('listed'))],
            ['exact', { eq: 50 }, seq(effect('exact'))],
          ],
          { default: seq(effect('default')), ...extra },
        ),
        effect('after'),
      ),
    );
    return keys(run(contextOf(plan), stateOf({ inputs: { s: subject } }), { resolve: ok }));
  }

  it('picks the case by range, list and exact value', () => {
    expect(numbers(5)).toEqual(['low', 'after']);
    expect(numbers(10)).toEqual(['low', 'after']);
    expect(numbers(20)).toEqual(['mid', 'after']);
    expect(numbers(40)).toEqual(['listed', 'after']);
    expect(numbers(50)).toEqual(['exact', 'after']);
    expect(numbers(25)).toEqual(['default', 'after']);
  });

  it('picks the case whose condition holds', () => {
    const plan = planOf(
      seq(
        switchOp('sw', lit(true), [
          ['no', { when: wired('inputs.flag') }, seq(effect('no'))],
          ['yes', { when: lit(true) }, seq(effect('yes'))],
        ]),
      ),
    );
    const trace = run(contextOf(plan), stateOf({ inputs: { flag: false } }), { resolve: ok });
    expect(keys(trace)).toEqual(['yes']);
  });

  it('lets a case condition run for a subject that is absent', () => {
    const plan = planOf(
      seq(
        switchOp('sw', wired('inputs.missing'), [
          ['when', { when: lit(true) }, seq(effect('ran'))],
        ]),
      ),
    );
    expect(keys(run(contextOf(plan), stateOf(), { resolve: ok }))).toEqual(['ran']);
  });

  it('compares text exactly', () => {
    const plan = planOf(
      seq(
        switchOp('sw', lit('x'), [
          ['a', { eq: 'x' }, seq(effect('a'))],
          ['b', { eq: 'y' }, seq(effect('b'))],
        ]),
      ),
    );
    expect(keys(run(contextOf(plan), stateOf(), { resolve: ok }))).toEqual(['a']);
  });

  it('runs only the first matching case in first mode', () => {
    expect(numbers(10, { mode: 'first' })).toEqual(['low', 'after']);
  });

  it('runs every matching case in order in all mode and no default when one ran', () => {
    expect(numbers(10, { mode: 'all' })).toEqual(['low', 'mid', 'after']);
  });

  it('runs the default in all mode when nothing matched', () => {
    expect(numbers(25, { mode: 'all' })).toEqual(['default', 'after']);
  });

  it('does nothing without a default when nothing matches', () => {
    const plan = planOf(
      seq(switchOp('sw', lit(99), [['a', { eq: 1 }, seq(effect('a'))]]), effect('after')),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['after']);
  });

  it('matches no value, range or list against an absent subject', () => {
    const plan = planOf(
      seq(
        switchOp('sw', wired('inputs.missing'), [
          ['a', { eq: 1 }, seq(effect('a'))],
          ['b', { in: [1] }, seq(effect('b'))],
          ['c', { range: { min: 0 } }, seq(effect('c'))],
        ]),
      ),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests).toEqual([]);
  });

  it('fails with TypeError when a range meets a subject that is not a number', () => {
    const plan = planOf(seq(switchOp('sw', lit('text'), [['a', { range: { min: 0 } }, seq()]])));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: {
        class: 'TypeError',
        message: 'the switch subject must be a number, received "text"',
      },
    });
  });

  it('fails when the subject value fails', () => {
    const plan = planOf(
      seq(switchOp('sw', wired('bad.value'), []), compute('bad', 'test.fail', {})),
    );
    expect(failedClass(run(contextOf(plan), stateOf()))).toBe('MathError');
  });

  it('fails when a case condition is not a boolean', () => {
    const plan = planOf(seq(switchOp('sw', lit(1), [['a', { when: lit(3) }, seq()]])));
    expect(failedClass(run(contextOf(plan), stateOf()))).toBe('TypeError');
  });

  it('collects the outputs of every scope that ran and keeps later values over earlier ones', () => {
    const plan = planOf(
      seq(
        switchOp(
          'sw',
          lit(10),
          [
            ['low', { range: { max: 10 } }, seq()],
            ['mid', { range: { min: 10 } }, seq()],
          ],
          {
            mode: 'all',
            outputs: [
              output('first', { low: lit('l') }),
              output('last', { low: lit('l'), mid: lit('m') }),
            ],
          },
        ),
      ),
    );
    const trace = run(contextOf(plan), stateOf());
    expect(resultOf(trace, 'sw')).toEqual({ first: 'l', last: 'm' });
  });

  it('keeps one read of a read node across the steps of an all-mode switch', () => {
    const log = spy();
    const plan = planOf(
      seq(
        switchOp(
          'sw',
          lit(1),
          [
            ['a', { when: wired('positive.result') }, seq()],
            ['b', { when: wired('positive.result') }, seq()],
          ],
          { mode: 'all' },
        ),
        readOp('r'),
        compute('positive', 'logic.compare', { a: wired('r.value'), op: lit('gt'), b: lit(0) }),
      ),
    );
    const trace = run(contextOf(plan, log), stateOf());
    expect(log.reads).toHaveLength(1);
    expect(trace.state.captures).toEqual({});
  });

  it('fails when the cursor lookup of a later case fails', () => {
    const plan = planOf(
      seq(
        switchOp(
          'sw',
          lit(1),
          [
            ['a', { eq: 1 }, seq()],
            ['b', { when: lit('no') }, seq()],
          ],
          { mode: 'all' },
        ),
      ),
    );
    expect(failedClass(run(contextOf(plan), stateOf()))).toBe('TypeError');
  });
});

describe('guard', () => {
  it('lets the sequence go on when the condition holds', () => {
    const plan = planOf(seq(guard('g', lit(true)), effect('after')));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(trace.records).toEqual([]);
  });

  it('ends the run as succeeded with a note when it fails at the top level', () => {
    const plan = planOf(seq(guard('g', lit(false)), effect('after')));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests).toEqual([]);
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    expect(trace.records).toEqual([{ kind: 'note', node: 'g', message: 'stopped by guard g' }]);
  });

  it('ends only the enclosing scope when it fails inside one and stays quiet by default', () => {
    const plan = planOf(
      seq(
        branch('br', [['a', lit(true), seq(guard('g', lit(false)), effect('inner'))]]),
        effect('after'),
      ),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(trace.records).toEqual([]);
  });

  it('notes the stop inside a scope when it is not quiet', () => {
    const plan = planOf(seq(branch('br', [['a', lit(true), seq(guard('g', lit(false), false))]])));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.records).toEqual([{ kind: 'note', node: 'g', message: 'stopped by guard g' }]);
  });

  it('fails with TypeError when the condition is not true or false', () => {
    const plan = planOf(seq(guard('g', lit(1))));
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: {
        class: 'TypeError',
        message: 'the condition of g must be true or false, received 1',
      },
    });
  });

  it('still finishes with the value returned from inside a scope', () => {
    const plan = planOf(
      seq(branch('br', [['a', lit(true), seq(ret({ v: lit(1) }, 'quit'))]]), setVar('v', {})),
    );
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      exit: 'quit',
      outputs: { v: 1 },
    });
  });
});
