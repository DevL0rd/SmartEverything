import { describe, expect, it } from 'vitest';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import { Ids, automation, ifNode, scope, setLight, uuid } from '../../model/canvas/canvas-fixtures';
import { SCOPE_EDIT_REFUSED, rowOpsOf } from './row-ops';

function program(): ReturnType<typeof automation> {
  const ids = new Ids();
  return automation([ifNode(ids, [scope([setLight(ids, null)]), scope([])])]);
}

function branchesAfter(edits: Parameters<typeof rowOpsOf>[1]): readonly string[] {
  const start = program();
  const key = start.body.nodes[0]?.key ?? '';
  const ops = rowOpsOf(key, edits);
  if (!ops.ok) throw new Error(ops.reason);
  const result = applyPatch(start, ops.ops);
  if (!result.ok) throw new Error(result.reason);
  return result.program.body.nodes[0]?.branches?.map((branch) => branch.id) ?? [];
}

describe('rowOpsOf', () => {
  it('turns an added case into a row op the reducer applies', () => {
    const added = uuid(90);
    expect(branchesAfter([{ t: 'branch.add', id: added }]).at(-1)).toBe(added);
  });

  it('moves and removes cases through row ops', () => {
    const before = branchesAfter([]);
    const first = before[0] ?? '';
    const second = before[1] ?? '';
    expect(branchesAfter([{ t: 'branch.move', id: second, to: 0 }])).toEqual([second, first]);
    expect(branchesAfter([{ t: 'branch.remove', id: second }])).toEqual([first]);
  });

  it('maps catch classes, sending an empty choice as no classes', () => {
    const ops = rowOpsOf('n1', [{ t: 'catch.classes', id: uuid(5), classes: [] }]);
    expect(ops).toEqual({
      ok: true,
      ops: [
        { op: 'row', key: 'n1', edit: { row: 'catch', t: 'classes', id: uuid(5), classes: null } },
      ],
    });
  });

  it('refuses lane edits with a visible reason', () => {
    expect(rowOpsOf('n1', [{ t: 'scope.add', name: 'other' }])).toEqual({
      ok: false,
      reason: SCOPE_EDIT_REFUSED,
    });
  });
});
