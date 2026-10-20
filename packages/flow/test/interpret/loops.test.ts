import { describe, expect, it } from 'vitest';
import { step } from '../../src/interpret/step';
import { resolveBudgets } from '../../src/state/budgets';
import {
  at,
  breakOp,
  bump,
  continueOp,
  counter,
  doUntil,
  drive,
  effect,
  wired,
  forEach,
  NOW,
  gap,
  limit,
  lit,
  loop,
  loopContext,
  planOf,
  range,
  repeat,
  seq,
  stateOf,
  whileLoop,
} from './loops-support';
import type { Driven } from './loops-support';
import { branch, compute, guard } from './core-support';
import type { PlanOp } from '../../src/compile/plan';
import type { StepContext } from '../../src/interpret/frames';
import type { RunState } from '../../src/state/run-state';

const BROKEN: PlanOp = compute('broken', 'math.divide', { a: lit(1), b: lit(0) });

function test(key: string, source: string, op: string, value: number): PlanOp {
  return compute(key, 'logic.compare', { a: wired(source), op: lit(op), b: lit(value) });
}

function execute(body: ReturnType<typeof seq>, work = 0, variables = counter()): Driven {
  const plan = planOf(body, { variables });
  return drive(loopContext(plan), stateOf(), { work });
}

function failure(driven: Driven): { class: string; message: string; detail?: unknown } | undefined {
  return driven.outcome.kind === 'failed' ? driven.outcome.error : undefined;
}

const probe = (
  key = 'lp',
  extra: Record<string, ReturnType<typeof lit>> = {},
): ReturnType<typeof effect> => effect('work', { index: wired(`${key}.index`), ...extra });

const indexes = (driven: Driven): unknown[] =>
  driven.requests.map((request) => request.params['index']);

describe('for each', () => {
  it('visits a snapshot of the list with the scope outputs of every pass', () => {
    const body = seq(
      effect('work', {
        item: wired('fe.item'),
        index: wired('fe.index'),
        position: wired('fe.position'),
        first: wired('fe.first'),
        last: wired('fe.last'),
        count: wired('fe.count'),
      }),
    );
    const driven = execute(seq(forEach('fe', lit(['a', 'b', 'c']), body)));
    expect(driven.outcome.kind).toBe('done');
    expect(driven.requests.map((request) => request.params)).toEqual([
      { item: 'a', index: 0, position: 1, first: true, last: false, count: 3 },
      { item: 'b', index: 1, position: 2, first: false, last: false, count: 3 },
      { item: 'c', index: 2, position: 3, first: false, last: true, count: 3 },
    ]);
  });

  it('keeps iterating the original list when the list changes during the loop', () => {
    const body = seq(probe('fe', { item: wired('fe.item') }), {
      op: 'set_var',
      at: at('shrink'),
      mode: 'set',
      source: 'run',
      name: 'list',
      to: lit([]),
      retry: 'idempotent',
      budget: 'none',
    });
    const variables = [
      {
        name: 'list',
        type: { t: 'list' as const, of: { t: 'any' as const } },
        initial: lit([1, 2, 3]),
      },
    ];
    const driven = execute(seq(forEach('fe', wired('vars.list'), body)), 0, variables);
    expect(driven.requests.map((request) => request.params['item'])).toEqual([1, 2, 3]);
  });

  it('skips the body for an empty list', () => {
    const driven = execute(seq(forEach('fe', lit([]), seq(probe('fe')))));
    expect(driven.requests).toEqual([]);
    expect(driven.outcome.kind).toBe('done');
  });

  it('walks the list from the end when reversed', () => {
    const body = seq(effect('work', { item: wired('fe.item') }));
    const driven = execute(seq(forEach('fe', lit([1, 2, 3]), body, { reverse: true })));
    expect(driven.requests.map((request) => request.params['item'])).toEqual([3, 2, 1]);
  });

  it('refuses something that is not a list', () => {
    const driven = execute(seq(forEach('fe', lit('nope'), seq(probe('fe')))));
    expect(failure(driven)).toMatchObject({ class: 'TypeError' });
  });

  it('fails with the class of a list that cannot be read', () => {
    const driven = execute(seq(BROKEN, forEach('fe', wired('broken.result'), seq(probe('fe')))));
    expect(failure(driven)?.class).toBe('MathError');
  });

  it('refuses a concurrency above one because that belongs to the concurrent loop', () => {
    const driven = execute(seq(forEach('fe', lit([1]), seq(probe('fe')), { concurrency: 2 })));
    expect(failure(driven)).toMatchObject({ class: 'Failed' });
  });

  it('collects the value of every pass that reached its end into results', () => {
    const times = compute('times', 'math.multiply', { a: wired('fe.item'), b: lit(10) });
    const op = forEach('fe', lit([1, 2, 3]), seq(times), { collect: wired('times.result') });
    const driven = execute(seq(op));
    expect(driven.state.frames[0]?.outputs['fe']).toEqual({ results: [10, 20, 30] });
  });

  it('collects nothing for a pass that ended by continue and keeps results after break', () => {
    const body = seq(
      test('two', 'fe.item', 'eq', 2),
      test('four', 'fe.item', 'eq', 4),
      branch('skip', [['even', wired('two.result'), continueOp('fe')]]),
      branch('stop', [['five', wired('four.result'), breakOp('fe')]]),
    );
    const op = forEach('fe', lit([1, 2, 3, 4, 5]), body, { collect: wired('fe.item') });
    const driven = execute(seq(op));
    expect(driven.state.frames[0]?.outputs['fe']).toEqual({ results: [1, 3] });
  });

  it('raises the class of a collect value that cannot be read', () => {
    const op = forEach('fe', lit([1]), seq(BROKEN), { collect: wired('broken.result') });
    expect(failure(execute(seq(op)))?.class).toBe('MathError');
  });

  it('refuses a collect value that is absent', () => {
    const op = forEach('fe', lit([1]), seq(), { collect: wired('absent.value') });
    const plan = planOf(seq(op));
    const ctx = loopContext(plan);
    expect(failure(drive(ctx, stateOf()))).toMatchObject({ class: 'TypeError' });
  });
});

