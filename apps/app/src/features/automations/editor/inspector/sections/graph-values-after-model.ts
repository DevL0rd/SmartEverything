import {
  IDENT,
  execPortsOf,
  type FlowType,
  type GraphNode,
  type NodeKindLookup,
  type PortValue,
  type StructuredOutput,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';

export const VALUES_AFTER_KIND_IDS: ReadonlySet<string> = new Set([
  'flow.if',
  'flow.switch',
  'flow.try',
  'flow.parallel',
]);

export interface TypeChoice {
  readonly value: string;
  readonly label: string;
  readonly type: FlowType | undefined;
}

export const VALUE_TYPES: readonly TypeChoice[] = [
  { value: 'any', label: 'Anything', type: undefined },
  { value: 'boolean', label: 'Yes or no', type: { t: 'boolean' } },
  { value: 'number', label: 'Number', type: { t: 'number' } },
  { value: 'text', label: 'Text', type: { t: 'text' } },
  { value: 'duration', label: 'Duration', type: { t: 'duration' } },
];

export interface ValueLane {
  readonly lane: string;
  readonly label: string;
}

const NOT_A_VALUE_LANE: ReadonlySet<string> = new Set(['onError', 'timedOut']);
const ROW_PORT_PREFIXES = ['row:', 'case:', 'catch:'] as const;
const PATH_PREFIX = 'path:';

const AFTER_NAMES: Readonly<Record<string, string>> = {
  'flow.if': 'after the If',
  'flow.switch': 'after the Switch',
  'flow.try': 'after the Try',
  'flow.parallel': 'after the Do together',
};

export function hasValuesAfter(node: GraphNode): boolean {
  return VALUES_AFTER_KIND_IDS.has(node.kind);
}

export function afterName(kindId: string): string {
  return AFTER_NAMES[kindId] ?? 'after this';
}

function isRowPort(port: string): boolean {
  return ROW_PORT_PREFIXES.some((prefix) => port.startsWith(prefix));
}

function laneKeyOf(port: string): string {
  return port.startsWith(PATH_PREFIX) ? port.slice(PATH_PREFIX.length) : port;
}

export function valueLanesOf(node: GraphNode, kinds: NodeKindLookup): readonly ValueLane[] {
  return execPortsOf(node.kind, node, kinds)
    .outputs.filter(
      (out) => out.role !== 'next' && !NOT_A_VALUE_LANE.has(out.port) && !isRowPort(out.port),
    )
    .map((out) => ({ lane: laneKeyOf(out.port), label: out.label }));
}

export function reservedOutputNames(node: GraphNode, kinds: NodeKindLookup): readonly string[] {
  return kinds.get(node.kind)?.outputs.map((decl) => decl.name) ?? [];
}

export function typeChoiceOf(output: StructuredOutput): string {
  const found = VALUE_TYPES.find((choice) => choice.type?.t === output.type?.t);
  return found?.value ?? 'any';
}

export function outputNameProblem(
  outputs: readonly StructuredOutput[],
  reserved: readonly string[],
  from: string | undefined,
  name: string,
): string | undefined {
  if (name === from) return undefined;
  if (!IDENT.safeParse(name).success) {
    return 'Use letters and numbers, starting with a lowercase letter.';
  }
  if (reserved.includes(name) || outputs.some((output) => output.name === name)) {
    return 'That name is already used.';
  }
  return undefined;
}

export function nextOutputName(outputs: readonly StructuredOutput[]): string {
  let number = outputs.length + 1;
  while (outputs.some((output) => output.name === `result${String(number)}`)) number += 1;
  return `result${String(number)}`;
}

export function addedOutput(
  outputs: readonly StructuredOutput[],
  lanes: readonly ValueLane[],
): readonly StructuredOutput[] {
  const values: Record<string, PortValue> = Object.fromEntries(
    lanes.map((item): [string, PortValue] => [item.lane, { lit: null }]),
  );
  return [...outputs, { name: nextOutputName(outputs), values }];
}

export function renamedOutput(
  outputs: readonly StructuredOutput[],
  from: string,
  to: string,
): readonly StructuredOutput[] {
  return outputs.map((output) => (output.name === from ? { ...output, name: to } : output));
}

export function removedOutput(
  outputs: readonly StructuredOutput[],
  name: string,
): readonly StructuredOutput[] {
  return outputs.filter((output) => output.name !== name);
}

export function typedOutput(
  outputs: readonly StructuredOutput[],
  name: string,
  choice: string,
): readonly StructuredOutput[] {
  const type = VALUE_TYPES.find((entry) => entry.value === choice)?.type;
  return outputs.map((output) => {
    if (output.name !== name) return output;
    const { type: _previous, ...rest } = output;
    return type === undefined ? rest : { ...rest, type };
  });
}

export function laneValueSet(
  outputs: readonly StructuredOutput[],
  name: string,
  lane: string,
  value: PortValue | null,
): readonly StructuredOutput[] {
  return outputs.map((output) => {
    if (output.name !== name) return output;
    const others = Object.entries(output.values).filter(([key]) => key !== lane);
    const entries = value === null ? others : [...others, [lane, value] as const];
    return entries.length === 0 ? output : { ...output, values: Object.fromEntries(entries) };
  });
}

export function outputsOps(key: string, outputs: readonly StructuredOutput[]): readonly PatchOp[] {
  return [{ op: 'set', key, outputs: outputs.length === 0 ? null : [...outputs] }];
}
