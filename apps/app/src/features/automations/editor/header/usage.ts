import type { AutomationV3, FlowNode } from '@smarteverything/domain';
import { referencesIn, sitesOf } from '@smarteverything/flow/ops/refs';
import { walkProgram } from '@smarteverything/flow/program/walk';

const VARIABLE_KINDS: ReadonlySet<string> = new Set([
  'var.set',
  'var.get',
  'var.add',
  'var.append',
  'var.remove',
]);

function readsRoot(program: AutomationV3, root: string, name: string): boolean {
  return sitesOf(program).some((site) =>
    referencesIn(site.value).some(
      (reference) => reference.from === root && reference.port === name,
    ),
  );
}

function namedByNode(node: FlowNode, name: string): boolean {
  const value = node.ports?.['name'];
  return (
    VARIABLE_KINDS.has(node.kind) && value !== undefined && 'lit' in value && value.lit === name
  );
}

export function variableInUse(program: AutomationV3, name: string): boolean {
  return (
    readsRoot(program, 'vars', name) ||
    walkProgram(program).some(({ node }) => namedByNode(node, name))
  );
}

export function inputInUse(program: AutomationV3, name: string): boolean {
  return readsRoot(program, 'inputs', name);
}

export function outputInUse(program: AutomationV3, name: string): boolean {
  return walkProgram(program).some(
    ({ node }) => node.kind === 'flow.return' && node.ports?.[name] !== undefined,
  );
}

export function renameBlocked(kind: string, name: string): string {
  return `"${name}" is still used in this automation. Change those places first, then rename the ${kind}.`;
}
