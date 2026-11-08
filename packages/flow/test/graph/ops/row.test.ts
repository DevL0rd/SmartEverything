import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automation, idOf, ifNode, start, step, switchNode, tryNode } from '../graph-fixtures';
import { expectStructured, expectUndo, nodeAt, ok, refused } from './support';

const decide = automation([
  start('d'),
  ifNode('d', [{ name: 'one', to: 'x' }], 'z'),
  step('x'),
  step('z'),
  step('w'),
]);

describe('row', () => {
  it('adds a branch without a wire, with a wire and at an index', () => {
    const plain = ok(
      decide,
      [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'add', when: { lit: true } } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    const rows = nodeAt(plain.program, 'd').branches ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[1]?.to).toBeUndefined();
    expect(rows[1]?.id).toMatch(/^22222222-/);
    const wired = ok(decide, [
      {
        op: 'row',
        key: 'd',
        edit: { row: 'branch', t: 'add', when: { lit: true }, to: 'w', index: 0 },
      },
    ]);
    expect(nodeAt(wired.program, 'd').branches?.[0]?.to).toBe('w');
    expectStructured(wired.program);
  });

  it('removes a branch with its wire, keeps at least one, and edits its condition and order', () => {
    const two = ok(decide, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'add', when: { lit: false }, to: 'w' } },
    ]).program;
    const second = nodeAt(two, 'd').branches?.[1]?.id ?? '';
    const gone = ok(
      two,
      [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'remove', id: second } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(gone.program, 'd').branches).toHaveLength(1);
    expect(gone.problems.map((problem) => problem.key)).toEqual(['w']);
    const only = idOf('d:one');
    expect(
      refused(decide, [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'remove', id: only } }])
        .code,
    ).toBe('not_allowed');
    const edited = ok(two, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'when', id: second, when: { lit: 5 } } },
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'move', id: second, at: 0 } },
    ]);
    expect(nodeAt(edited.program, 'd').branches?.[0]).toMatchObject({
      id: second,
      when: { lit: 5 },
    });
  });

  it('edits cases with and without a wire', () => {
    const program = automation([
      start('s'),
      switchNode('s', [{ name: 'red', to: 'x' }], 'z'),
      step('x'),
      step('z'),
      step('w'),
    ]);
    const added = ok(program, [
      { op: 'row', key: 's', edit: { row: 'case', t: 'add', match: { eq: 'blue' }, to: 'w' } },
    ]);
    expect(nodeAt(added.program, 's').cases?.map((row) => row.to)).toEqual(['x', 'w']);
    const red = idOf('s:red');
    const removed = ok(
      program,
      [{ op: 'row', key: 's', edit: { row: 'case', t: 'remove', id: red } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(removed.program, 's').cases).toEqual([]);
    const matched = ok(
      program,
      [{ op: 'row', key: 's', edit: { row: 'case', t: 'match', id: red, match: { eq: 'green' } } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(matched.program, 's').cases?.[0]?.match).toEqual({ eq: 'green' });
  });

  it('edits catches and drops the list when the last one goes', () => {
    const program = automation([
      start('t'),
      tryNode('t', { attempt: 'x', catches: [{ name: 'any', to: 'z' }], next: 'w' }),
      step('x'),
      step('z'),
      step('w'),
    ]);
    const any = idOf('t:any');
    const classes = ok(
      program,
      [
        {
          op: 'row',
          key: 't',
          edit: { row: 'catch', t: 'classes', id: any, classes: ['Unreachable'] },
        },
      ],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(classes.program, 't').catches?.[0]?.classes).toEqual(['Unreachable']);
    const none = ok(
      program,
      [{ op: 'row', key: 't', edit: { row: 'catch', t: 'remove', id: any } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(none.program, 't').catches).toBeUndefined();
    const added = ok(
      program,
      [{ op: 'row', key: 't', edit: { row: 'catch', t: 'add', classes: ['Timeout'] } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(added.program, 't').catches).toHaveLength(2);
  });

  it('refuses rows on the wrong kind and unknown rows', () => {
    const wrongKind = refused(decide, [
      { op: 'row', key: 'x', edit: { row: 'branch', t: 'add', when: { lit: true } } },
    ]);
    expect(wrongKind.code).toBe('not_allowed');
    expect(
      refused(decide, [
        {
          op: 'row',
          key: 'd',
          edit: { row: 'branch', t: 'when', id: idOf('nope'), when: { lit: 1 } },
        },
      ]).code,
    ).toBe('unknown_key');
  });

  it('undoes every row edit', () => {
    const id = idOf('d:one');
    const withTwo = ok(decide, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'add', when: { lit: false }, to: 'w' } },
    ]).program;
    expectUndo(decide, [
      {
        op: 'row',
        key: 'd',
        edit: { row: 'branch', t: 'add', when: { lit: true }, to: 'w', index: 0 },
      },
    ]);
    expectUndo(withTwo, [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'remove', id } }]);
    expectUndo(withTwo, [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'move', id, at: 1 } }]);
    expectUndo(withTwo, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'when', id, when: { lit: 9 } } },
    ]);
    expectUndo(withTwo, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'name', id, name: 'Night' } },
    ]);
  });

  it('names a branch, keeps the name through remove and undo, and clears it', () => {
    const id = idOf('d:one');
    const named = ok(
      decide,
      [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'name', id, name: 'Night' } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(named.program, 'd').branches?.[0]).toMatchObject({ id, name: 'Night' });
    const withTwo = ok(named.program, [
      { op: 'row', key: 'd', edit: { row: 'branch', t: 'add', when: { lit: false }, to: 'w' } },
    ]).program;
    expectUndo(withTwo, [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'remove', id } }]);
    const cleared = ok(
      named.program,
      [{ op: 'row', key: 'd', edit: { row: 'branch', t: 'name', id, name: null } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(cleared.program, 'd').branches?.[0]).not.toHaveProperty('name');
  });
});
