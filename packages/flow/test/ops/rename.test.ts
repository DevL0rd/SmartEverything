import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  branching,
  loop,
  node,
  refused,
  roundTrip,
  trigger,
  uuid,
  withTriggers,
} from './support';

describe('rename', () => {
  it('renames the key and every wire from it', () => {
    const program = automation([
      node('cycle', 'math.add'),
      node('use', 'notify.feed', {
        a: { wire: { from: 'cycle', port: 'value' } },
        d: { lit: 'cycle.value' },
        e: { wire: { from: 'cyclesum', port: 'value' } },
      }),
    ]);
    const result = roundTrip(program, [{ op: 'rename', key: 'cycle', to: 'level' }]);
    expect(result.body.nodes[0]?.key).toBe('level');
    expect(result.body.nodes[1]?.ports).toEqual({
      a: { wire: { from: 'level', port: 'value' } },
      d: { lit: 'cycle.value' },
      e: { wire: { from: 'cyclesum', port: 'value' } },
    });
  });

  it('rewrites conditions, outputs, trigger ports, admit and starting values', () => {
    const cond = branching('cond', { wire: { from: 'src', port: 'ok' } }, [
      node('x', 'notify.feed', { p: { wire: { from: 'src', port: 'ok' } } }),
    ]);
    const switcher: FlowNode = {
      ...node('sw', 'flow.switch', { subject: { wire: { from: 'src', port: 'n' } } }),
      cases: [
        {
          id: uuid(),
          match: { when: { wire: { from: 'src', port: 'big' } } },
          scope: { nodes: [] },
        },
        { id: uuid(), match: { eq: 1 }, scope: { nodes: [] } },
      ],
    };
    const withOutput: FlowNode = {
      ...cond,
      key: 'cond2',
      id: uuid(),
      branches: [{ id: uuid(), when: { lit: true }, scope: { nodes: [] } }],
      outputs: [
        { name: 'o', values: { branch: { wire: { from: 'src', port: 'n' } }, other: { lit: 1 } } },
      ],
    };
    const base = automation([node('src', 'math.add'), cond, switcher, withOutput]);
    const program = {
      ...withTriggers(
        base,
        trigger('press', { k: { wire: { from: 'src', port: 'n' } } }),
        trigger('plain'),
      ),
      admit: { wire: { from: 'src', port: 'ok' } },
      variables: [
        {
          name: 'v',
          type: { t: 'number' as const },
          initial: { wire: { from: 'src', port: 'n' } },
        },
        { name: 'w', type: { t: 'number' as const }, initial: { lit: 1 } },
      ],
    };
    const result = roundTrip(program, [{ op: 'rename', key: 'src', to: 'origin' }]);
    const text = JSON.stringify(result);
    expect(text).not.toContain('"from":"src"');
    expect(text.match(/"from":"origin"/g)?.length).toBe(8);
  });

  it('renames a trigger', () => {
    const program = withTriggers(
      automation([node('a', 'notify.feed', { x: { wire: { from: 'press', port: 'value' } } })]),
      trigger('press'),
    );
    const result = roundTrip(program, [{ op: 'rename', key: 'press', to: 'tap' }]);
    if (result.kind !== 'automation') throw new Error('automation');
    expect(result.triggers[0]?.key).toBe('tap');
    expect(result.body.nodes[0]?.ports).toEqual({ x: { wire: { from: 'tap', port: 'value' } } });
  });

  it('renames inside nested scopes', () => {
    const program = automation([
      node('a', 'notify.feed'),
      loop('rep', [node('x', 'notify.feed', { v: { wire: { from: 'a', port: 'ok' } } })]),
    ]);
    const result = roundTrip(program, [{ op: 'rename', key: 'rep', to: 'many' }]);
    expect(result.body.nodes[1]?.key).toBe('many');
  });

  it('refuses a bad new name, an unknown key and a name a wire already reads', () => {
    const program = automation([
      node('a', 'notify.feed'),
      node('b', 'notify.feed', { x: { wire: { from: 'ghost', port: 'value' } } }),
    ]);
    const code = (to: string, key = 'a'): string =>
      refused(program, [{ op: 'rename', key, to }]).code;
    expect(code('b')).toBe('key_taken');
    expect(code('a')).toBe('key_taken');
    expect(code('trigger')).toBe('key_taken');
    expect(code('ghost')).toBe('referenced');
    expect(code('fine', 'nope')).toBe('unknown_key');
  });
});
