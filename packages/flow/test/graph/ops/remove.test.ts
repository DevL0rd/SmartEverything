import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automation, ifNode, join, start, step, stop, together, value } from '../graph-fixtures';
import { chain, expectStructured, expectUndo, nodeAt, ok, refused, toOf } from './support';

const forked = automation([
  start('before'),
  step('before', 'fork'),
  together('fork', [
    { name: 'left', to: 'l1' },
    { name: 'right', to: 'meet' },
  ]),
  step('l1', 'meet'),
  join('meet', 'after'),
  step('after'),
]);

describe('remove', () => {
  it('heals incoming wires to the Then target of a step', () => {
    const done = ok(chain(), [{ op: 'remove', key: 'b', heal: true }]);
    expect(toOf(done.program, 'a', 'next')).toBe('c');
    expect(done.program.nodes.map((node) => node.key)).toEqual(['start', 'a', 'c']);
    expectStructured(done.program);
  });

  it('heals past the end of a path when the removed step was last', () => {
    const done = ok(chain(), [{ op: 'remove', key: 'c', heal: true }]);
    expect(toOf(done.program, 'b', 'next')).toBeUndefined();
    expectStructured(done.program);
  });

  it('deletes the incoming wires without heal and reports what no longer runs', () => {
    const done = ok(chain(), [{ op: 'remove', key: 'b' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(toOf(done.program, 'a', 'next')).toBeUndefined();
    expect(done.problems.map((problem) => [problem.code, problem.key])).toEqual([
      ['never_runs', 'c'],
    ]);
    expect(refused(chain(), [{ op: 'remove', key: 'b' }]).code).toBe('invalid_result');
  });

  it('heals a named If row into the deleted step by its row id, not its name', () => {
    const decision = ifNode('night', [{ name: 'x', to: 'lamp' }], 'other');
    const named = {
      ...decision,
      branches: (decision.branches ?? []).map((row) => ({ ...row, name: 'Night' })),
    };
    const program = automation([
      start('night'),
      named,
      step('lamp', 'after'),
      step('other'),
      step('after'),
    ]);
    const done = ok(program, [{ op: 'remove', key: 'lamp', heal: true }]);
    const node = nodeAt(done.program, 'night');
    expect(node.to).toEqual({ else: 'other' });
    expect(node.branches?.map((row) => [row.name, row.to])).toEqual([['Night', 'after']]);
    expectStructured(done.program);
  });

  it('does not heal a decision: it deletes with its wires and leaves branches unconnected', () => {
    const program = automation([
      start('d'),
      ifNode('d', [{ name: 'x', to: 'y' }], 'z'),
      step('y'),
      step('z'),
    ]);
    const before = automation([start('s'), step('s', 'd'), ...program.nodes.slice(1)]);
    const done = ok(before, [{ op: 'remove', key: 'd', heal: true }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(toOf(done.program, 's', 'next')).toBeUndefined();
    expect(done.problems.map((problem) => problem.key).sort()).toEqual(['y', 'z']);
  });

  it('removes a Do together with its Wait for all and heals to the pair Then target', () => {
    const done = ok(forked, [{ op: 'remove', key: 'fork', heal: true }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(done.program.nodes.map((node) => node.key)).toEqual(['start', 'before', 'l1', 'after']);
    expect(toOf(done.program, 'before', 'next')).toBe('after');
    expect(nodeAt(done.program, 'l1').to).toBeUndefined();
    const fromJoin = ok(forked, [{ op: 'remove', key: 'meet' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(fromJoin.program.nodes.map((node) => node.key)).toEqual([
      'start',
      'before',
      'l1',
      'after',
    ]);
    expect(toOf(fromJoin.program, 'before', 'next')).toBeUndefined();
  });

  it('refuses to remove a node a wire reads unless cascading, and detaches on cascade', () => {
    const reading = automation([
      start('a'),
      value('reading'),
      step('a', undefined, { ports: { level: { wire: { from: 'reading', port: 'value' } } } }),
    ]);
    expect(refused(reading, [{ op: 'remove', key: 'reading' }]).code).toBe('referenced');
    const done = ok(reading, [{ op: 'remove', key: 'reading', cascade: true }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(nodeAt(done.program, 'a').ports).toEqual({});
    expect(done.detached.map((item) => [item.owner, item.port, item.reads])).toEqual([
      ['a', 'level', 'reading'],
    ]);
  });

  it('removes a trigger', () => {
    const withTrigger = ok(chain(), [
      { op: 'add', node: { kind: 'trigger.signal', key: 'sig', ports: {} } },
    ]).program;
    const done = ok(withTrigger, [{ op: 'remove', key: 'sig' }]);
    expect(done.program.kind === 'automation' ? done.program.triggers : []).toEqual([]);
    expect(refused(chain(), [{ op: 'remove', key: 'nope' }]).code).toBe('unknown_key');
  });

  it('undoes plain, healed, pair and value removals exactly', () => {
    expectUndo(chain(), [{ op: 'remove', key: 'b', heal: true }]);
    expectUndo(chain(), [{ op: 'remove', key: 'b' }]);
    expectUndo(forked, [{ op: 'remove', key: 'fork', heal: true }]);
    expectUndo(forked, [{ op: 'remove', key: 'meet' }]);
    const reading = automation([
      start('a'),
      value('reading'),
      step('a', undefined, { ports: { level: { wire: { from: 'reading', port: 'value' } } } }),
      stop('end'),
    ]);
    expectUndo(reading, [{ op: 'remove', key: 'reading', cascade: true }]);
  });
});
