import type {
  CATCHABLE_ERROR_CLASS,
  GraphNode,
  PortValue,
  SwitchMatch,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import type { z } from 'zod';

type CatchableClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export type RowKind = 'branch' | 'case' | 'catch';

export const ROW_OWNERS: Readonly<Record<string, RowKind>> = {
  'flow.if': 'branch',
  'flow.switch': 'case',
  'flow.try': 'catch',
};

export function rowKindOf(node: GraphNode): RowKind | undefined {
  return ROW_OWNERS[node.kind];
}

export function branchTitle(index: number): string {
  return index === 0 ? 'If' : 'Otherwise if';
}

export function caseTitle(index: number): string {
  return `Case ${String(index + 1)}`;
}

export function catchTitle(index: number): string {
  return `Catch ${String(index + 1)}`;
}

export function canRemoveRow(node: GraphNode, kind: RowKind): boolean {
  return kind !== 'branch' || (node.branches?.length ?? 0) > 1;
}

export function addBranchOps(key: string): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: 'branch', t: 'add', when: { lit: true } } }];
}

export function addCaseOps(key: string, match: SwitchMatch): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: 'case', t: 'add', match } }];
}

export function addEachCaseOps(key: string, ids: readonly string[]): readonly PatchOp[] {
  return ids.map((id): PatchOp => ({
    op: 'row',
    key,
    edit: { row: 'case', t: 'add', match: { eq: id } },
  }));
}

export function addCatchOps(key: string): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: 'catch', t: 'add' } }];
}

export function removeRowOps(key: string, kind: RowKind, id: string): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: kind, t: 'remove', id } }];
}

export function moveRowOps(key: string, kind: RowKind, id: string, at: number): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: kind, t: 'move', id, at } }];
}

export function whenOps(key: string, id: string, when: PortValue): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: 'branch', t: 'when', id, when } }];
}

export function rowNameOps(
  key: string,
  kind: 'branch' | 'case',
  id: string,
  text: string,
): readonly PatchOp[] {
  const name = text.trim();
  return [{ op: 'row', key, edit: { row: kind, t: 'name', id, name: name === '' ? null : name } }];
}

export function matchOps(key: string, id: string, match: SwitchMatch): readonly PatchOp[] {
  return [{ op: 'row', key, edit: { row: 'case', t: 'match', id, match } }];
}

export function classesOps(
  key: string,
  id: string,
  classes: readonly CatchableClass[],
): readonly PatchOp[] {
  const next = classes.length === 0 ? null : [...classes];
  return [{ op: 'row', key, edit: { row: 'catch', t: 'classes', id, classes: next } }];
}

export function runsEveryCase(node: GraphNode): boolean {
  const mode = node.ports?.['mode'];
  return mode !== undefined && 'lit' in mode && mode.lit === 'all';
}

export function everyCaseOps(key: string, on: boolean): readonly PatchOp[] {
  return on
    ? [{ op: 'set', key, ports: { mode: { lit: 'all' } } }]
    : [{ op: 'unset', key, ports: ['mode'] }];
}

export function canFailAgain(node: GraphNode, rowId: string): boolean {
  return node.catches?.find((row) => row.id === rowId)?.to === undefined;
}

export function failAgainOps(tryKey: string, rowId: string): readonly PatchOp[] {
  return [
    {
      op: 'add',
      node: { kind: 'flow.fail', ports: { cause: { wire: { from: tryKey, port: 'error' } } } },
      after: { key: tryKey, port: `catch:${rowId}` },
    },
  ];
}
