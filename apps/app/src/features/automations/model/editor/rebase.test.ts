import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { EMPTY_LAYOUT, type GraphNode, type ProgramV4 } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { describe, expect, it } from 'vitest';
import { automation, idOf, note, start } from '../graph/graph-scene-fixtures';
import { idSource } from './editor-fixtures';
import {
  deepEqual,
  describeOp,
  draftOps,
  rebaseDraft,
  rebaseLayout,
  type RebaseResult,
} from './rebase';

const BASE: ProgramV4 = automation(
  [
    start('a'),
    note('a', 'b', { ports: { message: { lit: 'one' }, color: { lit: 'red' } } }),
    note('b', 'c'),
    note('c', undefined, { label: 'Third' }),
  ],
  { triggers: [] },
);

const nextId = idSource();

function edit(program: ProgramV4, ops: readonly PatchOp[]): ProgramV4 {
  const result = applyPatch(program, ops, {
    kinds: STATIC_KIND_LOOKUP,
    newId: nextId,
    allowProblems: true,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

function keys(program: ProgramV4): string[] {
  return program.nodes.map((node) => node.key).sort();
}

function node(program: ProgramV4, key: string): GraphNode | undefined {
  return program.nodes.find((item) => item.key === key);
}

function replayed(from: ProgramV4, to: ProgramV4): ProgramV4 {
  return edit(from, draftOps(from, to, STATIC_KIND_LOOKUP));
}

const ADDED: PatchOp = {
  op: 'add',
  node: { kind: 'notify.feed', key: 'd', ports: { message: { lit: 'new' } } },
  after: { key: 'c', port: 'next' },
};

describe('draftOps', () => {
  it('is empty for equal programs', () => {
    expect(draftOps(BASE, structuredClone(BASE), STATIC_KIND_LOOKUP)).toEqual([]);
  });

  it('turns a program difference back into ops that reproduce it', () => {
    const target = edit(BASE, [
      { op: 'set', key: 'a', ports: { message: { lit: 'two' } }, label: 'Dim' },
      { op: 'unset', key: 'a', ports: ['color'] },
      { op: 'remove', key: 'b', heal: true },
      ADDED,
    ]);
    const again = replayed(BASE, target);
    expect(keys(again)).toEqual(keys(target));
    expect(node(again, 'a')).toEqual(node(target, 'a'));
    expect(node(again, 'd')?.ports).toEqual({ message: { lit: 'new' } });
    expect(node(again, 'a')?.to).toEqual({ next: 'c' });
    expect(node(again, 'c')?.to).toEqual({ next: 'd' });
  });

  it('reproduces a rename and the wires that follow it', () => {
    const target = edit(BASE, [{ op: 'rename', key: 'b', to: 'middle' }]);
    const again = replayed(BASE, target);
    expect(keys(again)).toEqual(keys(target));
    expect(node(again, 'a')?.to).toEqual({ next: 'middle' });
  });

  it('reproduces rows added to a decision and a path added to a fork', () => {
    const withIf = edit(BASE, [
      {
        op: 'add',
        node: { kind: 'flow.if', key: 'check', branches: [{ when: { lit: true } }] },
        after: { key: 'a', port: 'next' },
      },
      {
        op: 'add',
        node: { kind: 'flow.parallel', key: 'both' },
        after: { key: 'c', port: 'next' },
      },
    ]);
    const target = edit(withIf, [
      {
        op: 'row',
        key: 'check',
        edit: { row: 'branch', t: 'add', when: { lit: false }, to: 'c' },
      },
      { op: 'path', key: 'both', edit: { t: 'add', name: 'path3' } },
    ]);
    const again = replayed(withIf, target);
    expect(node(again, 'check')?.branches).toHaveLength(2);
    expect(node(again, 'both')?.paths?.map((path) => path.name)).toEqual([
      'path1',
      'path2',
      'path3',
    ]);
    expect(node(again, 'check')?.branches?.[1]?.to).toBe('c');
  });

  it('adds a Do together with the Wait for all it was drawn with', () => {
    const target = edit(BASE, [
      {
        op: 'add',
        node: { kind: 'flow.parallel', key: 'both' },
        after: { key: 'c', port: 'next' },
      },
    ]);
    const again = replayed(BASE, target);
    expect(keys(again)).toEqual(keys(target));
    expect(again.nodes.filter((item) => item.kind === 'flow.join')).toHaveLength(1);
  });

  it('describes ops in plain words', () => {
    expect(describeOp({ op: 'remove', key: 'b' })).toBe('Remove "b"');
    expect(describeOp({ op: 'rename', key: 'a', to: 'z' })).toBe('Rename "a" to "z"');
    expect(describeOp({ op: 'connect', from: 'a', port: 'next', to: 'z' })).toBe(
      'Connect "a" to "z"',
    );
    expect(describeOp({ op: 'add', node: { kind: 'device.set', label: 'Lamp' } })).toBe(
      'Add "Lamp"',
    );
  });
});

describe('rebaseDraft', () => {
  const run = (draft: ProgramV4, theirs: ProgramV4): RebaseResult =>
    rebaseDraft(
      {
        base: BASE,
        draft,
        draftLayout: EMPTY_LAYOUT,
        theirs,
        theirsLayout: EMPTY_LAYOUT,
        options: { newId: nextId },
      },
      STATIC_KIND_LOOKUP,
    );

  it('keeps both sides when they touch different steps', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'a', ports: { message: { lit: 'mine' } } }]);
    const theirs = edit(BASE, [{ op: 'set', key: 'c', label: 'Assistant label' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toEqual([]);
    expect(node(result.program, 'a')?.ports?.['message']).toEqual({ lit: 'mine' });
    expect(node(result.program, 'c')?.label).toBe('Assistant label');
  });

  it('lets the draft win where both changed the same value', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'a', ports: { message: { lit: 'mine' } } }]);
    const theirs = edit(BASE, [{ op: 'set', key: 'a', ports: { message: { lit: 'theirs' } } }]);
    expect(node(run(mine, theirs).program, 'a')?.ports?.['message']).toEqual({ lit: 'mine' });
  });

  it('reports a change whose step the other side removed', () => {
    const mine = edit(BASE, [{ op: 'set', key: 'b', label: 'Mine' }]);
    const theirs = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toMatchObject({ summary: 'Change "b"' });
    expect(keys(result.program)).toEqual(['a', 'c', 'start']);
  });

  it('counts a removal the other side already made as settled, not lost', () => {
    const mine = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const theirs = edit(BASE, [{ op: 'remove', key: 'b' }]);
    const result = run(mine, theirs);
    expect(result.dropped).toEqual([]);
    expect(result.settled.map((op) => op.op)).toContain('remove');
  });

  it('keeps added steps from both sides', () => {
    const mine = edit(BASE, [
      {
        op: 'add',
        node: { kind: 'notify.feed', key: 'mine' },
        after: { key: 'c', port: 'next' },
      },
    ]);
    const theirs = edit(BASE, [
      {
        op: 'add',
        node: { kind: 'notify.feed', key: 'theirs' },
        after: { key: 'b', port: 'next' },
      },
    ]);
    expect(keys(run(mine, theirs).program)).toEqual(['a', 'b', 'c', 'mine', 'start', 'theirs']);
  });
});

describe('rebaseLayout', () => {
  it('keeps the draft positions, the other side positions and drops removed steps', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(idOf);
    if (a === undefined || b === undefined || c === undefined) throw new Error('fixture');
    const theirs = { ...EMPTY_LAYOUT, nodes: { [a]: { x: 1, y: 1 }, [c]: { x: 3, y: 3 } } };
    const draft = { ...EMPTY_LAYOUT, nodes: { [a]: { x: 9, y: 9 }, [b]: { x: 2, y: 2 } } };
    const merged = rebaseLayout(theirs, draft, edit(BASE, [{ op: 'remove', key: 'b' }]));
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
