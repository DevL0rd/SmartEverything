import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import type { WaitSpec } from '../../src/compile/plan-parts';
import { waitOps } from '../../src/interpret/waits';
import type { ZonePort } from '../../src/interpret/waits';
import {
  NOW,
  at,
  counter,
  drive,
  effect,
  limit,
  lit,
  loopContext,
  planOf,
  repeat,
  seq,
  stateOf,
  whileLoop,
} from './loops-support';
import { branch } from './core-support';

const MINUTE = 60_000;

const ZONE: ZonePort = {
  nextOccurrence: () => ({ ok: false, class: 'Invalid', message: 'no clock' }),
};

const pause = (ms: number): PlanOp => {
  const wait: WaitSpec = { kind: 'duration', duration: lit(ms), ifLate: 'run' };
  return { op: 'wait', at: at('pause'), durable: true, wait };
};

const selfStop: PlanOp = { op: 'stop', at: at('halt'), failed: false, cancelSelf: true };

function execute(body: PlanOp): ReturnType<typeof drive> {
  const base = loopContext(planOf(body, { variables: counter() }));
  return drive({ ...base, ops: { ...base.ops, ...waitOps(ZONE) } }, stateOf());
}

describe('the time limit of a loop during a pass', () => {
  it('wakes a wait in the pass at the deadline, ends the loop and runs what follows', () => {
    const loop = whileLoop('lp', lit(true), seq(effect('work'), pause(10 * MINUTE)), {
      limit: limit({ time: MINUTE, note: 'time is up' }),
    });
    const driven = execute(seq(loop, effect('after')));
    expect(driven.parks).toMatchObject([{ kind: 'duration', dueAt: NOW + MINUTE }]);
    expect(driven.requests.map(({ key, at: when }) => [key, when])).toEqual([
      ['work', 0],
      ['after', MINUTE],
    ]);
    expect(driven.records).toContainEqual({ kind: 'note', node: 'lp', message: 'time is up' });
    expect(driven.nodes.filter(({ node }) => node === 'pause').map(({ status }) => status)).toEqual(
      ['waiting', 'cancelled'],
    );
    expect(driven.state.cancel).toBeUndefined();
    expect(driven.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('leaves the due time of a wait that ends before the deadline alone', () => {
    const loop = repeat('lp', lit(1), seq(pause(MINUTE)), { limit: limit({ time: 10 * MINUTE }) });
    const driven = execute(seq(loop, effect('after')));
    expect(driven.parks).toMatchObject([{ kind: 'duration', dueAt: NOW + MINUTE }]);
  });
});

describe('a run that stops itself', () => {
  it('records the stop and then each loop and branch around it as cancelled', () => {
    const inner = branch('gate', [['yes', lit(true), seq(selfStop)]]);
    const driven = execute(seq(repeat('lp', lit(2), seq(inner))));
    expect(driven.outcome).toMatchObject({
      kind: 'done',
      status: 'cancelled',
      reason: 'user_stop',
    });
    expect(driven.nodes.map(({ node, status }) => [node, status])).toEqual([
      ['halt', 'succeeded'],
      ['gate', 'cancelled'],
      ['lp', 'cancelled'],
    ]);
  });
});
