import { indexProgram } from '../program/lookup';
import { usedKeys } from '../program/keys';
import { keyAvailable } from '../program/keys';
import type { Program } from '../program/walk';
import { countRoot, renameRoot, sitesOf } from './refs';
import type { Outcome } from './result';
import { outcome, refuse } from './result';
import type { RenameOp } from './schema';
import { entryOf } from './target';

export function applyRename(program: Program, op: RenameOp): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  const problem = keyAvailable(op.to, usedKeys(next));
  if (problem !== undefined) refuse('key_taken', problem);
  const sites = sitesOf(next);
  if (sites.some((site) => countRoot(site.value, op.to) > 0)) {
    refuse('referenced', `a wire already reads "${op.to}", which would then change meaning`);
  }
  for (const site of sites) {
    const renamed = renameRoot(site.value, op.key, op.to);
    if (renamed.count > 0) site.assign(renamed.value);
  }
  entry.node.key = op.to;
  return outcome(next, [{ op: 'rename', key: op.to, to: op.key }]);
}
