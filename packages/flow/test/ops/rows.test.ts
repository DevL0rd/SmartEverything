import type { FlowNode, PortValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PATCH_OP, type PatchOp } from '../../src/ops/schema';
import { automation, node, ok, refused, roundTrip, uuid } from './support';

const BRANCH_A = uuid();
const BRANCH_B = uuid();
const CASE_A = uuid();
const CASE_B = uuid();
const CATCH_A = uuid();
const CATCH_B = uuid();

function chooser(): FlowNode {
  return {
    ...node('pick', 'flow.if'),
    branches: [
      { id: BRANCH_A, when: { lit: true }, scope: { nodes: [node('inA', 'notify.feed')] } },
      { id: BRANCH_B, when: { lit: false }, scope: { nodes: [] } },
    ],
  };
}

function switcher(): FlowNode {
  return {
    ...node('sw', 'flow.switch', { value: { lit: 1 } }),
    cases: [
      { id: CASE_A, match: { eq: 1 }, scope: { nodes: [node('inC', 'notify.feed')] } },
      { id: CASE_B, match: { eq: 2 }, scope: { nodes: [] } },
    ],
  };
}

function guarded(): FlowNode {
  return {
    ...node('guard', 'flow.try'),
    scopes: { try: { nodes: [node('risky', 'notify.feed')] } },
    catches: [
      { id: CATCH_A, classes: ['Timeout'], scope: { nodes: [node('inK', 'notify.feed')] } },
      { id: CATCH_B, scope: { nodes: [] } },
    ],
  };
}

const program = (): ReturnType<typeof automation> =>
  automation([chooser(), switcher(), guarded(), node('after', 'notify.feed')]);

function rows(result: { body: { nodes: FlowNode[] } }, key: string): FlowNode {
  const found = result.body.nodes.find((entry) => entry.key === key);
  if (found === undefined) throw new Error(key);
  return found;
}