describe('repeat', () => {
  it('runs the body the evaluated number of times with index and position', () => {
    const body = seq(effect('work', { index: wired('lp.index'), position: wired('lp.position') }));
    const driven = execute(seq(repeat('lp', lit(3), body)));
    expect(driven.requests.map((request) => request.params)).toEqual([
      { index: 0, position: 1 },
      { index: 1, position: 2 },
      { index: 2, position: 3 },
    ]);
  });

  it('skips the body for zero', () => {
    expect(execute(seq(repeat('lp', lit(0), seq(probe())))).requests).toEqual([]);
  });

  it('fails with the class of a count that cannot be read', () => {
    const driven = execute(seq(BROKEN, repeat('lp', wired('broken.result'), seq(probe()))));
    expect(failure(driven)?.class).toBe('MathError');
  });

  it('runs a gap-first order without a condition as a plain repeat', () => {
    const op = repeat('lp', lit(2), seq(probe()), { order: 'test_then_gap', gap: gap(10) });
    expect(indexes(execute(seq(op)))).toEqual([0, 1]);
  });

  it('refuses a count that is not a whole number of at least zero', () => {
    for (const times of [lit(-1), lit(1.5), lit('x')]) {
      expect(failure(execute(seq(repeat('lp', times, seq(probe())))))).toMatchObject({
        class: 'TypeError',
      });
    }
  });

  it('fails at the start when the count is above the iteration budget', () => {
    const plan = planOf(seq(repeat('lp', lit(11), seq(probe()))));
    const ctx = loopContext(plan, { limits: resolveBudgets({ loopIterations: 10 }) });
    const driven = drive(ctx, stateOf());
    expect(driven.requests).toEqual([]);
    expect(failure(driven)).toMatchObject({
      class: 'LimitExceeded',
      detail: { budget: 'loop_iterations', limit: 10, used: 11 },
    });
  });

  it('fails when a loop without a source bound passes the iteration budget', () => {
    const plan = planOf(seq(whileLoop('lp', lit(true), seq(effect('work')))));
    const ctx = loopContext(plan, { limits: resolveBudgets({ loopIterations: 3 }) });
    const driven = drive(ctx, stateOf());
    expect(driven.requests).toHaveLength(3);
    expect(failure(driven)).toMatchObject({
      class: 'LimitExceeded',
      detail: { budget: 'loop_iterations', limit: 3, used: 4 },
    });
  });
});

