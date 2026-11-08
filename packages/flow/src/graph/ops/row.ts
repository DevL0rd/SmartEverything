import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { claimId, nodeOf, takenOf, type Taken } from './identity';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, RowEdit, RowOp } from './schema';
import { change, compact } from './util';

type BranchEdit = Extract<RowEdit, { row: 'branch' }>;
type CaseEdit = Extract<RowEdit, { row: 'case' }>;
type CatchEdit = Extract<RowEdit, { row: 'catch' }>;

interface Held {
  readonly id: string;
  to?: string | undefined;
}

interface Named {
  name?: string | undefined;
}

interface Ctx {
  readonly node: GraphNode;
  readonly taken: Taken;
  readonly env: OpEnv;
}

const OWNERS: Readonly<Record<RowEdit['row'], string>> = {
  branch: 'flow.if',
  case: 'flow.switch',
  catch: 'flow.try',
};

function listOf<K extends 'branches' | 'cases' | 'catches'>(
  node: GraphNode,
  part: K,
): NonNullable<GraphNode[K]> {
  const list = node[part] ?? [];
  change(node, { [part]: list });
  return list;
}

function rowOp(ctx: Ctx, edit: RowEdit): PatchOp {
  return { op: 'row', key: ctx.node.key, edit };
}

function withTo(row: Held): { to?: string } {
  return row.to === undefined ? {} : { to: row.to };
}

function withName(row: Named): { name?: string } {
  return row.name === undefined ? {} : { name: row.name };
}

function locate<T extends Held>(ctx: Ctx, list: readonly T[], id: string): { row: T; at: number } {
  const at = list.findIndex((candidate) => candidate.id === id);
  const row = list[at];
  if (row === undefined) return refuse('unknown_key', `"${ctx.node.key}" has no row ${id}`);
  return { row, at };
}

function insertAt<T>(list: T[], row: T, index: number | undefined): void {
  const at = index ?? list.length;
  if (at > list.length) {
    refuse('bad_placement', `index ${String(at)} is past the end (${String(list.length)})`);
  }
  list.splice(at, 0, row);
}

function takeRow<T extends Held>(ctx: Ctx, list: T[], id: string): { row: T; at: number } {
  const found = locate(ctx, list, id);
  list.splice(found.at, 1);
  return found;
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
  const list = listOf(ctx.node, 'branches');
  switch (edit.t) {
    case 'add': {
      const id = claimId(ctx.taken, edit.id, ctx.env);
      insertAt(list, compact({ id, when: edit.when, name: edit.name, to: edit.to }), edit.index);
      return [rowOp(ctx, { row: 'branch', t: 'remove', id })];
    }
    case 'remove': {
      if (list.length === 1) refuse('not_allowed', 'a node keeps at least one branch');
      const { row, at } = takeRow(ctx, list, edit.id);
      const add: RowEdit = {
        row: 'branch',
        t: 'add',
        id: row.id,
        when: row.when,
        ...withName(row),
        ...withTo(row),
        index: at,
      };
      return [rowOp(ctx, add)];
    }
    case 'move': {
      const at = moveRow(ctx, list, edit.id, edit.at);
      return [rowOp(ctx, { row: 'branch', t: 'move', id: edit.id, at })];
    }
    case 'when': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.when;
      row.when = edit.when;
      return [rowOp(ctx, { row: 'branch', t: 'when', id: edit.id, when: before })];
    }
    case 'name': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.name ?? null;
      if (edit.name === null) Reflect.deleteProperty(row, 'name');
      else row.name = edit.name;
      return [rowOp(ctx, { row: 'branch', t: 'name', id: edit.id, name: before })];
    }
  }
}

function caseEdit(ctx: Ctx, edit: CaseEdit): readonly PatchOp[] {
  const list = listOf(ctx.node, 'cases');
  switch (edit.t) {
    case 'add': {
      const id = claimId(ctx.taken, edit.id, ctx.env);
      insertAt(list, compact({ id, match: edit.match, name: edit.name, to: edit.to }), edit.index);
      return [rowOp(ctx, { row: 'case', t: 'remove', id })];
    }
    case 'remove': {
      const { row, at } = takeRow(ctx, list, edit.id);
      const add: RowEdit = {
        row: 'case',
        t: 'add',
        id: row.id,
        match: row.match,
        ...withName(row),
        ...withTo(row),
        index: at,
      };
      return [rowOp(ctx, add)];
    }
    case 'move': {
      const at = moveRow(ctx, list, edit.id, edit.at);
      return [rowOp(ctx, { row: 'case', t: 'move', id: edit.id, at })];
    }
    case 'match': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.match;
      row.match = edit.match;
      return [rowOp(ctx, { row: 'case', t: 'match', id: edit.id, match: before })];
    }
    case 'name': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.name ?? null;
      if (edit.name === null) Reflect.deleteProperty(row, 'name');
      else row.name = edit.name;
      return [rowOp(ctx, { row: 'case', t: 'name', id: edit.id, name: before })];
    }
  }
}

function catchEdit(ctx: Ctx, edit: CatchEdit): readonly PatchOp[] {
  const list = listOf(ctx.node, 'catches');
  switch (edit.t) {
    case 'add': {
      const id = claimId(ctx.taken, edit.id, ctx.env);
      insertAt(list, compact({ id, classes: edit.classes, to: edit.to }), edit.index);
      return [rowOp(ctx, { row: 'catch', t: 'remove', id })];
    }
    case 'remove': {
      const { row, at } = takeRow(ctx, list, edit.id);
      const classes = row.classes === undefined ? {} : { classes: row.classes };
      const add: RowEdit = {
        row: 'catch',
        t: 'add',
        id: row.id,
        ...classes,
        ...withTo(row),
        index: at,
      };
      return [rowOp(ctx, add)];
    }
    case 'move': {
      const at = moveRow(ctx, list, edit.id, edit.at);
      return [rowOp(ctx, { row: 'catch', t: 'move', id: edit.id, at })];
    }
    case 'classes': {
      const { row } = locate(ctx, list, edit.id);
      const before = row.classes ?? null;
      if (edit.classes === null) Reflect.deleteProperty(row, 'classes');
      else row.classes = [...edit.classes];
      return [rowOp(ctx, { row: 'catch', t: 'classes', id: edit.id, classes: before })];
    }
  }
}

function inverseOf(ctx: Ctx, edit: RowEdit): readonly PatchOp[] {
  if (edit.row === 'branch') return branchEdit(ctx, edit);
  return edit.row === 'case' ? caseEdit(ctx, edit) : catchEdit(ctx, edit);
}

export function applyRow(program: ProgramV4, op: RowOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const node = nodeOf(next, op.key);
  const owner = OWNERS[op.edit.row];
  if (node.kind !== owner) {
    refuse(
      'not_allowed',
      `${op.edit.row} rows belong to ${owner}, and "${op.key}" is ${node.kind}`,
    );
  }
  const inverse = inverseOf({ node, taken: takenOf(next), env }, op.edit);
  if (node.catches?.length === 0) Reflect.deleteProperty(node, 'catches');
  return outcome(next, inverse);
}
