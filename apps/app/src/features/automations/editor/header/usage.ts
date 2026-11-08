import type { GraphNode, ProgramV4, TriggerNode } from '@smarteverything/domain';
import { referencesIn, sitesOf } from '@smarteverything/flow/graph/ops/refs';

const VARIABLE_KINDS: ReadonlySet<string> = new Set([
  'var.set',
  'var.get',
  'var.add',
  'var.append',
  'var.remove',
]);

function readsRoot(program: ProgramV4, root: string, name: string): boolean {
  return sitesOf(program).some((site) =>
    referencesIn(site.value).some(
      (reference) => reference.from === root && reference.port === name,
    ),
  );
}

function holdersOf(program: ProgramV4): readonly (GraphNode | TriggerNode)[] {
  return [...(program.kind === 'automation' ? program.triggers : []), ...program.nodes];
}

function namedByNode(node: GraphNode | TriggerNode, name: string): boolean {
  const value = node.ports?.['name'];
  return (
    VARIABLE_KINDS.has(node.kind) && value !== undefined && 'lit' in value && value.lit === name
  );
}

export function variableInUse(program: ProgramV4, name: string): boolean {
  return (
    readsRoot(program, 'vars', name) || holdersOf(program).some((node) => namedByNode(node, name))
  );
}

export function inputInUse(program: ProgramV4, name: string): boolean {
  return readsRoot(program, 'inputs', name);
}

export function outputInUse(program: ProgramV4, name: string): boolean {
  return program.nodes.some(
    (node) => node.kind === 'flow.return' && node.ports?.[name] !== undefined,
  );
}

export function renameBlocked(kind: string, name: string): string {
  return `"${name}" is still used in this automation. Change those places first, then rename the ${kind}.`;
}
