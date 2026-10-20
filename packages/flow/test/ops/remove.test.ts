import { describe, expect, it } from 'vitest';
import {
  automation,
  bodyKeys,
  branching,
  loop,
  node,
  ok,
  refused,
  roundTrip,
  trigger,
  withTriggers,
} from './support';

describe('remove', () => {
  it('removes a node and undoes it', () => {
    const program = automation([
      node('a', 'notify.feed'),
      node('b', 'notify.feed', { x: { lit: 1 } }),
    ]);
    const result = roundTrip(program, [{ op: 'remove', key: 'a' }]);
    expect(bodyKeys(result)).toEqual(['b']);
  });

  it('removes a container with everything inside and undoes it', () => {
    const program = automation([
      node('a', 'notify.feed'),
      loop('rep', [node('x', 'notify.feed', { v: { wire: { from: 'a', port: 'value' } } })]),
    ]);
    const result = roundTrip(program, [{ op: 'remove', key: 'rep' }]);
    expect(bodyKeys(result)).toEqual(['a']);
  });

  it('removes a trigger and undoes it', () => {
    const program = withTriggers(automation([]), trigger('one'), trigger('two'));
    const result = roundTrip(program, [{ op: 'remove', key: 'one' }]);
    if (result.kind !== 'automation') throw new Error('automation');
    expect(result.triggers.map((t) => t.key)).toEqual(['two']);
  });

  it('refuses while something reads it, naming the reader', () => {
    const program = automation([
      node('a', 'notify.feed'),
      node('b', 'notify.feed', { x: { wire: { from: 'a', port: 'ok' } } }),
    ]);
    const result = refused(program, [{ op: 'remove', key: 'a' }]);
    expect(result.code).toBe('referenced');
    expect(result.reason).toContain('"a" is read by port "x" of "b"');
    expect(refused(program, [{ op: 'remove', key: 'a', cascade: false }]).code).toBe('referenced');
  });

  it('reads through the children of the removed container', () => {
    const program = automation([
      loop('rep', [node('x', 'notify.feed')]),
      node('b', 'notify.feed', { t: { wire: { from: 'x', port: 'ok' } } }),
    ]);
    expect(refused(program, [{ op: 'remove', key: 'rep' }]).reason).toContain('"x" is read');
  });

  it('cascade detaches wired ports and reports them, then undoes everything', () => {
    const program = withTriggers(
      automation([
        node('a', 'notify.feed'),
        node('b', 'notify.feed', {
          x: { wire: { from: 'a', port: 'ok' } },
          y: { lit: 1 },
          z: { wire: { from: 'a', port: 'text' } },
        }),
        node('c', 'notify.feed', { w: { wire: { from: 'a', port: 'ok' } } }),
      ]),
      trigger('press', { at: { wire: { from: 'a', port: 'ok' } } }),
    );
    const result = ok(program, [{ op: 'remove', key: 'a', cascade: true }]);
    expect(result.detached.map((d) => [d.owner, d.where, d.port, d.reads])).toEqual(
      expect.arrayContaining([
        ['b', 'port', 'x', 'a'],
        ['b', 'port', 'z', 'a'],
        ['c', 'port', 'w', 'a'],
        ['press', 'port', 'at', 'a'],
      ]),
    );
    expect(result.program.body.nodes[0]?.ports).toEqual({ y: { lit: 1 } });
    roundTrip(program, [{ op: 'remove', key: 'a', cascade: true }]);
  });

  it('cascade refuses what cannot be detached', () => {
    const cond = branching('cond', { wire: { from: 'a', port: 'ok' } }, []);
    expect(
      refused(automation([node('a', 'notify.feed'), cond]), [
        { op: 'remove', key: 'a', cascade: true },
      ]).reason,
    ).toContain('a branch condition');
    const withVariable = {
      ...automation([node('a', 'notify.feed')]),
      variables: [
        {
          name: 'v',
          type: { t: 'boolean' as const },
          initial: { wire: { from: 'a', port: 'ok' } },
        },
      ],
    };
    expect(refused(withVariable, [{ op: 'remove', key: 'a', cascade: true }]).reason).toContain(
      'the start value of "v"',
    );
  });

  it('refuses an unknown key', () => {
    expect(refused(automation([]), [{ op: 'remove', key: 'ghost' }]).code).toBe('unknown_key');
  });
});
