import type { FlowNode, PortValue, Scope, SwitchMatch } from '@smarteverything/domain';
import { SCOPE_NAME } from '@smarteverything/domain';
import type { CATCHABLE_ERROR_CLASS } from '@smarteverything/domain';
import type { z } from 'zod';

type CatchableClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export type RowEdit =
  | { readonly t: 'branch.add'; readonly id: string }
  | { readonly t: 'branch.remove'; readonly id: string }
  | { readonly t: 'branch.move'; readonly id: string; readonly to: number }
  | { readonly t: 'branch.when'; readonly id: string; readonly when: PortValue }
  | { readonly t: 'case.add'; readonly id: string; readonly match: SwitchMatch }
  | { readonly t: 'case.remove'; readonly id: string }
  | { readonly t: 'case.move'; readonly id: string; readonly to: number }
  | { readonly t: 'case.match'; readonly id: string; readonly match: SwitchMatch }
  | { readonly t: 'catch.add'; readonly id: string }
  | { readonly t: 'catch.remove'; readonly id: string }
  | {
      readonly t: 'catch.classes';
      readonly id: string;
      readonly classes: readonly CatchableClass[];
    }
  | { readonly t: 'scope.add'; readonly name: string }
  | { readonly t: 'scope.rename'; readonly from: string; readonly to: string }
  | { readonly t: 'scope.remove'; readonly name: string };

export type RowResult =
  { readonly ok: true; readonly node: FlowNode } | { readonly ok: false; readonly reason: string };

export interface RowLimits {
  readonly minimumScopes: number;
}

const EMPTY_SCOPE = (): Scope => ({ nodes: [] });

function failure(reason: string): RowResult {
  return { ok: false, reason };
}

function success(node: FlowNode): RowResult {
  return { ok: true, node };
}

function moved<T extends { readonly id: string }>(
  rows: readonly T[],
  id: string,
  to: number,
): readonly T[] | undefined {
  const from = rows.findIndex((row) => row.id === id);
  const row = rows[from];
  if (row === undefined || to < 0 || to >= rows.length) return undefined;
  const rest = rows.filter((candidate) => candidate.id !== id);
  return [...rest.slice(0, to), row, ...rest.slice(to)];
}

function without<T extends { readonly id: string }>(
  rows: readonly T[],
  id: string,
): readonly T[] | undefined {
  return rows.some((row) => row.id === id) ? rows.filter((row) => row.id !== id) : undefined;
}

function branchesEdit(node: FlowNode, edit: RowEdit): RowResult | undefined {
  const rows = node.branches ?? [];
  if (edit.t === 'branch.add') {
    const added = { id: edit.id, when: { lit: true }, scope: EMPTY_SCOPE() };
    return success({ ...node, branches: [...rows, added] });
  }
  if (edit.t === 'branch.remove') {
    const left = without(rows, edit.id);
    if (left === undefined) return failure('There is no such case.');
    if (left.length === 0) return failure('An If keeps at least one case.');
    return success({ ...node, branches: [...left] });
  }
  if (edit.t === 'branch.move') {
    const next = moved(rows, edit.id, edit.to);
    return next === undefined
      ? failure('That case cannot move there.')
      : success({ ...node, branches: [...next] });
  }
  if (edit.t === 'branch.when') {
    const next = rows.map((row) => (row.id === edit.id ? { ...row, when: edit.when } : row));
    return success({ ...node, branches: next });
  }
  return undefined;
}

function casesEdit(node: FlowNode, edit: RowEdit): RowResult | undefined {
  const rows = node.cases ?? [];
  if (edit.t === 'case.add') {
    return success({
      ...node,
      cases: [...rows, { id: edit.id, match: edit.match, scope: EMPTY_SCOPE() }],
    });
  }
  if (edit.t === 'case.remove') {
    const left = without(rows, edit.id);
    return left === undefined
      ? failure('There is no such case.')
      : success({ ...node, cases: [...left] });
  }
  if (edit.t === 'case.move') {
    const next = moved(rows, edit.id, edit.to);
    return next === undefined
      ? failure('That case cannot move there.')
      : success({ ...node, cases: [...next] });
  }
  if (edit.t === 'case.match') {
    const next = rows.map((row) => (row.id === edit.id ? { ...row, match: edit.match } : row));
    return success({ ...node, cases: next });
  }
  return undefined;
}

