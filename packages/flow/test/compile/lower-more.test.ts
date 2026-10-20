import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  drive,
  effect,
  loop,
  loopContext,
  planOf as planFor,
  seq,
  stateOf,
} from '../interpret/loops-support';
import { codesOf, lit, make, opOf, opsOf, scope } from './support';

const STOP = make('halt', 'flow.stop');

function forever(ports: Record<string, ReturnType<typeof lit>>, ...body: FlowNode[]): FlowNode {
  return make('fv', 'flow.forever', ports, { scopes: { body: scope(...body) } });
}

describe('flow.forever', () => {
  it('lowers to an open loop with no test, checked after nothing and gapped between passes', () => {
    const op = opOf(
      forever({ gap: lit(500), limit: lit({ iterations: 3, onLimit: 'end' }) }, STOP),
    );
    expect(op).toMatchObject({
      op: 'loop',
      source: { kind: 'open' },
      test: undefined,
      entryTest: false,
      order: 'gap_then_test',
      gap: { ms: 500, skipAfterLast: false, clipToDeadline: false },
      limit: { iterations: 3, onLimit: 'end' },
      body: { op: 'seq', ops: [{ op: 'stop' }] },
    });
  });

  it('lets a break inside it name it', () => {
    const op = opOf(forever({}, make('out', 'flow.break')));
    expect(op).toMatchObject({ body: { ops: [{ op: 'break', target: 'fv' }] } });
  });

  it('runs until its iteration limit ends it quietly', () => {
    const plan = planFor(
      seq(
        loop(
          'fv',
          { source: { kind: 'open' }, limit: { iterations: 3, onLimit: 'end' } },
          seq(effect('work')),
        ),
      ),
    );
    const driven = drive(loopContext(plan), stateOf());
    expect(driven.outcome.kind).toBe('done');
    expect(driven.requests).toHaveLength(3);
  });
});

describe('flow.sequence', () => {
  it('compiles away into its body', () => {
    const grouped = make('grp', 'flow.sequence', {}, { scopes: { body: scope(STOP, STOP) } });
    expect(opsOf([grouped])).toEqual([{ op: 'seq', ops: [expect.anything(), expect.anything()] }]);
    expect(JSON.stringify(opsOf([grouped]))).not.toContain('flow.sequence');
  });

  it('keeps the loop around it for a break inside', () => {
    const grouped = make(
      'grp',
      'flow.sequence',
      {},
      { scopes: { body: scope(make('out', 'flow.break')) } },
    );
    const op = opOf(forever({}, grouped));
    expect(op).toMatchObject({
      body: { ops: [{ op: 'seq', ops: [{ op: 'break', target: 'fv' }] }] },
    });
  });

  it('still refuses a break outside any loop', () => {
    const grouped = make(
      'grp',
      'flow.sequence',
      {},
      { scopes: { body: scope(make('out', 'flow.break')) } },
    );
    expect(codesOf([grouped])).toEqual(['break_outside_loop']);
  });
});
