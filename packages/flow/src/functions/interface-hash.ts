import type { FlowType, InputPort, OutputPort } from '@smarteverything/domain';
import { sha256Hex } from './sha256';

export interface FunctionInterface {
  readonly flavour?: 'pure' | 'action';
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
  readonly exits: readonly string[];
}

export function interfaceOf(program: FunctionInterface): FunctionInterface {
  return {
    ...(program.flavour === undefined ? {} : { flavour: program.flavour }),
    inputs: program.inputs,
    outputs: program.outputs,
    exits: program.exits,
  };
}

function sortKeys(_key: string, value: unknown): unknown {
  if (!(value instanceof Object) || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

export function canonicalType(type: FlowType): string {
  return JSON.stringify(type, sortKeys);
}

function byName<T extends { readonly name: string }>(rows: readonly T[]): readonly T[] {
  return [...rows].sort((left, right) => (left.name < right.name ? -1 : 1));
}

export function interfaceSignature(shape: FunctionInterface): string {
  return JSON.stringify({
    flavour: shape.flavour ?? null,
    inputs: byName(shape.inputs).map((input) => ({
      name: input.name,
      type: canonicalType(input.type),
      required: input.required,
    })),
    outputs: byName(shape.outputs).map((output) => ({
      name: output.name,
      type: canonicalType(output.type),
      optional: output.optional === true,
    })),
    exits: [...shape.exits].sort(),
  });
}

export function interfaceHash(shape: FunctionInterface): string {
  return sha256Hex(interfaceSignature(shape));
}