describe('row ops', () => {
  it('adds a branch at an index with a scope and undoes it', () => {
    const id = uuid();
    const result = roundTrip(program(), [
      {
        op: 'row',
        key: 'pick',
        edit: {
          row: 'branch',
          t: 'add',
          id,
          when: { lit: true },
          scope: { nodes: [{ kind: 'notify.feed', key: 'fresh' }] },
          index: 1,
        },
      },
    ]);
    const branches = rows(result, 'pick').branches ?? [];
    expect(branches.map((row) => row.id)).toEqual([BRANCH_A, id, BRANCH_B]);
    expect(branches[1]?.scope.nodes.map((entry) => entry.key)).toEqual(['fresh']);
  });

  it('changes a branch condition, moves a branch and undoes both', () => {
    const when: PortValue = { wire: { from: 'after', port: 'ok' } };
    const result = roundTrip(program(), [
      { op: 'row', key: 'pick', edit: { row: 'branch', t: 'when', id: BRANCH_B, when } },
      { op: 'row', key: 'pick', edit: { row: 'branch', t: 'move', id: BRANCH_B, to: 0 } },
    ]);
    const branches = rows(result, 'pick').branches ?? [];
    expect(branches.map((row) => row.id)).toEqual([BRANCH_B, BRANCH_A]);
    expect(branches[0]?.when).toEqual(when);
  });

  it('removes a branch with its nodes and restores them in place', () => {
    const result = roundTrip(program(), [
      { op: 'row', key: 'pick', edit: { row: 'branch', t: 'remove', id: BRANCH_A } },
    ]);
    expect((rows(result, 'pick').branches ?? []).map((row) => row.id)).toEqual([BRANCH_B]);
  });

  it('keeps the last branch', () => {
    const lone = automation([{ ...chooser(), branches: (chooser().branches ?? []).slice(0, 1) }]);
    expect(
      refused(lone, [
        { op: 'row', key: 'pick', edit: { row: 'branch', t: 'remove', id: BRANCH_A } },
      ]).code,
    ).toBe('not_allowed');
  });

  it('refuses removing a row whose nodes are read, then cascades and undoes', () => {
    const reading = automation([
      chooser(),
      node('user', 'notify.feed', { x: { wire: { from: 'inA', port: 'ok' } } }),
    ]);
    const op = {
      op: 'row' as const,
      key: 'pick',
      edit: { row: 'branch' as const, t: 'remove' as const, id: BRANCH_A },
    };
    const blocked = refused(reading, [op]);
    expect(blocked.code).toBe('referenced');
    expect(blocked.reason).toContain('"inA" is read by port "x" of "user"');
    const done = ok(reading, [{ ...op, cascade: true }]);
    expect(done.detached.map((item) => [item.owner, item.port])).toEqual([['user', 'x']]);
    roundTrip(reading, [{ ...op, cascade: true }]);
  });

  it('edits, moves, adds and removes case rows and undoes them', () => {
    const id = uuid();
    const result = roundTrip(program(), [
      { op: 'row', key: 'sw', edit: { row: 'case', t: 'match', id: CASE_B, match: { eq: 5 } } },
      { op: 'row', key: 'sw', edit: { row: 'case', t: 'move', id: CASE_B, to: 0 } },
      { op: 'row', key: 'sw', edit: { row: 'case', t: 'add', id, match: { eq: 9 } } },
      { op: 'row', key: 'sw', edit: { row: 'case', t: 'remove', id: CASE_A } },
    ]);
    const cases = rows(result, 'sw').cases ?? [];
    expect(cases.map((row) => row.id)).toEqual([CASE_B, id]);
    expect(cases[0]?.match).toEqual({ eq: 5 });
  });

  it('removes the last case row, leaving an empty list, and undoes it', () => {
    const lone = automation([{ ...switcher(), cases: (switcher().cases ?? []).slice(1) }]);
    const result = roundTrip(lone, [
      { op: 'row', key: 'sw', edit: { row: 'case', t: 'remove', id: CASE_B } },
    ]);
    expect(rows(result, 'sw').cases).toEqual([]);
  });

  it('sets, clears and moves catch rows and undoes them', () => {
    const id = uuid();
    const result = roundTrip(program(), [
      { op: 'row', key: 'guard', edit: { row: 'catch', t: 'classes', id: CATCH_A, classes: null } },
      {
        op: 'row',
        key: 'guard',
        edit: { row: 'catch', t: 'classes', id: CATCH_B, classes: ['Timeout'] },
      },
      { op: 'row', key: 'guard', edit: { row: 'catch', t: 'add', id, classes: ['Timeout'] } },
      { op: 'row', key: 'guard', edit: { row: 'catch', t: 'move', id, to: 0 } },
    ]);
    const catches = rows(result, 'guard').catches ?? [];
    expect(catches.map((row) => row.id)).toEqual([id, CATCH_A, CATCH_B]);
    expect(catches[1]?.classes).toBeUndefined();
    expect(catches[2]?.classes).toEqual(['Timeout']);
  });

  it('adds the first catch row to a node without any and removes the field again', () => {
    const plain = automation([{ ...guarded(), catches: undefined }]);
    const id = uuid();
    const result = roundTrip(plain, [
      { op: 'row', key: 'guard', edit: { row: 'catch', t: 'add', id } },
    ]);
    expect((rows(result, 'guard').catches ?? []).map((row) => row.id)).toEqual([id]);
  });

  it('refuses unknown rows, taken ids, bad positions and triggers', () => {
    const edit = (row: unknown): PatchOp[] => [
      PATCH_OP.parse({ op: 'row', key: 'pick', edit: row }),
    ];
    expect(refused(program(), edit({ row: 'branch', t: 'remove', id: uuid() })).code).toBe(
      'unknown_key',
    );
    expect(
      refused(program(), edit({ row: 'branch', t: 'add', id: BRANCH_A, when: { lit: true } })).code,
    ).toBe('id_taken');
    expect(refused(program(), edit({ row: 'branch', t: 'move', id: BRANCH_A, to: 2 })).code).toBe(
      'bad_placement',
    );
    expect(
      refused(program(), edit({ row: 'branch', t: 'add', id: uuid(), when: { lit: 1 }, index: 3 }))
        .code,
    ).toBe('bad_placement');
    expect(
      refused(program(), [
        { op: 'row', key: 'nothing', edit: { row: 'catch', t: 'remove', id: CATCH_A } },
      ]).code,
    ).toBe('unknown_key');
  });

  it('parses only well-formed row edits', () => {
    const good = {
      op: 'row',
      key: 'a',
      edit: { row: 'catch', t: 'classes', id: uuid(), classes: null },
    };
    expect(PATCH_OP.safeParse(good).success).toBe(true);
    const bad = {
      op: 'row',
      key: 'a',
      edit: { row: 'catch', t: 'classes', id: uuid(), classes: [] },
    };
    expect(PATCH_OP.safeParse(bad).success).toBe(false);
    const mixed = {
      op: 'row',
      key: 'a',
      edit: { row: 'case', t: 'when', id: uuid(), when: { lit: 1 } },
    };
    expect(PATCH_OP.safeParse(mixed).success).toBe(false);
  });
});
