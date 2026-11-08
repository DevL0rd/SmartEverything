import type { FlowNode, InputPort, NodeKind, PortValue } from '@smarteverything/domain';
import { outputLabel } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { controlOf, type FieldControl } from '../schema-fields';

export const RUN_AUTOMATION_KIND = 'automation.run';

export interface CalledAutomation {
  readonly name: string;
  readonly enabled: boolean;
  readonly inputs: readonly InputPort[];
}

export type CalledLookup = (id: string) => CalledAutomation | undefined;

export interface CalledInputRow {
  readonly port: InputPort;
  readonly title: string;
  readonly control: FieldControl;
  readonly required: boolean;
  readonly value: PortValue | undefined;
}

export type CalledInputsModel =
  | { readonly kind: 'none' }
  | { readonly kind: 'missing'; readonly reason: string }
  | {
      readonly kind: 'ready';
      readonly name: string;
      readonly off: string | null;
      readonly rows: readonly CalledInputRow[];
      readonly leftover: readonly string[];
    };

export const REMOVED_REASON =
  'The automation this step runs was removed. Pick another one to fill in its inputs.';

export const NO_INPUTS = 'It asks for no inputs.';

export function offNote(name: string): string {
  return `${name} is off, so this step cannot start it until it is turned on.`;
}

export function leftoverNote(name: string): string {
  return `${name} has no input with this name, so the run would be refused.`;
}

export function calledIdOf(node: FlowNode): string | undefined {
  const port = node.ports?.['automation'];
  return port !== undefined && 'lit' in port && typeof port.lit === 'string' && port.lit !== ''
    ? port.lit
    : undefined;
}

function rowOf(port: InputPort, node: FlowNode): CalledInputRow {
  return {
    port,
    title: port.label ?? outputLabel(port.name),
    control: controlOf(port.type),
    required: port.required && port.default === undefined,
    value: node.ports?.[port.name],
  };
}

function leftoverOf(kind: NodeKind, node: FlowNode, inputs: readonly InputPort[]): string[] {
  const known = new Set([...kind.inputs, ...inputs].map((port) => port.name));
  return Object.keys(node.ports ?? {}).filter((name) => !known.has(name));
}

export function calledInputsModel(
  kind: NodeKind,
  node: FlowNode,
  lookup: CalledLookup,
): CalledInputsModel {
  const id = calledIdOf(node);
  if (id === undefined) return { kind: 'none' };
  const called = lookup(id);
  if (called === undefined) return { kind: 'missing', reason: REMOVED_REASON };
  return {
    kind: 'ready',
    name: called.name,
    off: called.enabled ? null : offNote(called.name),
    rows: called.inputs.map((port) => rowOf(port, node)),
    leftover: leftoverOf(kind, node, called.inputs),
  };
}

export function hasCalledInputs(kind: NodeKind | undefined): boolean {
  return kind?.id === RUN_AUTOMATION_KIND;
}

export function clearLeftoverOps(key: string, names: readonly string[]): readonly PatchOp[] {
  return names.length === 0 ? [] : [{ op: 'unset', key, ports: [...names] }];
}
