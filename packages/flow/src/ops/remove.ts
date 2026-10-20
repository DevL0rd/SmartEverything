import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { describeReader } from './guard';
import { readersOf } from './refs';
import type { Detachment, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, RemoveOp, SetOp } from './schema';
import { entryOf, locationOf, resolveTarget } from './target';
import { subtreeKeys } from './util';

export function detachAll(
  program: Program,
  doomed: ReadonlySet<string>,
  cascade: boolean,
): readonly Detachment[] {
  const outside = readersOf(program, doomed).filter(
    ({ site }) => site.owner === undefined || !doomed.has(site.owner),
  );
  const first = outside[0];
  if (first === undefined) return [];
  if (!cascade) {
    refuse('referenced', `${describeReader(first.site, first.reads)}; detach it or use cascade`);
  }
  return outside.map(({ site, reads }): Detachment => {
    if (site.detach === undefined || site.owner === undefined || site.slot.kind !== 'port') {
      return refuse('referenced', `${describeReader(site, reads)}, which cannot be detached`);
    }
    site.detach();
    return { owner: site.owner, where: 'port', port: site.slot.name, value: site.value, reads };
  });
}

export function restoreOps(detached: readonly Detachment[]): readonly PatchOp[] {
  const owners = new Map<string, SetOp>();
  for (const item of detached) {
    const restore: SetOp = owners.get(item.owner) ?? { op: 'set', key: item.owner };
    restore.ports = { ...restore.ports, [item.port]: item.value };
    owners.set(item.owner, restore);
  }
  return [...owners.values()];
}

export function applyRemove(program: Program, op: RemoveOp): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  const doomed = new Set([op.key, ...(entry.kind === 'node' ? subtreeKeys(entry.node) : [])]);
  const detached = detachAll(next, doomed, op.cascade === true);
  const where = locationOf(entry);
  const target = resolveTarget(next, where.target);
  target.list.splice(where.index, 1);
  return outcome(
    next,
    [
      { op: 'add', node: entry.node, in: where.target, index: where.index },
      ...restoreOps(detached),
    ],
    { detached },
  );
}