describe('for range', () => {
  const values = (driven: Driven): unknown[] =>
    driven.requests.map((request) => request.params['value']);
  const body = seq(effect('work', { value: wired('rg.value'), index: wired('rg.index') }));

  it('counts up including both ends', () => {
    const op = range('rg', { from: lit(1), to: lit(7), step: lit(3) }, body);
    expect(values(execute(seq(op)))).toEqual([1, 4, 7]);
  });

  it('stops before an end that the step does not reach', () => {
    const op = range('rg', { from: lit(0), to: lit(10), step: lit(4) }, body);
    expect(values(execute(seq(op)))).toEqual([0, 4, 8]);
  });

  it('counts down from the first bound to the second whichever sign the step has', () => {
    for (const step of [-10, 10]) {
      const op = range('rg', { from: lit(100), to: lit(70), step: lit(step) }, body);
      expect(values(execute(seq(op)))).toEqual([100, 90, 80, 70]);
    }
  });

  it('keeps tenths exact enough to reach the end', () => {
    const op = range('rg', { from: lit(0), to: lit(0.3), step: lit(0.1) }, body);
    expect(execute(seq(op)).requests).toHaveLength(4);
  });

  it('runs once when both bounds are equal', () => {
    const op = range('rg', { from: lit(5), to: lit(5), step: lit(1) }, body);
    expect(values(execute(seq(op)))).toEqual([5]);
  });

  it('refuses a zero step and bounds that are not numbers', () => {
    const zero = range('rg', { from: lit(0), to: lit(1), step: lit(0) }, body);
    expect(failure(execute(seq(zero)))).toMatchObject({ class: 'Invalid' });
    for (const bounds of [
      { from: lit('a'), to: lit(1), step: lit(1) },
      { from: lit(0), to: lit('a'), step: lit(1) },
      { from: lit(0), to: lit(1), step: lit('a') },
    ]) {
      expect(failure(execute(seq(range('rg', bounds, body))))).toMatchObject({
        class: 'TypeError',
      });
    }
  });

  it('fails with the class of a bound that cannot be read', () => {
    const bounds = { from: wired('broken.result'), to: lit(1), step: lit(1) };
    expect(failure(execute(seq(BROKEN, range('rg', bounds, body))))?.class).toBe('MathError');
  });

  it('fails at the start when the range is above the iteration budget', () => {
    const op = range('rg', { from: lit(0), to: lit(100), step: lit(1) }, body);
    const ctx = loopContext(planOf(seq(op)), { limits: resolveBudgets({ loopIterations: 50 }) });
    expect(failure(drive(ctx, stateOf()))).toMatchObject({ class: 'LimitExceeded' });
  });
});

describe('while and do until', () => {
  it('while checks before the first pass and may never run the body', () => {
    const op = whileLoop('lp', wired('below.result'), seq(effect('work'), bump()));
    expect(execute(seq(test('below', 'vars.i', 'lt', 0), op)).requests).toEqual([]);
  });

  it('do until runs the body once even when the condition already holds', () => {
    const op = doUntil('lp', wired('reached.result'), seq(effect('work'), bump()));
    expect(execute(seq(test('reached', 'vars.i', 'gte', 0), op)).requests).toHaveLength(1);
  });

  it('while follows its condition across passes', () => {
    const op = whileLoop('lp', wired('below.result'), seq(probe(), bump()));
    expect(indexes(execute(seq(test('below', 'vars.i', 'lt', 3), op)))).toEqual([0, 1, 2]);
  });

  it('do until stops right after the body that satisfies the condition', () => {
    const op = doUntil('lp', wired('reached.result'), seq(probe(), bump()));
    expect(indexes(execute(seq(test('reached', 'vars.i', 'gte', 3), op)))).toEqual([0, 1, 2]);
  });

  it('refuses a condition that is not true or false', () => {
    const op = whileLoop('lp', lit('yes'), seq(probe()));
    expect(failure(execute(seq(op)))).toMatchObject({ class: 'TypeError' });
    const after = doUntil('lp', lit('yes'), seq(probe()));
    expect(failure(execute(seq(after)))).toMatchObject({ class: 'TypeError' });
  });

  it('gives a while loop whose list is exhausted and gap not skipped one last wait', () => {
    const op = forEach('fe', lit([1, 2]), seq(probe('fe')), { gap: gap(500, false) });
    const driven = execute(seq(op));
    expect(driven.parks.map((wait) => wait.kind)).toEqual(['duration', 'duration']);
    expect(driven.now).toBe(1000);
  });
});

