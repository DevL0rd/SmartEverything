import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import type { Outcome } from './result';
import { outcome, refuse } from './result';
import type { MoveOp } from './schema';
import type { Placement } from './target';
import { entryOf, insertionIndex, locationOf, resolveTarget, scopeNodes } from './target';
import { subtreeKeys } from './util';

function relocate<T extends { readonly key: string }>(
  from: T[],
  at: number,
  to: T[],
  place: Placement,
): void {
  const taken = from.splice(at, 1);
  to.splice(insertionIndex(to, place), 0, ...taken);
}

export function applyMove(program: Program, op: MoveOp): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  const from = locationOf(entry);
  const target = resolveTarget(next, op.in);
  const inverse = [{ op: 'move' as const, key: op.key, in: from.target, index: from.index }];
  if (entry.kind === 'trigger') {
    if (target.t !== 'triggers')
      refuse('not_allowed', 'a trigger can only move within the triggers');
    relocate(target.list, entry.index, target.list, op);
    return outcome(next, inverse);
  }
  if (target.t !== 'scope') refuse('not_allowed', 'a node cannot move into the triggers');
  const inside = new Set([entry.node.key, ...subtreeKeys(entry.node)]);
  if (target.path.t === 'child' && inside.has(target.path.key)) {
    refuse('not_allowed', `"${op.key}" cannot move into itself`);
  }
  relocate(scopeNodes(next, entry.scope), entry.index, target.list, op);
  return outcome(next, inverse);
}
