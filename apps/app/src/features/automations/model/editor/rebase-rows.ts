import type { GraphNode } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { deepEqual, sameList } from './deep-equal';

interface IdDiff {
  readonly removed: readonly string[];
  readonly added: readonly { readonly id: string; readonly at: number }[];
  readonly reordered: readonly { readonly id: string; readonly at: number }[];
  readonly kept: readonly string[];
}

function idDiff(was: readonly string[], now: readonly string[]): IdDiff {
  const before = new Set(was);
  const after = new Set(now);
  const kept = now.filter((id) => before.has(id));
  const sameOrder = sameList(
    kept,
    was.filter((id) => after.has(id)),
  );
  return {
    removed: was.filter((id) => !after.has(id)),
    added: now.flatMap((id, at) => (before.has(id) ? [] : [{ id, at }])),
    reordered: sameOrder ? [] : now.flatMap((id, at) => (before.has(id) ? [{ id, at }] : [])),
    kept,
  };
}

function addedRow(row: { readonly id: string; readonly name?: string | undefined }): {
  id: string;
  name?: string;
} {
  return row.name === undefined ? { id: row.id } : { id: row.id, name: row.name };
}

function branchOps(was: GraphNode, now: GraphNode): PatchOp[] {
  const { key } = now;
  const before = was.branches ?? [];
  const after = now.branches ?? [];
  const changes = idDiff(
    before.map((row) => row.id),
    after.map((row) => row.id),
  );
  return [
    ...changes.removed.map((id): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'branch', t: 'remove', id },
    })),
    ...after.flatMap((row, index): PatchOp[] =>
      changes.added.some((item) => item.id === row.id)
        ? [
            {
              op: 'row',
              key,
              edit: { row: 'branch', t: 'add', ...addedRow(row), when: row.when, index },
            },
          ]
        : [],
    ),
    ...after.flatMap((row): PatchOp[] => {
      const old = before.find((item) => item.id === row.id);
      return old !== undefined && !deepEqual(old.when, row.when)
        ? [{ op: 'row', key, edit: { row: 'branch', t: 'when', id: row.id, when: row.when } }]
        : [];
    }),
    ...after.flatMap((row): PatchOp[] => {
      const old = before.find((item) => item.id === row.id);
      return old !== undefined && old.name !== row.name
        ? [
            {
              op: 'row',
              key,
              edit: { row: 'branch', t: 'name', id: row.id, name: row.name ?? null },
            },
          ]
        : [];
    }),
    ...changes.reordered.map(({ id, at }): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'branch', t: 'move', id, at },
    })),
  ];
}

function caseOps(was: GraphNode, now: GraphNode): PatchOp[] {
  const { key } = now;
  const before = was.cases ?? [];
  const after = now.cases ?? [];
  const changes = idDiff(
    before.map((row) => row.id),
    after.map((row) => row.id),
  );
  return [
    ...changes.removed.map((id): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'case', t: 'remove', id },
    })),
    ...after.flatMap((row, index): PatchOp[] =>
      changes.added.some((item) => item.id === row.id)
        ? [
            {
              op: 'row',
              key,
              edit: { row: 'case', t: 'add', ...addedRow(row), match: row.match, index },
            },
          ]
        : [],
    ),
    ...after.flatMap((row): PatchOp[] => {
      const old = before.find((item) => item.id === row.id);
      return old !== undefined && !deepEqual(old.match, row.match)
        ? [{ op: 'row', key, edit: { row: 'case', t: 'match', id: row.id, match: row.match } }]
        : [];
    }),
    ...after.flatMap((row): PatchOp[] => {
      const old = before.find((item) => item.id === row.id);
      return old !== undefined && old.name !== row.name
        ? [{ op: 'row', key, edit: { row: 'case', t: 'name', id: row.id, name: row.name ?? null } }]
        : [];
    }),
    ...changes.reordered.map(({ id, at }): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'case', t: 'move', id, at },
    })),
  ];
}

function catchOps(was: GraphNode, now: GraphNode): PatchOp[] {
  const { key } = now;
  const before = was.catches ?? [];
  const after = now.catches ?? [];
  const changes = idDiff(
    before.map((row) => row.id),
    after.map((row) => row.id),
  );
  return [
    ...changes.removed.map((id): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'catch', t: 'remove', id },
    })),
    ...after.flatMap((row, index): PatchOp[] =>
      changes.added.some((item) => item.id === row.id)
        ? [
            {
              op: 'row',
              key,
              edit: {
                row: 'catch',
                t: 'add',
                id: row.id,
                ...(row.classes === undefined ? {} : { classes: row.classes }),
                index,
              },
            },
          ]
        : [],
    ),
    ...after.flatMap((row): PatchOp[] => {
      const old = before.find((item) => item.id === row.id);
      return old !== undefined && !deepEqual(old.classes, row.classes)
        ? [
            {
              op: 'row',
              key,
              edit: { row: 'catch', t: 'classes', id: row.id, classes: row.classes ?? null },
            },
          ]
        : [];
    }),
    ...changes.reordered.map(({ id, at }): PatchOp => ({
      op: 'row',
      key,
      edit: { row: 'catch', t: 'move', id, at },
    })),
  ];
}

function pathOps(was: GraphNode, now: GraphNode): PatchOp[] {
  const { key } = now;
  const before = (was.paths ?? []).map((path) => path.name);
  const after = (now.paths ?? []).map((path) => path.name);
  const changes = idDiff(before, after);
  return [
    ...changes.removed.map((name): PatchOp => ({ op: 'path', key, edit: { t: 'remove', name } })),
    ...changes.added.map(({ id, at }): PatchOp => ({
      op: 'path',
      key,
      edit: { t: 'add', name: id, index: at },
    })),
  ];
}

export function rowChangeOps(was: GraphNode, now: GraphNode): PatchOp[] {
  return [
    ...branchOps(was, now),
    ...caseOps(was, now),
    ...catchOps(was, now),
    ...pathOps(was, now),
  ];
}