describe('gaps', () => {
  it('parks for the gap between passes and never after the last count', () => {
    const op = repeat('lp', lit(3), seq(probe()), { gap: gap(1000) });
    const driven = execute(seq(op));
    expect(driven.parks.map((wait) => wait.kind === 'duration' && wait.dueAt - 0)).toHaveLength(2);
    expect(driven.requests.map((request) => request.at)).toEqual([0, 1000, 2000]);
    expect(driven.now).toBe(2000);
  });

  it('describes the park with an absolute due instant, the loop path and durability', () => {
    const op = repeat('lp', lit(2), seq(probe()), { gap: gap(1000) });
    const driven = execute(seq(op));
    const [wait] = driven.parks;
    expect(wait).toMatchObject({ kind: 'duration', nodePath: 'body/ops/0', durable: true });
  });

  it('does not wait at all when the gap is not set', () => {
    const driven = execute(seq(repeat('lp', lit(3), seq(probe()))));
    expect(driven.parks).toEqual([]);
  });

  it('fails the run when the wake of the gap fails', () => {
    const op = repeat('lp', lit(3), seq(probe()), { gap: gap(1000) });
    const driven = drive(loopContext(planOf(seq(op))), stateOf(), { failGap: true });
    expect(failure(driven)).toMatchObject({ class: 'Failed', message: 'the wake failed' });
  });

  it('cancels a run that is stopped while the loop waits in its gap', () => {
    const op = repeat('lp', lit(3), seq(probe()), { gap: gap(1000) });
    const driven = drive(loopContext(planOf(seq(op))), stateOf(), { cancelOnPark: true });
    expect(driven.outcome).toMatchObject({
      kind: 'done',
      status: 'cancelled',
      reason: 'user_stop',
    });
  });
});

describe('break and continue', () => {
  it('break leaves the innermost loop and the run goes on after it', () => {
    const body = seq(
      probe(),
      test('second', 'lp.index', 'eq', 1),
      branch('stop', [['at2', wired('second.result'), breakOp('lp')]]),
      effect('late'),
    );
    const driven = execute(seq(repeat('lp', lit(5), body), effect('after')));
    expect(driven.requests.map((request) => request.key)).toEqual([
      'work',
      'late',
      'work',
      'after',
    ]);
  });

  it('continue ends the pass and starts the next one', () => {
    const body = seq(
      test('second', 'lp.index', 'eq', 1),
      branch('skip', [['odd', wired('second.result'), continueOp('lp')]]),
      probe(),
    );
    expect(indexes(execute(seq(repeat('lp', lit(3), body))))).toEqual([0, 2]);
  });

  it('break with a label leaves the outer loop from the inner one', () => {
    const inner = repeat(
      'inner',
      lit(3),
      seq(
        effect('work', { o: wired('outer.index'), i: wired('inner.index') }),
        test('second', 'inner.index', 'eq', 1),
        branch('b', [['x', wired('second.result'), breakOp('outer')]]),
      ),
    );
    const driven = execute(seq(repeat('outer', lit(3), seq(inner)), effect('after')));
    expect(driven.requests.map((request) => request.params)).toEqual([
      { o: 0, i: 0 },
      { o: 0, i: 1 },
      {},
    ]);
  });

  it('continue with a label ends the pass of the outer loop', () => {
    const inner = repeat(
      'inner',
      lit(3),
      seq(
        effect('work', { o: wired('outer.index'), i: wired('inner.index') }),
        test('first', 'inner.index', 'eq', 0),
        branch('b', [['x', wired('first.result'), continueOp('outer')]]),
      ),
    );
    const driven = execute(seq(repeat('outer', lit(2), seq(inner))));
    expect(driven.requests.map((request) => request.params)).toEqual([
      { o: 0, i: 0 },
      { o: 1, i: 0 },
    ]);
  });

  it('restarts an inner loop that is the only operation of the outer body', () => {
    const inner = repeat(
      'inner',
      lit(2),
      seq(effect('work', { o: wired('outer.index'), i: wired('inner.index') })),
    );
    const driven = execute(seq(loop('outer', { source: { kind: 'count', times: lit(2) } }, inner)));
    expect(driven.requests.map((request) => request.params)).toEqual([
      { o: 0, i: 0 },
      { o: 0, i: 1 },
      { o: 1, i: 0 },
      { o: 1, i: 1 },
    ]);
  });

  it('a quiet guard that fails inside the body ends only that pass', () => {
    const body = seq(
      test('other', 'lp.index', 'ne', 1),
      guard('g', wired('other.result')),
      probe(),
    );
    expect(indexes(execute(seq(repeat('lp', lit(3), body))))).toEqual([0, 2]);
  });

  it('sends return and stop through the loop to the run', () => {
    const early = {
      op: 'return' as const,
      at: at('return'),
      exit: 'early',
      values: {},
    };
    const driven = execute(seq(repeat('lp', lit(3), seq(probe(), early)), effect('after')));
    expect(driven.requests).toHaveLength(1);
    expect(driven.outcome).toMatchObject({ kind: 'done', exit: 'early' });
    const stop = { op: 'stop' as const, at: at('stop'), failed: true, cancelSelf: false };
    const stopped = execute(seq(repeat('lp', lit(3), seq(stop))));
    expect(stopped.outcome.kind).toBe('failed');
  });

  it('raises a break whose loop is not around it as an error of the run', () => {
    const driven = execute(seq(breakOp('lp')));
    expect(failure(driven)).toMatchObject({ class: 'Failed' });
  });
});

