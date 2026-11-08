import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import { automation, gnode, note, start } from '../../model/graph/graph-scene-fixtures';
import { fixOps } from './fix-actions';

function chain(...keys: string[]): ReturnType<typeof automation> {
  return automation([start(keys[0]), ...keys.map((key, at) => note(key, keys[at + 1]))], {
    triggers: [],
  });
}

describe('one tap fixes as ops', () => {
  it('sets a port', () => {
    const ops = fixOps(
      chain('lamp'),
      {
        action: 'set_port',
        key: 'lamp',
        port: 'ignoreOwnChanges',
        value: { lit: true },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(ops).toEqual([{ op: 'set', key: 'lamp', ports: { ignoreOwnChanges: { lit: true } } }]);
  });

  it('replaces a polling step by Wait until true in the same place', () => {
    const program = chain('first', 'poll', 'last');
    const ops = fixOps(
      program,
      { action: 'wait_until', key: 'poll', condition: { lit: true } },
      STATIC_KIND_LOOKUP,
    );
    const result = applyPatch(program, ops ?? [], {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const waiting = result.program.nodes.find((node) => node.kind === 'flow.wait_condition');
    expect(result.program.nodes.some((node) => node.key === 'poll')).toBe(false);
    expect(waiting?.ports).toEqual({ condition: { lit: true } });
    const first = result.program.nodes.find((node) => node.key === 'first');
    expect(first?.to).toEqual({ next: waiting?.key });
    expect(waiting?.to).toEqual({ next: 'last' });
  });

  it('replaces an If chain by Change variable set to Next, keeping the variable source', () => {
    const program = {
      ...automation(
        [
          start('chain'),
          gnode('chain', 'flow.if', {
            branches: [
              { id: '00000000-0000-4000-8000-0000000000aa', when: { lit: true }, to: 'set' },
            ],
            to: { else: 'after', next: 'after' },
          }),
          note('set', 'after', { ports: { source: { lit: 'x' } } }),
          note('after'),
        ],
        { triggers: [] },
      ),
      variables: [{ name: 'mode', type: { t: 'number' as const }, initial: { lit: 0 } }],
    };
    const ops = fixOps(
      program,
      { action: 'cycle_variable', key: 'chain', variable: 'mode' },
      STATIC_KIND_LOOKUP,
    );
    const result = applyPatch(program, ops ?? [], {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const change = result.program.nodes.find((node) => node.kind === 'var.change');
    expect(change).toMatchObject({
      ports: { name: { lit: 'mode' }, op: { lit: 'next' }, source: { lit: 'x' } },
      to: { next: 'after' },
    });
    expect(result.program.nodes.map((node) => node.key).sort()).toEqual(
      ['after', change?.key, 'start'].sort(),
    );
  });

  it('offers no one tap fix where no mechanical change exists', () => {
    const program = chain('chain');
    expect(
      fixOps(
        program,
        { action: 'lookup_table', key: 'chain', variable: 'mode' },
        STATIC_KIND_LOOKUP,
      ),
    ).toBeNull();
    expect(
      fixOps(
        program,
        { action: 'wait_until', key: 'gone', condition: { lit: true } },
        STATIC_KIND_LOOKUP,
      ),
    ).toBeNull();
  });
});
