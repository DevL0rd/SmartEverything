import { describe, expect, it } from 'vitest';
import {
  CLEANUP_GRACE_MS,
  abandonCleanup,
  cancelCompletion,
  cleanupGraceEnd,
  isCleaning,
  requestCancel,
} from '../../src/interpret/cancel';
import { CANCEL_REASONS } from '../../src/state/run-state';
import type { CancelReason } from '../../src/state/run-state';
import { NOW, effect, planOf, run, seq, stateOf } from './core-support';
import type { Trace } from './core-support';
import { context, failing, keys, row, tryOp } from './errors-support';
import type { PlanOp } from '../../src/compile/plan';

function cancelledAt(body: PlanOp, reason: CancelReason = 'user_stop'): Trace {
  const ctx = context(planOf(body));
  const parked = run(ctx, stateOf());
  const state = requestCancel(parked.state, reason, NOW);
  const rest = run(ctx, state, { start: false, resolve: failing('ok') });
  return { ...rest, requests: [...parked.requests, ...rest.requests] };
}

const cleanup = (key: string): { finally: PlanOp } => ({ finally: seq(effect(key)) });

describe('requestCancel', () => {
  it('keeps the first reason and leaves later requests out', () => {
    const first = requestCancel(stateOf(), 'user_stop', NOW);
    const second = requestCancel(first, 'shutdown', NOW + 5);
    expect(second.cancel).toEqual({ reason: 'user_stop', requestedAt: NOW });
  });

  it('accepts every reason of the closed union including loop_limit', () => {
    expect(CANCEL_REASONS).toContain('loop_limit');
    for (const reason of CANCEL_REASONS) {
      expect(requestCancel(stateOf(), reason, NOW).cancel?.reason).toBe(reason);
      expect(cancelCompletion(reason)).toEqual({ kind: 'cancelled', reason });
    }
  });
});

describe('cancel unwinding', () => {
  it('ends a plain run as cancelled with the reason', () => {
    const trace = cancelledAt(seq(effect('work'), effect('more')), 'loop_limit');
    expect(keys(trace)).toEqual(['work']);
    expect(trace.outcome).toMatchObject({
      kind: 'done',
      status: 'cancelled',
      reason: 'loop_limit',
    });
  });

  it('runs the finally of the interrupted try and then ends cancelled', () => {
    const trace = cancelledAt(
      seq(tryOp('x', seq(effect('work'), effect('more')), [], cleanup('cleanup'))),
    );
    expect(keys(trace)).toEqual(['work', 'cleanup']);
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'cancelled', reason: 'user_stop' });
    expect(trace.state.cancel).toBeUndefined();
  });

  it('unwinds nested tries innermost first', () => {
    const inner = tryOp('v', seq(effect('work')), [], cleanup('innerCleanup'));
    const outer = tryOp('x', seq(inner, effect('later')), [], cleanup('outerCleanup'));
    const trace = cancelledAt(seq(outer, effect('after')), 'removed');
    expect(keys(trace)).toEqual(['work', 'innerCleanup', 'outerCleanup']);
    expect(trace.outcome).toMatchObject({ status: 'cancelled', reason: 'removed' });
  });

  it('does not let a catch row handle a cancellation', () => {
    const body = tryOp(
      'x',
      seq(effect('work')),
      [row('c', seq(effect('caught')))],
      cleanup('cleanup'),
    );
    expect(keys(cancelledAt(seq(body)))).toEqual(['work', 'cleanup']);
  });

  it('marks the cleanup with a fresh 30 second grace while the finally runs', () => {
    const ctx = context(planOf(seq(tryOp('x', seq(effect('work')), [], cleanup('cleanup')))));
    const parked = run(ctx, stateOf());
    const cancelled = requestCancel(parked.state, 'shutdown', NOW);
    const inFinally = run(ctx, cancelled, { start: false });
    expect(inFinally.requests.map((request) => request.node.key)).toEqual(['cleanup']);
    expect(isCleaning(inFinally.state)).toBe(true);
    expect(cleanupGraceEnd(inFinally.state)).toBe(NOW + CLEANUP_GRACE_MS);
    expect(inFinally.state.cancel).toBeUndefined();
  });

  it('abandons a cleanup that outlives its grace and moves on to the next finally', () => {
    const inner = tryOp('v', seq(effect('work')), [], {
      finally: seq(effect('slow'), effect('slower')),
    });
    const outer = tryOp('x', seq(inner), [], cleanup('outerCleanup'));
    const ctx = context(planOf(seq(outer)));
    const parked = run(ctx, stateOf());
    const cancelled = requestCancel(parked.state, 'user_stop', NOW);
    const slow = run(ctx, cancelled, { start: false });
    expect(slow.requests.map((request) => request.node.key)).toEqual(['slow']);
    const abandoned = abandonCleanup(slow.state, NOW + CLEANUP_GRACE_MS);
    expect(abandoned.cancel).toEqual({ reason: 'user_stop', requestedAt: NOW + CLEANUP_GRACE_MS });
    const rest = run(ctx, abandoned, { start: false, resolve: failing('ok') });
    expect(rest.requests.map((request) => request.node.key)).toEqual(['outerCleanup']);
    expect(rest.outcome).toMatchObject({ status: 'cancelled', reason: 'user_stop' });
  });

  it('has no grace end and nothing to abandon when no cleanup is running', () => {
    const state = stateOf();
    expect(isCleaning(state)).toBe(false);
    expect(cleanupGraceEnd(state)).toBeUndefined();
    expect(abandonCleanup(state, NOW)).toBe(state);
  });
});