function catchesEdit(node: FlowNode, edit: RowEdit): RowResult | undefined {
  const rows = node.catches ?? [];
  if (edit.t === 'catch.add') {
    return success({ ...node, catches: [...rows, { id: edit.id, scope: EMPTY_SCOPE() }] });
  }
  if (edit.t === 'catch.remove') {
    const left = without(rows, edit.id);
    if (left === undefined) return failure('There is no such catch row.');
    return success(left.length === 0 ? withoutCatches(node) : { ...node, catches: [...left] });
  }
  if (edit.t === 'catch.classes') {
    const next = rows.map((row) => {
      if (row.id !== edit.id) return row;
      const { classes: _classes, ...rest } = row;
      return edit.classes.length === 0 ? rest : { ...rest, classes: [...edit.classes] };
    });
    return success({ ...node, catches: next });
  }
  return undefined;
}

function withoutCatches(node: FlowNode): FlowNode {
  const { catches: _catches, ...rest } = node;
  return rest;
}

function scopesEdit(node: FlowNode, edit: RowEdit, limits: RowLimits): RowResult | undefined {
  const scopes = node.scopes ?? {};
  if (edit.t === 'scope.add') {
    if (!SCOPE_NAME.safeParse(edit.name).success)
      return failure('That is not a valid branch name.');
    if (edit.name in scopes) return failure('A branch with that name exists.');
    return success({ ...node, scopes: { ...scopes, [edit.name]: EMPTY_SCOPE() } });
  }
  if (edit.t === 'scope.remove') {
    if (!(edit.name in scopes)) return failure('There is no such branch.');
    if (Object.keys(scopes).length <= limits.minimumScopes) {
      return failure(`Keep at least ${String(limits.minimumScopes)} branches.`);
    }
    return success({
      ...node,
      scopes: Object.fromEntries(Object.entries(scopes).filter(([name]) => name !== edit.name)),
    });
  }
  if (edit.t === 'scope.rename') return renameScope(node, scopes, edit);
  return undefined;
}

function renameScope(
  node: FlowNode,
  scopes: Readonly<Record<string, Scope>>,
  edit: { readonly from: string; readonly to: string },
): RowResult {
  if (!SCOPE_NAME.safeParse(edit.to).success) return failure('That is not a valid branch name.');
  if (edit.to !== edit.from && edit.to in scopes) return failure('A branch with that name exists.');
  const entries = Object.entries(scopes).map(([name, scope]): [string, Scope] => [
    name === edit.from ? edit.to : name,
    scope,
  ]);
  return success({ ...node, scopes: Object.fromEntries(entries) });
}

export function applyRowEdit(node: FlowNode, edit: RowEdit, limits: RowLimits): RowResult {
  return (
    branchesEdit(node, edit) ??
    casesEdit(node, edit) ??
    catchesEdit(node, edit) ??
    scopesEdit(node, edit, limits) ??
    failure('That row change is not supported.')
  );
}

export function applyRowEdits(
  node: FlowNode,
  edits: readonly RowEdit[],
  limits: RowLimits,
): RowResult {
  let current: FlowNode = node;
  for (const edit of edits) {
    const result = applyRowEdit(current, edit, limits);
    if (!result.ok) return result;
    current = result.node;
  }
  return success(current);
}

export function rowLimitsOf(kind: {
  readonly scopes?: { readonly minimum?: number } | undefined;
}): RowLimits {
  return { minimumScopes: kind.scopes?.minimum ?? 0 };
}
