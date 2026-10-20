import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY, PROGRAM_V3 } from '@smarteverything/domain';
import { Ids, automation, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import type { RowEdit } from './rows-model';
import { applyRowEdit, applyRowEdits, rowLimitsOf } from './rows-model';

const LIMITS = { minimumScopes: 0 };

function ifOf(ids: Ids): FlowNode {
  return {
    ...ids.next(),
    kind: 'flow.if',
    branches: [
      { id: ids.next().id, when: { lit: true }, scope: scope([setLight(ids, null)]) },
      { id: ids.next().id, when: { lit: false }, scope: scope([]) },
    ],
  };
}

function outcome(node: FlowNode, edit: RowEdit, limits = LIMITS): FlowNode {
  const result = applyRowEdit(node, edit, limits);
  if (!result.ok) throw new Error(result.reason);
  return result.node;
}

function reason(node: FlowNode, edit: RowEdit, limits = LIMITS): string {
  const result = applyRowEdit(node, edit, limits);
  if (result.ok) throw new Error('the edit was accepted');
  return result.reason;
}

function valid(node: FlowNode): boolean {
  return PROGRAM_V3.safeParse(automation([node])).success;
}

describe('branches of an If', () => {
  const ids = new Ids();
  const node = ifOf(ids);
  const [first, second] = node.branches ?? [];
  const firstId = first?.id ?? '';
  const secondId = second?.id ?? '';

  it('adds a case that is true until the person changes it', () => {
    const next = outcome(node, { t: 'branch.add', id: ids.next().id });
    expect(next.branches).toHaveLength(3);
    expect(next.branches?.[2]?.when).toEqual({ lit: true });
    expect(next.branches?.[2]?.scope.nodes).toEqual([]);
    expect(valid(next)).toBe(true);
  });

  it('changes the condition of one case only', () => {
    const next = outcome(node, { t: 'branch.when', id: secondId, when: { lit: false } });
    expect(next.branches?.map((row) => row.when)).toEqual([{ lit: true }, { lit: false }]);
  });

  it('moves a case and keeps the steps inside it', () => {
    const next = outcome(node, { t: 'branch.move', id: firstId, to: 1 });
    expect(next.branches?.map((row) => row.id)).toEqual([secondId, firstId]);
    expect(next.branches?.[1]?.scope.nodes).toHaveLength(1);
    expect(reason(node, { t: 'branch.move', id: firstId, to: 5 })).toMatch(/cannot move/);
  });

  it('removes a case but never the last one', () => {
    const one = outcome(node, { t: 'branch.remove', id: secondId });
    expect(one.branches?.map((row) => row.id)).toEqual([firstId]);
    expect(reason(one, { t: 'branch.remove', id: firstId })).toMatch(/at least one/);
    expect(reason(node, { t: 'branch.remove', id: 'missing' })).toMatch(/no such case/);
  });
});

describe('cases of a Switch', () => {
  const ids = new Ids();
  const node: FlowNode = {
    ...ids.next(),
    kind: 'flow.switch',
    ports: { subject: { lit: 'a' } },
    cases: [{ id: ids.next().id, match: { eq: 'a' }, scope: scope([]) }],
  };
  const caseId = node.cases?.[0]?.id ?? '';

  it('adds, changes and removes a case', () => {
    const added = outcome(node, { t: 'case.add', id: ids.next().id, match: { in: ['b', 'c'] } });
    expect(added.cases?.map((row) => row.match)).toEqual([{ eq: 'a' }, { in: ['b', 'c'] }]);
    const changed = outcome(added, {
      t: 'case.match',
      id: caseId,
      match: { range: { min: 1, max: 2 } },
    });
    expect(changed.cases?.[0]?.match).toEqual({ range: { min: 1, max: 2 } });
    expect(valid(changed)).toBe(true);
    const removed = outcome(changed, { t: 'case.remove', id: caseId });
    expect(removed.cases).toHaveLength(1);
  });

  it('allows a Switch with no cases and reorders the rest', () => {
    const empty = outcome(node, { t: 'case.remove', id: caseId });
    expect(empty.cases).toEqual([]);
    const two = outcome(node, { t: 'case.add', id: ids.next().id, match: { eq: 'z' } });
    const moved = outcome(two, { t: 'case.move', id: caseId, to: 1 });
    expect(moved.cases?.map((row) => row.match)).toEqual([{ eq: 'z' }, { eq: 'a' }]);
    expect(reason(node, { t: 'case.remove', id: 'missing' })).toMatch(/no such case/);
  });
});

describe('catch rows of a Try', () => {
  const ids = new Ids();
  const node: FlowNode = {
    ...ids.next(),
    kind: 'flow.try',
    scopes: { try: scope([setLight(ids, null)]) },
  };
  const rowId = ids.next().id;

  it('adds a catch that handles every failure, then limits it to some kinds', () => {
    const added = outcome(node, { t: 'catch.add', id: rowId });
    expect(added.catches).toEqual([{ id: rowId, scope: { nodes: [] } }]);
    const limited = outcome(added, {
      t: 'catch.classes',
      id: rowId,
      classes: ['Timeout', 'Unreachable'],
    });
    expect(limited.catches?.[0]?.classes).toEqual(['Timeout', 'Unreachable']);
    expect(valid(limited)).toBe(true);
    const all = outcome(limited, { t: 'catch.classes', id: rowId, classes: [] });
    expect(all.catches?.[0]).toEqual({ id: rowId, scope: { nodes: [] } });
  });

  it('removes the last catch row and leaves no empty list behind', () => {
    const added = outcome(node, { t: 'catch.add', id: rowId });
    const removed = outcome(added, { t: 'catch.remove', id: rowId });
    expect(removed.catches).toBeUndefined();
    expect(valid(removed)).toBe(true);
    expect(reason(node, { t: 'catch.remove', id: rowId })).toMatch(/no such catch/);
  });
});

describe('named lanes', () => {
  const ids = new Ids();
  const node: FlowNode = {
    ...ids.next(),
    kind: 'flow.parallel',
    scopes: { branch1: scope([]), branch2: scope([setLight(ids, null)]) },
  };
  const parallel = rowLimitsOf(NODE_REGISTRY.get('flow.parallel') ?? {});

  it('reads the least number of lanes from the kind', () => {
    expect(parallel).toEqual({ minimumScopes: 2 });
    expect(rowLimitsOf(NODE_REGISTRY.get('flow.if') ?? {})).toEqual({ minimumScopes: 0 });
  });

  it('adds a lane, renames it and keeps its steps', () => {
    const added = outcome(node, { t: 'scope.add', name: 'branch3' }, parallel);
    expect(Object.keys(added.scopes ?? {})).toEqual(['branch1', 'branch2', 'branch3']);
    const renamed = outcome(added, { t: 'scope.rename', from: 'branch2', to: 'lights' }, parallel);
    expect(Object.keys(renamed.scopes ?? {})).toEqual(['branch1', 'lights', 'branch3']);
    expect(renamed.scopes?.['lights']?.nodes).toHaveLength(1);
    expect(valid(renamed)).toBe(true);
  });

  it('refuses a duplicate name, a bad name and a lane below the minimum', () => {
    expect(reason(node, { t: 'scope.add', name: 'branch1' }, parallel)).toMatch(/exists/);
    expect(reason(node, { t: 'scope.add', name: '1 bad' }, parallel)).toMatch(/not a valid/);
    expect(reason(node, { t: 'scope.rename', from: 'branch1', to: 'branch2' }, parallel)).toMatch(
      /exists/,
    );
    expect(reason(node, { t: 'scope.remove', name: 'branch1' }, parallel)).toMatch(/at least 2/);
    expect(reason(node, { t: 'scope.remove', name: 'gone' }, parallel)).toMatch(/no such/);
  });

  it('removes an optional lane when the kind has no minimum', () => {
    const withElse: FlowNode = { ...ifOf(ids), scopes: { else: scope([]) } };
    const without = outcome(withElse, { t: 'scope.remove', name: 'else' });
    expect(without.scopes).toEqual({});
  });
});

describe('applyRowEdits', () => {
  const ids = new Ids();
  const node = ifOf(ids);

  it('applies several edits in order', () => {
    const result = applyRowEdits(
      node,
      [
        { t: 'branch.add', id: ids.next().id },
        { t: 'branch.add', id: ids.next().id },
      ],
      LIMITS,
    );
    expect(result.ok && result.node.branches?.length).toBe(4);
  });

  it('stops at the first edit that is refused and names why', () => {
    const result = applyRowEdits(
      node,
      [
        { t: 'branch.remove', id: 'missing' },
        { t: 'branch.add', id: ids.next().id },
      ],
      LIMITS,
    );
    expect(result).toEqual({ ok: false, reason: 'There is no such case.' });
  });

  it('leaves the rules of each kind to the program check', () => {
    const result = applyRowEdit(
      node,
      { t: 'case.add', id: ids.next().id, match: { eq: 1 } },
      LIMITS,
    );
    expect(result.ok).toBe(true);
    expect(valid(result.ok ? result.node : node)).toBe(false);
  });
});
