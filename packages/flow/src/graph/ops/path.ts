import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { nodeOf } from './identity';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, PathEdit, PathOp } from './schema';
import { change } from './util';
import { joinOfFork } from './wires';

const FORK = 'flow.parallel';

function locate(
  node: GraphNode,
  name: string,
): { at: number; row: NonNullable<GraphNode['paths']>[number] } {
  const at = (node.paths ?? []).findIndex((candidate) => candidate.name === name);
  const row = node.paths?.[at];
  if (row === undefined) return refuse('unknown_key', `"${node.key}" has no path "${name}"`);
  return { at, row };
}

function addPath(
  next: ProgramV4,
  node: GraphNode,
  edit: Extract<PathEdit, { t: 'add' }>,
  env: OpEnv,
): readonly PatchOp[] {
  const paths = node.paths ?? [];
  change(node, { paths });
  if (paths.some((path) => path.name === edit.name)) {
    refuse('key_taken', `"${node.key}" already has a path "${edit.name}"`);
  }
  const index = edit.index ?? paths.length;
  if (index > paths.length) {
    refuse('bad_placement', `index ${String(index)} is past the end (${String(paths.length)})`);
  }
  const to = edit.to ?? joinOfFork(next, node.key, env.kinds);
  paths.splice(index, 0, to === undefined ? { name: edit.name } : { name: edit.name, to });
  return [{ op: 'path', key: node.key, edit: { t: 'remove', name: edit.name } }];
}

function renamePath(node: GraphNode, edit: Extract<PathEdit, { t: 'rename' }>): readonly PatchOp[] {
  const { row } = locate(node, edit.name);
  if (edit.as !== edit.name && node.paths?.some((path) => path.name === edit.as) === true) {
    refuse('key_taken', `"${node.key}" already has a path "${edit.as}"`);
  }
  row.name = edit.as;
  return [{ op: 'path', key: node.key, edit: { t: 'rename', name: edit.as, as: edit.name } }];
}

function removePath(node: GraphNode, edit: Extract<PathEdit, { t: 'remove' }>): readonly PatchOp[] {
  const { at, row } = locate(node, edit.name);
  node.paths?.splice(at, 1);
  const to = row.to === undefined ? {} : { to: row.to };
  return [{ op: 'path', key: node.key, edit: { t: 'add', name: row.name, ...to, index: at } }];
}

export function applyPath(program: ProgramV4, op: PathOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const node = nodeOf(next, op.key);
  if (node.kind !== FORK)
    refuse('not_allowed', `paths belong to ${FORK}, and "${op.key}" is ${node.kind}`);
  switch (op.edit.t) {
    case 'add':
      return outcome(next, addPath(next, node, op.edit, env));
    case 'rename':
      return outcome(next, renamePath(node, op.edit));
    case 'remove':
      return outcome(next, removePath(node, op.edit));
  }
}