describe('limits', () => {
  const spin = (extra = {}): ReturnType<typeof seq> =>
    seq(whileLoop('lp', lit(true), seq(probe(), bump()), extra));

  it('ends quietly at the iteration limit with the default note', () => {
    const driven = execute(spin({ limit: limit({ iterations: 3 }) }));
    expect(driven.requests).toHaveLength(3);
    expect(driven.outcome.kind).toBe('done');
    expect(driven.records).toContainEqual({
      kind: 'note',
      node: 'lp',
      message: 'The loop reached its limit and stopped.',
    });
  });

  it('records the note the author wrote', () => {
    const driven = execute(spin({ limit: limit({ iterations: 1, note: 'enough' }) }));
    expect(driven.records).toContainEqual({ kind: 'note', node: 'lp', message: 'enough' });
  });

  it('fails with a catchable limit error at the iteration limit', () => {
    const driven = execute(spin({ limit: limit({ iterations: 2, onLimit: 'fail' }) }));
    expect(driven.requests).toHaveLength(2);
    expect(failure(driven)).toMatchObject({
      class: 'LimitExceeded',
      message: 'lp reached its limit of 2 iterations',
      detail: { limit: 'iterations' },
    });
  });

  it('does not report the limit when the loop ends on its own at exactly that count', () => {
    const op = repeat('lp', lit(3), seq(probe()), {
      limit: limit({ iterations: 3, onLimit: 'fail' }),
    });
    const driven = execute(seq(op));
    expect(driven.outcome.kind).toBe('done');
    expect(driven.records).toEqual([]);
  });

  it('lets a while condition end the loop before the iteration limit is reported', () => {
    const op = whileLoop('lp', wired('below.result'), seq(probe(), bump()), {
      limit: limit({ iterations: 2, onLimit: 'fail' }),
    });
    expect(execute(seq(test('below', 'vars.i', 'lt', 2), op)).outcome.kind).toBe('done');
  });

  it('reports the iteration limit of a do until before it waits', () => {
    const op = doUntil('lp', lit(false), seq(probe()), {
      gap: gap(1000),
      limit: limit({ iterations: 2 }),
    });
    const driven = execute(seq(op));
    expect(driven.parks).toHaveLength(1);
    expect(driven.now).toBe(1000);
  });

  it('cancels the body mid-flight at the deadline and ends with the note', () => {
    const op = whileLoop('lp', lit(true), seq(probe(), effect('never')), {
      limit: limit({ time: 1500, note: 'timed out' }),
    });
    const driven = execute(seq(op, effect('after')), 400);
    expect(driven.requests.map((request) => request.key)).toEqual([
      'work',
      'never',
      'work',
      'never',
      'after',
    ]);
    expect(driven.requests.at(-1)?.at).toBe(1500);
    expect(driven.records).toContainEqual({ kind: 'note', node: 'lp', message: 'timed out' });
    expect(driven.state.cancel).toBeUndefined();
  });

  it('raises the limit error when the deadline passes with onLimit fail', () => {
    const op = whileLoop('lp', lit(true), seq(probe()), {
      limit: limit({ time: 1000, onLimit: 'fail' }),
    });
    const driven = execute(seq(op), 600);
    expect(driven.now).toBe(1000);
    expect(failure(driven)).toMatchObject({
      class: 'LimitExceeded',
      message: 'lp reached its time limit of 1000 ms',
      detail: { limit: 'time' },
    });
  });

  it('clips the gap to the time that is left and ends at the deadline', () => {
    const op = whileLoop('lp', lit(true), seq(probe()), {
      gap: gap(1000),
      limit: limit({ time: 1300 }),
    });
    const driven = execute(seq(op), 500);
    expect(driven.parks).toMatchObject([{ kind: 'duration', dueAt: NOW + 1300 }]);
    expect(driven.requests.map((request) => request.at)).toEqual([0]);
    expect(driven.now).toBe(1300);
  });

  it('does not clip the gap when the loop has no time limit', () => {
    const op = repeat('lp', lit(2), seq(probe()), {
      gap: { ms: 5000, skipAfterLast: true, clipToDeadline: false },
    });
    expect(execute(seq(op)).now).toBe(5000);
  });

  it('leaves a deadline that has not passed alone when the loop finishes first', () => {
    const op = repeat('lp', lit(2), seq(probe()), {
      limit: limit({ time: 5000, onLimit: 'fail' }),
    });
    const driven = execute(seq(op), 100);
    expect(driven.outcome.kind).toBe('done');
    expect(driven.records).toEqual([]);
  });

  it('lets the outer loop handle a deadline that only it has passed', () => {
    const inner = whileLoop('inner', lit(true), seq(effect('work')), {
      limit: limit({ time: 10_000 }),
    });
    const outer = whileLoop('outer', lit(true), seq(inner), {
      limit: limit({ time: 700, note: 'outer' }),
    });
    const driven = execute(seq(outer, effect('after')), 300);
    expect(driven.requests.at(-1)).toMatchObject({ key: 'after', at: 700 });
    expect(driven.records).toEqual([{ kind: 'note', node: 'outer', message: 'outer' }]);
  });

  it('lets the inner loop end first when both deadlines have passed', () => {
    const inner = whileLoop('inner', lit(true), seq(effect('work')), {
      limit: limit({ time: 700, note: 'inner' }),
    });
    const outer = whileLoop('outer', lit(true), seq(inner), {
      limit: limit({ time: 700, note: 'outer' }),
    });
    const driven = execute(seq(outer), 300);
    expect(driven.records.map((record) => record.kind === 'note' && record.message)).toEqual([
      'inner',
      'outer',
    ]);
  });

  it('passes a cancellation that is not a loop limit on to the run', () => {
    const op = whileLoop('lp', lit(true), seq(probe()), {
      gap: gap(1000),
      limit: limit({ time: 5000 }),
    });
    const driven = drive(loopContext(planOf(seq(op))), stateOf(), { cancelOnPark: true });
    expect(driven.outcome).toMatchObject({ status: 'cancelled', reason: 'user_stop' });
  });

  it('passes a loop limit cancellation that no loop has earned on to the run', () => {
    const op = repeat('lp', lit(5), seq(effect('work')));
    const state = stateOf();
    const ctx = loopContext(planOf(seq(op)));
    const first = drive(ctx, { ...state, cancel: { reason: 'loop_limit', requestedAt: 0 } });
    expect(first.outcome).toMatchObject({ status: 'cancelled', reason: 'loop_limit' });
  });
});

