import { describe, expect, it } from 'vitest';
import { automation, node, ok, refused, roundTrip, trigger, withTriggers } from './support';

const base = (): ReturnType<typeof automation> =>
  automation([
    node('a', 'notify.feed', { x: { lit: 1 }, y: { lit: 2 } }),
    node('b', 'notify.feed'),
  ]);

describe('set', () => {
  it('merges ports and undoes changed, added and untouched ports', () => {
    const program = base();
    const result = ok(program, [{ op: 'set', key: 'a', ports: { x: { lit: 9 }, z: { lit: 3 } } }]);
    expect(result.program.body.nodes[0]?.ports).toEqual({
      x: { lit: 9 },
      y: { lit: 2 },
      z: { lit: 3 },
    });
    expect(result.inverse).toEqual([
      { op: 'unset', key: 'a', ports: ['z'], keepEmpty: true },
      { op: 'set', key: 'a', ports: { x: { lit: 1 } } },
    ]);
    roundTrip(program, [{ op: 'set', key: 'a', ports: { x: { lit: 9 }, z: { lit: 3 } } }]);
  });

  it('creates ports on a node without any and removes them again', () => {
    const program = base();
    const result = ok(program, [{ op: 'set', key: 'b', ports: { q: { lit: 1 } } }]);
    expect(result.inverse).toEqual([{ op: 'unset', key: 'b', ports: ['q'] }]);
    roundTrip(program, [{ op: 'set', key: 'b', ports: { q: { lit: 1 } } }]);
  });

  it('keeps a node without ports when the merge is empty', () => {
    const result = ok(base(), [{ op: 'set', key: 'b', ports: {} }]);
    expect(result.program.body.nodes[1]).not.toHaveProperty('ports');
    expect(result.inverse).toEqual([]);
  });

  it('sets and clears label, note, enabled, policy and outputs', () => {
    const program = automation([
      {
        ...node('a', 'flow.if'),
        branches: [
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            when: { lit: true },
            scope: { nodes: [] },
          },
        ],
        label: 'Old',
      },
    ]);
    const set = ok(program, [
      {
        op: 'set',
        key: 'a',
        label: 'New',
        note: 'Why',
        enabled: false,
        policy: { onError: 'continue' },
        outputs: [{ name: 'out', values: { branch: { lit: 1 } } }],
      },
    ]);
    const changed = set.program.body.nodes[0];
    expect(changed).toMatchObject({
      label: 'New',
      note: 'Why',
      enabled: false,
      policy: { onError: 'continue' },
    });
    expect(set.inverse).toEqual([
      { op: 'set', key: 'a', label: 'Old', note: null, enabled: null, policy: null, outputs: null },
    ]);
    expect(ok(set.program, set.inverse).program).toEqual(program);
    const cleared = ok(set.program, [
      { op: 'set', key: 'a', label: null, note: null, enabled: null, policy: null, outputs: null },
    ]);
    expect(cleared.program.body.nodes[0]).not.toHaveProperty('note');
    expect(cleared.program.body.nodes[0]).not.toHaveProperty('policy');
    expect(ok(cleared.program, cleared.inverse).program).toEqual(set.program);
  });

  it('sets a trigger label and ports', () => {
    const program = withTriggers(base(), trigger('press', { k: { lit: 1 } }));
    const result = roundTrip(program, [
      { op: 'set', key: 'press', label: 'Press', ports: { k: { lit: 2 }, j: { lit: 1 } } },
    ]);
    if (result.kind !== 'automation') throw new Error('automation');
    expect(result.triggers[0]).toMatchObject({ label: 'Press', ports: { k: { lit: 2 } } });
  });

  it('refuses what a trigger or a node does not have', () => {
    const program = withTriggers(base(), trigger('press'));
    expect(refused(program, [{ op: 'set', key: 'press', policy: { onError: 'fail' } }]).code).toBe(
      'not_allowed',
    );
    expect(refused(program, [{ op: 'set', key: 'press', outputs: null }]).code).toBe('not_allowed');
    expect(refused(program, [{ op: 'set', key: 'ghost', label: 'x' }]).code).toBe('unknown_key');
  });
});

describe('unset', () => {
  it('removes ports and undoes it', () => {
    const program = base();
    const result = ok(program, [{ op: 'unset', key: 'a', ports: ['x', 'x'] }]);
    expect(result.program.body.nodes[0]?.ports).toEqual({ y: { lit: 2 } });
    roundTrip(program, [{ op: 'unset', key: 'a', ports: ['x'] }]);
  });

  it('drops an emptied ports record unless asked to keep it', () => {
    const program = base();
    const dropped = ok(program, [{ op: 'unset', key: 'a', ports: ['x', 'y'] }]);
    expect(dropped.program.body.nodes[0]).not.toHaveProperty('ports');
    const kept = ok(program, [{ op: 'unset', key: 'a', ports: ['x', 'y'], keepEmpty: true }]);
    expect(kept.program.body.nodes[0]?.ports).toEqual({});
    roundTrip(program, [{ op: 'unset', key: 'a', ports: ['x', 'y'] }]);
  });

  it('keeps the ports of a trigger', () => {
    const program = withTriggers(base(), trigger('press', { k: { lit: 1 } }));
    const result = ok(program, [{ op: 'unset', key: 'press', ports: ['k'] }]);
    if (result.program.kind !== 'automation') throw new Error('automation');
    expect(result.program.triggers[0]?.ports).toEqual({});
    roundTrip(program, [{ op: 'unset', key: 'press', ports: ['k'] }]);
  });

  it('refuses a port that is not there', () => {
    expect(refused(base(), [{ op: 'unset', key: 'a', ports: ['nope'] }]).code).toBe('unknown_port');
    expect(refused(base(), [{ op: 'unset', key: 'b', ports: ['nope'] }]).code).toBe('unknown_port');
  });
});
