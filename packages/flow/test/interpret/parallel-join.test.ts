import { describe, expect, it } from 'vitest';
import { judgeEach, judgeParallel, statusList } from '../../src/interpret/join';
import type { JoinSpec, Lane } from '../../src/interpret/join';
import { gap } from './loops-support';
import {
  effect,
  execute,
  wired,
  failure,
  forEach,
  keys,
  lit,
  parallel,
  seq,
  delay,
} from './parallel-support';
import { FLOW_ERRORS } from '../../src/state/errors';
import { compute } from './core-support';
import type { Completion } from '../../src/state/run-state';

const lane = (index: number, status: Lane['status'], extra: Partial<Lane> = {}): Lane => ({
  index,
  name: `b${String(index)}`,
  status,
  frames: [],
  cancelRequested: false,
  produced: {},
  seq: index,
  ...extra,
});

const boom = FLOW_ERRORS.Failed('boom', { node: 'p', path: 'p', at: 0 });

const failed: Completion = { kind: 'error', error: boom };

const cancelled: Completion = { kind: 'cancelled', reason: 'parent_cancelled' };

const spec = (join: JoinSpec['join'], errors: JoinSpec['errors']): JoinSpec => ({ join, errors });

describe('join verdicts', () => {
  it('waits while a branch is still running', () => {
    expect(judgeParallel(spec('all', 'failFast'), [lane(0, 'done'), lane(1, 'waiting')])).toBe(
      undefined,
    );
    expect(judgeParallel(spec('settled', 'settle'), [lane(0, 'ready')])).toBe(undefined);
    expect(judgeParallel(spec('first', 'failFast'), [lane(0, 'waiting')])).toBe(undefined);
  });

  it('aborts the region on a completion nobody expected', () => {
    const lanes = [lane(0, 'ended', { completion: { kind: 'return' } }), lane(1, 'waiting')];
    expect(judgeParallel(spec('all', 'settle'), lanes)).toEqual({
      kind: 'completion',
      completion: { kind: 'return' },
    });
  });

  it('treats a cancellation nobody requested as unexpected', () => {
    const lanes = [lane(0, 'ended', { completion: cancelled })];
    expect(judgeParallel(spec('all', 'failFast'), lanes)).toEqual({
      kind: 'completion',
      completion: cancelled,
    });
  });

  it('accepts a cancellation the region asked for', () => {
    const lanes = [
      lane(0, 'done'),
      lane(1, 'ended', { completion: cancelled, cancelRequested: true }),
    ];
    expect(judgeParallel(spec('first', 'failFast'), lanes)).toEqual({
      kind: 'normal',
      winners: [0],
    });
  });

  it('raises nothing when first has no winner and no branch failed', () => {
    const lanes = [lane(0, 'ended', { completion: cancelled, cancelRequested: true })];
    expect(judgeParallel(spec('first', 'settle'), lanes)).toBe(undefined);
  });

  it('lists every branch with its error in source order', () => {
    const lanes = [lane(1, 'ended', { completion: failed }), lane(0, 'done')];
    expect(statusList(lanes)).toEqual([
      { branch: 'b0', ok: true },
      { branch: 'b1', ok: false, error: boom },
    ]);
  });

  it('ends a for each on a break of its own loop but not on a cancellation it asked for', () => {
    const broke = lane(0, 'ended', { completion: { kind: 'break', target: 'fe' } });
    expect(judgeEach('fe', 3, [broke])).toEqual({ kind: 'normal', winners: [] });
    const other = lane(0, 'ended', { completion: { kind: 'break', target: 'outer' } });
    expect(judgeEach('fe', 3, [other])?.kind).toBe('completion');
    const asked = lane(0, 'ended', { completion: cancelled, cancelRequested: true });
    expect(judgeEach('fe', 3, [asked])).toBe(undefined);
    expect(judgeEach('fe', 0, [asked])).toEqual({ kind: 'normal', winners: [] });
    expect(judgeEach('fe', 0, [lane(0, 'waiting')])).toBe(undefined);
  });

  it('treats an unrequested break of another loop as a completion for a plain region', () => {
    const lanes = [lane(0, 'ended', { completion: { kind: 'break', target: 'x' } })];
    expect(judgeParallel(spec('all', 'failFast'), lanes)?.kind).toBe('completion');
  });
});

describe('concurrency inside a run', () => {
  it('keeps a plain loop with a gap working next to concurrent regions', () => {
    const body = seq(
      forEach('fe', lit([1, 2]), seq(delay('d', 10), effect('x')), { gap: gap(500, false) }),
      effect('after'),
    );
    const driven = execute(body);
    expect(keys(driven)).toEqual(['x', 'x', 'after']);
    expect(driven.now).toBe(1020);
  });

  it('reports an error of the list of a concurrent for each', () => {
    const driven = execute(
      seq(
        forEach('fe', wired('bad.value'), effect('never'), { concurrency: 2 }),
        compute('bad', 'test.fail', {}),
      ),
    );
    expect(failure(driven)).toBeDefined();
  });

  it('keeps branch outputs out of a region without declared outputs', () => {
    const driven = execute(
      parallel(
        'p',
        [
          ['a', effect('a')],
          ['b', effect('b')],
        ],
        { join: 'settled' },
      ),
    );
    const status = driven.state.frames[0]?.outputs['p'];
    expect(status).toMatchObject({
      status: [
        { branch: 'a', ok: true },
        { branch: 'b', ok: true },
      ],
    });
  });
});
