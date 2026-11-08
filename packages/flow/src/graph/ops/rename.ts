import type { ProgramV4 } from '@smarteverything/domain';
import { keyAvailable } from '../../program/keys';
import { entryOf, takenOf } from './identity';
import { countRoot, renameRoot, sitesOf } from './refs';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { RenameOp } from './schema';
import { setTarget, wiresOf } from './wires';

export function applyRename(program: ProgramV4, op: RenameOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(next, op.key);
  const problem = keyAvailable(op.to, takenOf(next).keys);
  if (problem !== undefined) refuse('key_taken', problem);
  const sites = sitesOf(next);
  if (sites.some((site) => countRoot(site.value, op.to) > 0)) {
    refuse('referenced', `a wire already reads "${op.to}", which would then change meaning`);
  }
  for (const site of sites) {
    const renamed = renameRoot(site.value, op.key, op.to);
    if (renamed.count > 0) site.assign(renamed.value);
  }
  for (const wire of wiresOf(next, env.kinds)) {
    const holder = next.nodes.find((node) => node.key === wire.from);
    if (wire.to === op.key && holder !== undefined) setTarget(holder, wire.port, op.to);
  }
  entry.node.key = op.to;
  return outcome(next, [{ op: 'rename', key: op.to, to: op.key }]);
}
