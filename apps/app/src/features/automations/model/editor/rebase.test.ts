import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { describe, expect, it } from 'vitest';
import { automation, idSource, repeat, step } from './editor-fixtures';
import {
  deepEqual,
  describeOp,
  draftOps,
  rebaseDraft,
  rebaseLayout,
  type RebaseResult,
} from './rebase';

const BASE: Program = automation([
  step('a', { level: { lit: 10 }, color: { lit: 'red' } }),
  step('b'),
  step('c', undefined, { label: 'Third' }),
]);

const nextId = idSource();

function edit(program: Program, ops: readonly PatchOp[]): Program {
  const result = applyPatch(program, ops, { newId: nextId });
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

function keys(program: Program): string[] {
  return program.body.nodes.map((node) => node.key);
}

function replayed(from: Program, to: Program): Program {
  return edit(from, draftOps(from, to));
}

describe('draftOps', () => {
  it('is empty for equal programs', () => {
    expect(draftOps(BASE, structuredClone(BASE))).toEqual([]);
  });

  it('turns a program difference back into ops that reproduce it', () => {
    const start = BASE;
    const target = edit(start, [
      { op: 'set', key: 'a', ports: { level: { lit: 40 } }, label: 'Dim' },
      { op: 'unset', key: 'a', ports: ['color'] },
      { op: 'remove', key: 'b' },
      { op: 'add', node: { kind: 'device.set', key: 'd' }, in: 'body', after: 'c' },
      { op: 'move', key: 'c', in: 'body', index: 0 },
    ]);
    expect(keys(replayed(start, target))).toEqual(keys(target));
    expect(replayed(start, target)).toEqual(target);
  });

  it('reproduces a wrap and a move into the new container', () => {
    const start = BASE;
    const target = edit(start, [
      { op: 'wrap', keys: ['a', 'b'], kind: 'flow.repeat', key: 'group' },
    ]);
    expect(replayed(start, target)).toEqual(target);
  });

  it('removes a container with what it holds once survivors left it', () => {
    const start = automation([step('a'), repeat('loop', [step('x'), step('y')])]);
    const target = edit(start, [
      { op: 'move', key: 'x', in: 'body', after: 'a' },
      { op: 'remove', key: 'loop', cascade: true },
    ]);
    expect(keys(replayed(start, target))).toEqual(['a', 'x']);
  });

  it('describes ops in plain words', () => {
    expect(describeOp({ op: 'remove', key: 'b' })).toBe('Remove "b"');
    expect(describeOp({ op: 'rename', key: 'a', to: 'z' })).toBe('Rename "a" to "z"');
    expect(describeOp({ op: 'add', node: { kind: 'device.set', label: 'Lamp' }, in: 'body' })).toBe(
      'Add "Lamp"',
    );
  });
});

describe('rebaseDraft', () => {
  const run = (draft: Program, theirs: Program): RebaseResult =>
    rebaseDraft({
      base: BASE,
      draft,
      draftLayout: EMPTY_LAYOUT,
      theirs,
      theirsLayout: EMPTY_LAYOUT,
      options: { newId: nextId },
    });

  it('keeps both sides when they touch different steps', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'a', ports: { level: { lit: 70 } } }]);
    const theirs = edit(BASE, [{ op: 'set', key: 'c', label: 'Assistant label' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toEqual([]);
    const index = indexProgram(result.program);
    expect(index.byKey.get('a')?.node.ports?.['level']).toEqual({ lit: 70 });
    expect(index.byKey.get('c')?.node.label).toBe('Assistant label');
  });

  it('lets the draft win where both changed the same value', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'a', ports: { level: { lit: 70 } } }]);
    const theirs = edit(BASE, [{ op: 'set', key: 'a', ports: { level: { lit: 20 } } }]);
    const level = indexProgram(run(mine, theirs).program).byKey.get('a')?.node.ports?.['level'];
    expect(level).toEqual({ lit: 70 });
  });

  it('reports a change whose step the other side removed', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'b', label: 'Mine' }]);
    const theirs = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toMatchObject({ summary: 'Change "b"' });
    expect(keys(result.program)).toEqual(['a', 'c']);
  });

  it('counts a removal the other side already made as settled, not lost', () => {
    const mine = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const theirs = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toEqual([]);
    expect(result.settled).toHaveLength(1);
  });

  it('applies added steps after the other side added its own', () => {
    const mine = edit(BASE, [
      { op: 'add', node: { kind: 'device.set', key: 'mine' }, in: 'body', after: 'c' },
    ]);
    const theirs = edit(BASE, [
      { op: 'add', node: { kind: 'device.set', key: 'theirs' }, in: 'body', after: 'c' },
    ]);
    expect(keys(run(mine, theirs).program)).toEqual(['a', 'b', 'c', 'mine', 'theirs']);
  });
});

describe('rebaseLayout', () => {
  it('keeps the draft positions, the other side positions and drops removed steps', () => {
    const program = BASE;
    const [a, b, c] = program.body.nodes.map((node) => node.id);
    if (a === undefined || b === undefined || c === undefined) throw new Error('fixture');
    const theirs = { ...EMPTY_LAYOUT, nodes: { [a]: { x: 1, y: 1 }, [c]: { x: 3, y: 3 } } };
    const draft = { ...EMPTY_LAYOUT, nodes: { [a]: { x: 9, y: 9 }, [b]: { x: 2, y: 2 } } };
    const merged = rebaseLayout(theirs, draft, edit(program, [{ op: 'remove', key: 'b' }]));
    expect(merged.nodes).toEqual({ [a]: { x: 9, y: 9 }, [c]: { x: 3, y: 3 } });
  });
});

describe('deepEqual', () => {
  it('compares plain data by value and ignores key order', () => {
    expect(deepEqual({ a: [1, { b: 2 }], c: 'x' }, { c: 'x', a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1] }, { a: [2] })).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});
