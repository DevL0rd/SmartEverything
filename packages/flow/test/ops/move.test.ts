import { describe, expect, it } from 'vitest';
import {
  automation,
  bodyKeys,
  branching,
  loop,
  node,
  refused,
  roundTrip,
  trigger,
  withTriggers,
} from './support';

const base = (): ReturnType<typeof automation> =>
  automation([node('a', 'notify.feed'), node('b', 'notify.feed'), node('c', 'notify.feed')]);

describe('move', () => {
  it('reorders inside a scope and undoes it', () => {
    const place = (extra: Record<string, unknown>): string[] =>
      bodyKeys(roundTrip(base(), [{ op: 'move', key: 'a', in: 'body', ...extra }]));
    expect(place({ after: 'c' })).toEqual(['b', 'c', 'a']);
    expect(place({ before: 'c' })).toEqual(['b', 'a', 'c']);
    expect(place({ index: 1 })).toEqual(['b', 'a', 'c']);
    expect(place({})).toEqual(['b', 'c', 'a']);
  });

  it('moves between scopes and into a container, and undoes it', () => {
    const program = automation([node('a', 'notify.feed'), loop('rep', [node('x', 'notify.feed')])]);
    const into = roundTrip(program, [{ op: 'move', key: 'a', in: 'rep.body', index: 0 }]);
    expect(into.body.nodes.map((n) => n.key)).toEqual(['rep']);
    const out = roundTrip(into, [{ op: 'move', key: 'x', in: 'body', before: 'rep' }]);
    expect(out.body.nodes.map((n) => n.key)).toEqual(['x', 'rep']);
    const fail = automation([node('a', 'notify.feed')], { nodes: [node('f', 'notify.feed')] });
    expect(roundTrip(fail, [{ op: 'move', key: 'a', in: 'onFailure' }]).body.nodes).toEqual([]);
  });

  it('moves a container with its contents into a branch of a sibling', () => {
    const cond = branching('cond', { lit: true }, []);
    const branchId = cond.branches?.[0]?.id ?? '';
    const program = automation([loop('rep', [node('x', 'notify.feed')]), cond]);
    const result = roundTrip(program, [{ op: 'move', key: 'rep', in: `cond.branch:${branchId}` }]);
    expect(result.body.nodes.map((n) => n.key)).toEqual(['cond']);
  });

  it('moves triggers within the triggers', () => {
    const program = withTriggers(base(), trigger('one'), trigger('two'));
    const result = roundTrip(program, [{ op: 'move', key: 'one', in: 'triggers', after: 'two' }]);
    if (result.kind !== 'automation') throw new Error('automation');
    expect(result.triggers.map((t) => t.key)).toEqual(['two', 'one']);
  });

  it('refuses impossible moves', () => {
    const program = withTriggers(
      automation([
        loop('rep', [loop('inner', [node('x', 'notify.feed')])]),
        node('a', 'notify.feed'),
      ]),
      trigger('one'),
    );
    expect(refused(program, [{ op: 'move', key: 'ghost', in: 'body' }]).code).toBe('unknown_key');
    expect(refused(program, [{ op: 'move', key: 'one', in: 'body' }]).code).toBe('not_allowed');
    expect(refused(program, [{ op: 'move', key: 'a', in: 'triggers' }]).code).toBe('not_allowed');
    expect(refused(program, [{ op: 'move', key: 'rep', in: 'rep.body' }]).code).toBe('not_allowed');
    expect(refused(program, [{ op: 'move', key: 'rep', in: 'inner.body' }]).code).toBe(
      'not_allowed',
    );
    expect(refused(program, [{ op: 'move', key: 'a', in: 'body', after: 'a' }]).code).toBe(
      'bad_placement',
    );
    expect(refused(program, [{ op: 'move', key: 'a', in: 'ghost.body' }]).code).toBe('bad_target');
  });
});
