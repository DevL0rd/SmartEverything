import { describe, expect, it } from 'vitest';
import {
  automation,
  branching,
  loop,
  node,
  ok,
  refused,
  roundTrip,
  trigger,
  uuid,
  withTriggers,
} from './support';
import type { FlowNode } from '@smarteverything/domain';

const base = (): ReturnType<typeof automation> =>
  automation([
    node('a', 'notify.feed'),
    node('b', 'notify.feed'),
    node('c', 'notify.feed'),
    node('d', 'notify.feed'),
  ]);

describe('wrap', () => {
  it('wraps a contiguous run in a loop and undoes it', () => {
    const result = ok(base(), [
      { op: 'wrap', keys: ['c', 'b'], kind: 'flow.repeat', ports: { times: { lit: 3 } } },
    ]);
    expect(result.program.body.nodes.map((n) => n.key)).toEqual(['a', 'flowRepeat', 'd']);
    const container = result.program.body.nodes[1];
    expect(container?.scopes?.['body']?.nodes.map((n) => n.key)).toEqual(['b', 'c']);
    expect(container?.ports).toEqual({ times: { lit: 3 } });
    expect(result.created).toEqual([{ key: 'flowRepeat', id: container?.id }]);
    expect(result.inverse).toEqual([{ op: 'unwrap', key: 'flowRepeat' }]);
    roundTrip(base(), [
      { op: 'wrap', keys: ['c', 'b'], kind: 'flow.repeat', ports: { times: { lit: 3 } } },
    ]);
  });

  it('wraps in a try and in an if', () => {
    const tried = roundTrip(base(), [
      {
        op: 'wrap',
        keys: ['a'],
        kind: 'flow.try',
        key: 'guard',
        label: 'Guard',
        note: 'n',
        enabled: true,
        policy: { onError: 'fail' },
      },
    ]);
    expect(tried.body.nodes[0]?.scopes?.['try']?.nodes.map((n) => n.key)).toEqual(['a']);
    const rowId = uuid();
    const iffed = roundTrip(base(), [
      { op: 'wrap', keys: ['a', 'b'], kind: 'flow.if', when: { lit: true }, rowId, id: uuid() },
    ]);
    expect(iffed.body.nodes[0]?.branches?.[0]?.id).toBe(rowId);
    const generated = ok(base(), [
      { op: 'wrap', keys: ['a'], kind: 'flow.if', when: { lit: true } },
    ]);
    expect(generated.program.body.nodes[0]?.branches?.[0]?.id).toMatch(/^11111111/);
  });

  it('wraps inside a nested scope', () => {
    const program = automation([loop('rep', [node('x', 'notify.feed'), node('y', 'notify.feed')])]);
    const result = roundTrip(program, [
      { op: 'wrap', keys: ['x', 'y'], kind: 'flow.while', ports: { condition: { lit: true } } },
    ]);
    expect(result.body.nodes[0]?.scopes?.['body']?.nodes[0]?.kind).toBe('flow.while');
  });

  it('refuses what cannot be wrapped', () => {
    const program = withTriggers(base(), trigger('press'));
    const code = (op: Parameters<typeof refused>[1][number]): string => refused(program, [op]).code;
    expect(code({ op: 'wrap', keys: ['ghost'], kind: 'flow.repeat' })).toBe('unknown_key');
    expect(code({ op: 'wrap', keys: ['press'], kind: 'flow.repeat' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a', 'ghost'], kind: 'flow.repeat' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a', 'press'], kind: 'flow.repeat' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a', 'c'], kind: 'flow.repeat' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a', 'a'], kind: 'flow.repeat' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a'], kind: 'flow.switch' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a'], kind: 'flow.if' })).toBe('not_allowed');
    expect(code({ op: 'wrap', keys: ['a'], kind: 'flow.repeat', when: { lit: true } })).toBe(
      'not_allowed',
    );
    expect(code({ op: 'wrap', keys: ['a'], kind: 'flow.repeat', key: 'b' })).toBe('key_taken');
    expect(
      code({ op: 'wrap', keys: ['a'], kind: 'flow.repeat', id: program.body.nodes[0]?.id ?? '' }),
    ).toBe('id_taken');
  });

  it('refuses a key a wire already reads', () => {
    const program = automation([
      node('a', 'notify.feed', { x: { wire: { from: 'box', port: 'ok' } } }),
    ]);
    expect(
      refused(program, [{ op: 'wrap', keys: ['a'], kind: 'flow.repeat', key: 'box' }]).code,
    ).toBe('referenced');
  });
});

describe('unwrap', () => {
  it('unwraps loops, tries and ifs in place and undoes it', () => {
    const rep = loop('rep', [node('x', 'notify.feed'), node('y', 'notify.feed')]);
    const program = automation([
      node('a', 'notify.feed'),
      { ...rep, label: 'Many', note: 'n', enabled: true, policy: { onError: 'fail' } },
      node('b', 'notify.feed'),
    ]);
    const result = roundTrip(program, [{ op: 'unwrap', key: 'rep' }]);
    expect(result.body.nodes.map((n) => n.key)).toEqual(['a', 'x', 'y', 'b']);
    const tried: FlowNode = {
      ...node('t', 'flow.try'),
      scopes: { try: { nodes: [node('x', 'notify.feed')] } },
    };
    expect(
      roundTrip(automation([tried]), [{ op: 'unwrap', key: 't' }]).body.nodes.map((n) => n.key),
    ).toEqual(['x']);
    const iffed = branching('i', { lit: true }, [node('x', 'notify.feed')]);
    expect(
      roundTrip(automation([iffed]), [{ op: 'unwrap', key: 'i' }]).body.nodes.map((n) => n.key),
    ).toEqual(['x']);
  });

  it('refuses what is not a plain single-scope container', () => {
    const code = (nodes: FlowNode[], key: string): string =>
      refused(automation(nodes), [{ op: 'unwrap', key }]).code;
    expect(code([node('a', 'notify.feed')], 'a')).toBe('not_allowed');
    expect(code([loop('rep', [])], 'rep')).toBe('not_allowed');
    const twoBranches: FlowNode = {
      ...branching('i', { lit: true }, [node('x', 'notify.feed')]),
      scopes: { else: { nodes: [node('y', 'notify.feed')] } },
    };
    expect(code([twoBranches], 'i')).toBe('not_allowed');
    const parallel: FlowNode = {
      ...node('p', 'flow.parallel'),
      scopes: { body: { nodes: [node('x', 'notify.feed')] } },
    };
    expect(code([parallel], 'p')).toBe('not_allowed');
    const withOutputs: FlowNode = {
      ...loop('rep', [node('x', 'notify.feed')]),
      outputs: [{ name: 'o', values: { body: { lit: 1 } } }],
    };
    expect(code([withOutputs], 'rep')).toBe('not_allowed');
    expect(code([node('a', 'notify.feed')], 'ghost')).toBe('unknown_key');
    const program = withTriggers(automation([]), trigger('press'));
    expect(refused(program, [{ op: 'unwrap', key: 'press' }]).code).toBe('not_allowed');
  });

  it('refuses while something reads the container', () => {
    const program = automation([
      loop('rep', [node('x', 'notify.feed', { v: { wire: { from: 'rep', port: 'item' } } })]),
    ]);
    expect(refused(program, [{ op: 'unwrap', key: 'rep' }]).code).toBe('referenced');
  });
});
