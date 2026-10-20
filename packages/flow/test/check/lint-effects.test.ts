import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { automation, wired, lit, node, scope } from './c23-support';
import { findings, keysOf, only } from './lint-support';

const RETRY = { attempts: 2, backoff: 'fixed', initial: 1000 } as const;

function parallel(...branches: FlowNode[][]): FlowNode {
  return node(
    'both',
    'flow.parallel',
    {},
    {
      scopes: Object.fromEntries(branches.map((nodes, at) => [`b${String(at)}`, scope(...nodes)])),
    },
  );
}

describe('lint of writes inside Do together', () => {
  it('rejects run variable writes in a branch, at any depth', () => {
    const deep = node(
      'each',
      'flow.for_each',
      { items: lit([1]) },
      { scopes: { body: scope(node('w3', 'var.change', { name: lit('n'), op: lit('add') })) } },
    );
    const found = findings(
      automation([
        parallel(
          [node('w1', 'var.set', { name: lit('n'), to: lit(1) })],
          [
            node('w2', 'var.set', { name: wired('inputs.x'), source: lit('run'), to: lit(1) }),
            deep,
          ],
        ),
        node('after', 'var.set', { name: lit('n'), to: lit(2) }),
      ]),
    );
    expect(keysOf(found, 'parallel_variable_write')).toEqual(['w1', 'w2', 'w3']);
    expect(only(found, 'parallel_variable_write')[0]?.message).toContain(' n.');
    expect(only(found, 'parallel_variable_write')[1]?.message).not.toContain(' n.');
  });

  it('allows persistent and home writes', () => {
    const found = findings(
      automation([
        parallel(
          [node('p', 'var.set', { name: lit('n'), source: lit('automation'), to: lit(1) })],
          [node('h', 'var.set', { source: lit('home'), value: lit('v'), to: lit(1) })],
        ),
      ]),
    );
    expect(only(found, 'parallel_variable_write')).toEqual([]);
  });
});

describe('lint of retries', () => {
  it('rejects a retry on a step that is not safe to repeat', () => {
    const found = findings(
      automation([
        node('feed', 'notify.feed', { message: lit('x') }, { policy: { retry: RETRY } }),
        node(
          'okay',
          'notify.feed',
          { message: lit('x') },
          { policy: { retry: RETRY, acknowledgeRepeat: true } },
        ),
        node('safe', 'var.set', { name: lit('n'), to: lit(1) }, { policy: { retry: RETRY } }),
        node('plain', 'notify.feed', { message: lit('x') }, { policy: { onError: 'continue' } }),
        node('none', 'notify.feed', { message: lit('x') }),
        node('control', 'flow.if', {}, { branches: [], policy: { retry: RETRY } }),
      ]),
    );
    expect(keysOf(found, 'retry_not_idempotent')).toEqual(['feed']);
  });
});

describe('lint of switched off steps', () => {
  const list = node('len', 'list.length', { list: lit([1]) }, { enabled: false });
  const lamp = node(
    'lamp',
    'device.set',
    { target: lit({ device: 'd1' }), control: lit('power'), to: lit(true) },
    { enabled: false },
  );
  const known = { known: new Set(['d1']) };

  it('rejects a read of a value from a step that is off', () => {
    const consumer = node('say', 'notify.feed', { message: wired('len.length') });
    const found = findings(automation([list, consumer], { admit: wired('len.length') }));
    const hits = only(found, 'disabled_node_consumed');
    expect(hits.map((item) => [item.key, item.port])).toEqual([
      ['say', 'message'],
      [undefined, 'admit'],
    ]);
  });

  it('allows an optional output, and a consumer that is off too', () => {
    const optional = node('say', 'notify.feed', { message: wired('lamp.value') });
    const dead = node('mute', 'notify.feed', { message: wired('lamp.ok') }, { enabled: false });
    const found = findings(automation([lamp, optional, dead]), known);
    expect(only(found, 'disabled_node_consumed')).toEqual([]);
  });

  it('rejects a read from a switched off step of an unknown kind', () => {
    const ghost = node('ghost', 'ghost.kind', {}, { enabled: false });
    const consumer = node('say', 'notify.feed', { message: wired('ghost.value') });
    expect(keysOf(findings(automation([ghost, consumer])), 'disabled_node_consumed')).toEqual([
      'say',
    ]);
  });

  it('allows reads from steps that are on', () => {
    const live = node('live', 'list.length', { list: lit([1]) });
    const consumer = node('say', 'notify.feed', { message: wired('live.length') });
    const found = findings(automation([list, live, consumer]));
    expect(only(found, 'disabled_node_consumed')).toEqual([]);
  });

  it('is quiet when nothing is switched off', () => {
    const found = findings(automation([node('say', 'notify.feed', { message: lit('x') })]));
    expect(only(found, 'disabled_node_consumed')).toEqual([]);
  });
});

describe('lint of variables that are never read', () => {
  const COUNT = { name: 'count', type: { t: 'number' } as const, initial: lit(0) };
  const write = node('w', 'var.set', { name: lit('count'), to: lit(1) });

  it('warns about a variable that is written and never read', () => {
    const found = findings(automation([write], { variables: [COUNT] }));
    expect(only(found, 'variable_never_read').map((item) => item.port)).toEqual([
      'variables.count',
    ]);
  });

  it('counts a wire and a Get variable step as reads', () => {
    const use = node('say', 'notify.feed', { message: wired('vars.count') });
    const get = node('get', 'var.get', { name: lit('count') });
    for (const reader of [use, get]) {
      const found = findings(automation([write, reader], { variables: [COUNT] }));
      expect(only(found, 'variable_never_read')).toEqual([]);
    }
  });

  it('is cautious when a name is not fixed', () => {
    const dynamic = node('get', 'var.get', { name: wired('inputs.x') });
    const found = findings(automation([write, dynamic], { variables: [COUNT] }));
    expect(only(found, 'variable_never_read')).toEqual([]);
  });

  it('ignores home values, undeclared names and variables nobody writes', () => {
    const home = node('shared', 'var.get', { source: lit('home'), value: lit('v') });
    const other = node('o', 'var.set', { name: lit('ghost'), to: lit(1) });
    const found = findings(automation([home, other], { variables: [COUNT] }));
    expect(only(found, 'variable_never_read')).toEqual([]);
  });

  it('counts a persistent write', () => {
    const kept = node('k', 'var.change', {
      name: lit('count'),
      source: lit('automation'),
      op: lit('add'),
    });
    const found = findings(automation([kept], { variables: [COUNT] }));
    expect(only(found, 'variable_never_read')).toHaveLength(1);
  });
});
