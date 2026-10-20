import type { FlowNode, FlowType, PortValue, StructuredOutput } from '@smarteverything/domain';
import { IDENT } from '@smarteverything/domain';

export const STRUCTURED_KIND_IDS: ReadonlySet<string> = new Set([
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

export const STRUCTURED_TYPES: readonly TypeChoice[] = [
  { value: 'any', label: 'Anything', type: undefined },
  { value: 'boolean', label: 'Yes or no', type: { t: 'boolean' } },
  { value: 'number', label: 'Number', type: { t: 'number' } },
  { value: 'text', label: 'Text', type: { t: 'text' } },
  { value: 'duration', label: 'Duration', type: { t: 'duration' } },
];

const LANE_HIDDEN = new Set(['onError']);

export function structuredLanes(node: FlowNode): readonly string[] {
  return Object.keys(node.scopes ?? {}).filter((name) => !LANE_HIDDEN.has(name));
}

export function typeChoiceOf(output: StructuredOutput): string {
  const found = STRUCTURED_TYPES.find((choice) => choice.type?.t === output.type?.t);
  return found?.value ?? 'any';
}

export function outputNameProblem(
  outputs: readonly StructuredOutput[],
  reserved: readonly string[],
  from: string | undefined,
  name: string,
): string | undefined {
  if (name === from) return undefined;
  if (!IDENT.safeParse(name).success)
    return 'Use letters and numbers, starting with a lowercase letter.';
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
  lanes: readonly string[],
): readonly StructuredOutput[] {
  const values: Record<string, PortValue> = Object.fromEntries(
    lanes.map((lane): [string, PortValue] => [lane, { lit: null }]),
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
  const type = STRUCTURED_TYPES.find((entry) => entry.value === choice)?.type;
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
