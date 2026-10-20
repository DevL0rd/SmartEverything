import type { FlowNode } from '@smarteverything/domain';
import { indexProgram, resolveScope } from '../program/lookup';
import type { ScopePath } from '../program/paths';
import { formatScopePath } from '../program/paths';
import type { Program } from '../program/walk';
import { refuse } from './result';

export function editScope<P extends Program>(
  program: P,
  path: ScopePath,
  edit: (nodes: readonly FlowNode[]) => readonly FlowNode[],
): P {
  const clone = structuredClone(program);
  const scope = resolveScope(indexProgram(clone), path);
  if (scope === undefined) refuse('unsupported', `there is no scope ${formatScopePath(path)}`);
  scope.nodes.splice(0, scope.nodes.length, ...edit(scope.nodes));
  return clone;
}