describe('budgets', () => {
  it('a pure while true breaches the steps since the last suspension', () => {
    const plan = planOf(seq(whileLoop('lp', lit(true), seq())));
    const ctx = loopContext(plan, { limits: resolveBudgets({ stepsInARow: 50 }) });
    const driven = drive(ctx, stateOf());
    expect(failure(driven)).toMatchObject({
      class: 'BudgetExceeded',
      detail: { budget: 'steps_in_a_row', limit: 50 },
    });
  });

  it('has no default step limit: a pure while true keeps going and stays stoppable', () => {
    const plan = planOf(seq(whileLoop('lp', lit(true), seq(bump())), effect('after')), {
      variables: counter(),
    });
    const ctx = loopContext(plan);
    let state = step(ctx, stateOf(), { kind: 'start', now: NOW }).state;
    const outcomes = new Set<string>();
    for (let taken = 0; taken < 30_000; taken += 1) {
      const stepped = step(ctx, state, { kind: 'run', now: NOW });
      outcomes.add(stepped.outcome.kind);
      state = stepped.state;
    }
    expect([...outcomes]).toEqual(['continue']);
    const stopped = drive(ctx, { ...state, cancel: { reason: 'user_stop', requestedAt: NOW } });
    expect(stopped.outcome).toMatchObject({ kind: 'done', status: 'cancelled' });
    expect(stopped.requests).toEqual([]);
  });

  it('resets the step count when the body suspends so a long polling loop is allowed', () => {
    const plan = planOf(seq(repeat('lp', lit(30), seq(effect('work')))));
    const ctx = loopContext(plan, { limits: resolveBudgets({ stepsInARow: 10 }) });
    const driven = drive(ctx, stateOf());
    expect(driven.outcome.kind).toBe('done');
    expect(driven.requests).toHaveLength(30);
  });

  it('keeps the run state valid and serialisable at every step', () => {
    const op = forEach('fe', lit([1, 2]), seq(effect('work')), { collect: wired('fe.item') });
    expect(execute(seq(op)).outcome.kind).toBe('done');
  });
});

