import type { Branch, CatchRow, FlowNode, Scope, SwitchCase } from '@smarteverything/domain';
import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { fillBranch, fillCase, fillCatch, takenOf, type Taken } from './fill';
import { guardFreeKeys } from './guard';
import { detachAll, restoreOps } from './remove';
import type { Detachment, OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, RowEdit, RowOp } from './schema';
import { entryOf } from './target';
import { subtreeKeys } from './util';

type BranchEdit = Extract<RowEdit, { row: 'branch' }>;
type CaseEdit = Extract<RowEdit, { row: 'case' }>;
type CatchEdit = Extract<RowEdit, { row: 'catch' }>;

interface Held {
  readonly id: string;
  readonly scope: Scope;
}

interface Ctx {
  readonly next: Program;
  readonly node: FlowNode;
  readonly taken: Taken;
  readonly env: OpEnv;
  readonly cascade: boolean;
  readonly detached: Detachment[];
}

function rowOp(ctx: Ctx, edit: RowEdit): PatchOp {
  return { op: 'row', key: ctx.node.key, edit };
}

function locate<T extends Held>(ctx: Ctx, list: readonly T[], id: string): { row: T; at: number } {
  const at = list.findIndex((candidate) => candidate.id === id);
  const row = list[at];
  if (row === undefined) return refuse('unknown_key', `"${ctx.node.key}" has no row ${id}`);
  return { row, at };
}

function rowKeys(scope: Scope): readonly string[] {
  return scope.nodes.flatMap((child) => [child.key, ...subtreeKeys(child)]);
}

function insertRow<T extends Held>(ctx: Ctx, list: T[], row: T, index: number | undefined): void {
  const at = index ?? list.length;
  if (at > list.length) {
    refuse('bad_placement', `index ${String(at)} is past the end (${String(list.length)})`);
  }
  guardFreeKeys(ctx.next, rowKeys(row.scope));
  list.splice(at, 0, row);
}

function removeRow<T extends Held>(
  ctx: Ctx,
  list: T[],
  id: string,
): { row: T; at: number; restore: readonly PatchOp[] } {
  const { row, at } = locate(ctx, list, id);
  const detached = detachAll(ctx.next, new Set(rowKeys(row.scope)), ctx.cascade);
  list.splice(at, 1);
  ctx.detached.push(...detached);
  return { row, at, restore: restoreOps(detached) };
}

function moveRow(ctx: Ctx, list: Held[], id: string, to: number): number {
  const { row, at } = locate(ctx, list, id);
  if (to >= list.length) {
    refuse('bad_placement', `position ${String(to)} is past the end (${String(list.length)})`);
  }
  list.splice(at, 1);
  list.splice(to, 0, row);
  return at;
}

function branchEdit(ctx: Ctx, edit: BranchEdit): readonly PatchOp[] {
  const list: Branch[] = ctx.node.branches ?? [];
  switch (edit.t) {
    case 'add': {
      const input = { id: edit.id, when: edit.when, scope: edit.scope ?? { nodes: [] } };
      const row = fillBranch(input, ctx.taken, ctx.env);
      insertRow(ctx, list, row, edit.index);
      return [rowOp(ctx, { row: 'branch', t: 'remove', id: row.id })];
    }
    case 'remove': {
      if (list.length === 1) refuse('not_allowed', 'a node keeps at least one branch');
      const { row, at, restore } = removeRow(ctx, list, edit.id);
      const add: RowEdit = {
        row: 'branch',
        t: 'add',
        id: row.id,
        when: row.when,
        scope: row.scope,
        index: at,
      };
      return [rowOp(ctx, add), ...restore];
    }
    case 'move':
      return [
        rowOp(ctx, {
          row: 'branch',
          t: 'move',
          id: edit.id,
          to: moveRow(ctx, list, edit.id, edit.to),
        }),
      ];
    case 'when': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.when;
      row.when = edit.when;
      return [rowOp(ctx, { row: 'branch', t: 'when', id: edit.id, when: before })];
    }
  }
}

function caseEdit(ctx: Ctx, edit: CaseEdit): readonly PatchOp[] {
  const list: SwitchCase[] = ctx.node.cases ?? [];
  switch (edit.t) {
    case 'add': {
      const input = { id: edit.id, match: edit.match, scope: edit.scope ?? { nodes: [] } };
      const row = fillCase(input, ctx.taken, ctx.env);
      insertRow(ctx, list, row, edit.index);
      return [rowOp(ctx, { row: 'case', t: 'remove', id: row.id })];
    }
    case 'remove': {
      const { row, at, restore } = removeRow(ctx, list, edit.id);
      const add: RowEdit = {
        row: 'case',
        t: 'add',
        id: row.id,
        match: row.match,
        scope: row.scope,
        index: at,
      };
      return [rowOp(ctx, add), ...restore];
    }
    case 'move':
      return [
        rowOp(ctx, {
          row: 'case',
          t: 'move',
          id: edit.id,
          to: moveRow(ctx, list, edit.id, edit.to),
        }),
      ];
    case 'match': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.match;
      row.match = edit.match;
      return [rowOp(ctx, { row: 'case', t: 'match', id: edit.id, match: before })];
    }
  }
}

function catchEdit(ctx: Ctx, edit: CatchEdit): readonly PatchOp[] {
  const list: CatchRow[] = ctx.node.catches ?? [];
  switch (edit.t) {
    case 'add': {
      const input = { id: edit.id, classes: edit.classes, scope: edit.scope ?? { nodes: [] } };
      const row = fillCatch(input, ctx.taken, ctx.env);
      insertRow(ctx, list, row, edit.index);
      return [rowOp(ctx, { row: 'catch', t: 'remove', id: row.id })];
    }
    case 'remove': {
      const { row, at, restore } = removeRow(ctx, list, edit.id);
      const add: RowEdit = {
        row: 'catch',
        t: 'add',
        id: row.id,
        ...(row.classes === undefined ? {} : { classes: row.classes }),
        scope: row.scope,
        index: at,
      };
      return [rowOp(ctx, add), ...restore];
    }
    case 'move':
      return [
        rowOp(ctx, {
          row: 'catch',
          t: 'move',
          id: edit.id,
          to: moveRow(ctx, list, edit.id, edit.to),
        }),
      ];
    case 'classes': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.classes ?? null;
      if (edit.classes === null) Reflect.deleteProperty(row, 'classes');
      else row.classes = [...edit.classes];
      return [rowOp(ctx, { row: 'catch', t: 'classes', id: edit.id, classes: before })];
    }
  }
}

function dropEmptyCatches(node: FlowNode): void {
  if (node.catches?.length === 0) Reflect.deleteProperty(node, 'catches');
}

function inverseOf(ctx: Ctx, edit: RowEdit): readonly PatchOp[] {
  if (edit.row === 'branch') return branchEdit(ctx, edit);
  return edit.row === 'case' ? caseEdit(ctx, edit) : catchEdit(ctx, edit);
}

export function applyRow(program: Program, op: RowOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  if (entry.kind === 'trigger') refuse('not_allowed', 'a trigger has no rows');
  const node = entry.node;
  if (op.edit.row === 'branch') node.branches ??= [];
  else if (op.edit.row === 'case') node.cases ??= [];
  else node.catches ??= [];
  const ctx: Ctx = {
    next,
    node,
    taken: takenOf(next),
    env,
    cascade: op.cascade === true,
    detached: [],
  };
  const inverse = inverseOf(ctx, op.edit);
  dropEmptyCatches(node);
  return outcome(next, inverse, { detached: ctx.detached });
}
