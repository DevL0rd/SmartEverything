import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT_NOTE,
  deadlineFor,
  gapFor,
  gapWait,
  iterationsHit,
  limitError,
  timeHit,
  withoutLimitCancel,
} from '../../src/interpret/loops-limits';
import type { LoopState } from '../../src/state/run-state';
import { stateOf } from './core-support';

const loop = (extra: Partial<LoopState> = {}): LoopState => ({
  index: 0,
  count: null,
  startedAt: 1000,
  ...extra,
});

describe('deadlines', () => {
  it('start at the loop start plus the time limit and are absent without one', () => {
    expect(deadlineFor({ onLimit: 'end', time: 500 }, 1000)).toBe(1500);
    expect(deadlineFor({ onLimit: 'end' }, 1000)).toBeUndefined();
    expect(deadlineFor(undefined, 1000)).toBeUndefined();
  });

  it('are hit from the deadline instant on, not before', () => {
    const limit = { onLimit: 'end' as const, time: 500 };
    expect(timeHit(limit, loop({ deadlineAt: 1500 }), 1499)).toBeNull();
    expect(timeHit(limit, loop({ deadlineAt: 1500 }), 1500)).toEqual({ kind: 'time', limit });
    expect(timeHit(limit, loop(), 9999)).toBeNull();
    expect(timeHit(undefined, loop({ deadlineAt: 1 }), 9999)).toBeNull();
  });
});

describe('iteration limits', () => {
  it('are hit when that many passes have completed', () => {
    const limit = { onLimit: 'fail' as const, iterations: 2 };
    expect(iterationsHit(limit, loop({ index: 1 }))).toBeNull();
    expect(iterationsHit(limit, loop({ index: 2 }))).toEqual({ kind: 'iterations', limit });
    expect(iterationsHit({ onLimit: 'end' }, loop({ index: 50 }))).toBeNull();
    expect(iterationsHit(undefined, loop({ index: 50 }))).toBeNull();
  });
});

describe('gaps', () => {
  const gap = { ms: 1000, skipAfterLast: true, clipToDeadline: true };

  it('are clipped to the time left before the deadline', () => {
    expect(gapFor(gap, loop({ deadlineAt: 1600 }), 1000)).toBe(600);
    expect(gapFor(gap, loop({ deadlineAt: 5000 }), 1000)).toBe(1000);
    expect(gapFor(gap, loop({ deadlineAt: 900 }), 1000)).toBe(0);
  });

  it('are whole when the plan does not clip them or no deadline exists', () => {
    expect(gapFor({ ...gap, clipToDeadline: false }, loop({ deadlineAt: 1100 }), 1000)).toBe(1000);
    expect(gapFor(gap, loop(), 1000)).toBe(1000);
  });

  it('park as durable waits except inside a temporary change', () => {
    const plain = stateOf();
    expect(gapWait(plain, 'body/ops/0', 7)).toEqual({
      kind: 'duration',
      nodePath: 'body/ops/0',
      durable: true,
      dueAt: 7,
    });
    const [root] = plain.frames;
    if (root === undefined) throw new Error('no root frame');
    const region = {
      ...stateOf(),
      frames: [...plain.frames, { ...root, id: 'f9', kind: 'with_effect' as const }],
    };
    expect(gapWait(region, 'body/ops/0', 7)).toMatchObject({ durable: false });
  });
});

describe('limit errors', () => {
  const site = { node: 'n1', path: 'body/ops/0', at: Date.UTC(2026, 9, 18) };

  it('name the node and the limit that was hit', () => {
    const time = limitError({ kind: 'time', limit: { onLimit: 'fail', time: 900 } }, 'lp', site);
    expect(time).toMatchObject({
      class: 'LimitExceeded',
      message: 'lp reached its time limit of 900 ms',
      detail: { limit: 'time', nodePath: 'body/ops/0' },
    });
    const count = limitError(
      { kind: 'iterations', limit: { onLimit: 'fail', iterations: 4 } },
      'lp',
      site,
    );
    expect(count.message).toBe('lp reached its limit of 4 iterations');
  });

  it('come with a default note for loops that end quietly', () => {
    expect(DEFAULT_LIMIT_NOTE).toBe('The loop reached its limit and stopped.');
  });
});

describe('loop limit cancellation', () => {
  it('is removed when the loop takes it and any other cancellation is kept', () => {
    const base = stateOf();
    const limited = { ...base, cancel: { reason: 'loop_limit' as const, requestedAt: 1 } };
    expect(withoutLimitCancel(limited).cancel).toBeUndefined();
    const stopped = { ...base, cancel: { reason: 'user_stop' as const, requestedAt: 1 } };
    expect(withoutLimitCancel(stopped)).toBe(stopped);
    expect(withoutLimitCancel(base)).toBe(base);
  });
});