describe('broken run states', () => {
  const stuck = (
    parent: ReturnType<typeof seq>,
    loopFrame: object,
  ): { ctx: StepContext; state: RunState } => {
    const plan = planOf(parent);
    const state = stateOf();
    const [root] = state.frames;
    if (root === undefined) throw new Error('no root');
    const frame = {
      id: 'f9',
      kind: 'loop' as const,
      path: 'body',
      pc: 5,
      locals: {},
      outputs: {},
      ...loopFrame,
    };
    return { ctx: loopContext(plan), state: { ...state, frames: [root, frame] } };
  };

  it('refuse a loop frame that has no loop operation below it', () => {
    const { ctx, state } = stuck(seq(effect('work')), {});
    expect(() => drive(ctx, state, { limit: 3 })).toThrow('a loop operation below it');
    const empty = stuck(seq(), {});
    expect(() => drive(empty.ctx, empty.state, { limit: 3 })).toThrow('none');
  });

  it('refuse a loop frame whose counted state or source locals are missing', () => {
    const base = { path: 'body/ops/0', pc: 0, locals: { phase: 'admit' } };
    const state = { index: 0, count: null, startedAt: NOW };
    const cases: [ReturnType<typeof seq>, object, string][] = [
      [seq(repeat('lp', lit(2), seq())), { ...base, loop: state }, 'no count'],
      [seq(forEach('fe', lit([1]), seq())), { ...base, loop: { ...state, count: 1 } }, 'none'],
      [
        seq(range('rg', { from: lit(0), to: lit(1), step: lit(1) }, seq())),
        { ...base, loop: { ...state, count: 2 } },
        'no bounds',
      ],
    ];
    for (const [parent, frame, message] of cases) {
      const { ctx, state: broken } = stuck(parent, frame);
      expect(() => drive(ctx, broken, { limit: 3 })).toThrow(message);
    }
  });

  it('refuse a collecting loop whose results are missing', () => {
    const op = forEach('fe', lit([1]), seq(), { collect: lit(1) });
    const { ctx, state } = stuck(seq(op), {
      path: 'body/ops/0',
      pc: 0,
      locals: { phase: 'admit', results: 'broken' },
      loop: { index: 0, count: 1, items: [1], startedAt: NOW },
    });
    expect(() => drive(ctx, state, { limit: 6 })).toThrow('the collected results');
  });

  it('refuse a loop frame that has no loop state', () => {
    const { ctx, state } = stuck(seq(repeat('lp', lit(2), seq())), {
      path: 'body/ops/0',
      pc: 0,
      locals: { phase: 'admit' },
    });
    expect(() => drive(ctx, state, { limit: 3 })).toThrow('loop state');
  });
});
