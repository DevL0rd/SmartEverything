import type { FlowType, PortValue, Wire } from '@smarteverything/domain';
import { wire } from '@smarteverything/domain';
import type { TypedProgram } from '../check/shapes';
import { uniqueKey } from '../program/keys';
import type { VariableSpec } from './inputs';
import { typeOfWire } from './inputs';
import { refuse } from './result';
import { wireKey } from './values';

export interface OutputSpec {
  readonly name: string;
  readonly type: FlowType;
  readonly optional: boolean;
  readonly value: PortValue;
  readonly origin:
    | { readonly kind: 'variable'; readonly name: string }
    | { readonly kind: 'node'; readonly key: string; readonly port: string };
}

export interface Outputs {
  readonly specs: readonly OutputSpec[];
  readonly names: ReadonlyMap<string, string>;
}

function nodeReads(
  outside: readonly Wire[],
  top: ReadonlySet<string>,
  inside: ReadonlySet<string>,
): ReadonlyMap<string, { readonly key: string; readonly port: string }> {
  const reads = new Map<string, { key: string; port: string }>();
  for (const reference of outside) {
    const { from, port } = reference;
    if (!inside.has(from)) continue;
    if (!top.has(from)) {
      refuse(
        'nested_read',
        `${from} sits inside a container of the selection and is read from outside`,
      );
    }
    reads.set(wireKey(reference), { key: from, port });
  }
  return reads;
}

export interface Reads {
  readonly outside: readonly Wire[];
  readonly top: ReadonlySet<string>;
  readonly inside: ReadonlySet<string>;
}

export function buildOutputs(
  reads: Reads,
  variables: readonly VariableSpec[],
  typed: TypedProgram,
  early: boolean,
): Outputs {
  const taken = new Set<string>();
  const specs: OutputSpec[] = variables
    .filter((variable) => variable.written)
    .map((variable) => {
      taken.add(variable.name);
      return {
        name: variable.name,
        type: variable.type,
        optional: false,
        value: wire('vars', variable.name),
        origin: { kind: 'variable', name: variable.name },
      };
    });
  const names = new Map<string, string>();
  for (const [id, { key, port }] of nodeReads(reads.outside, reads.top, reads.inside)) {
    const name = uniqueKey(`${key} ${port}`, taken);
    taken.add(name);
    names.set(id, name);
    specs.push({
      name,
      type: typeOfWire(typed, { from: key, port }),
      optional: early,
      value: wire(key, port),
      origin: { kind: 'node', key, port },
    });
  }
  return { specs, names };
}
