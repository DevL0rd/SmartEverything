import type { FlowType, PortValue, Wire } from '@smarteverything/domain';
import { isReservedRoot, wire } from '@smarteverything/domain';
import { own } from '../check/scope-types';
import type { TypedProgram } from '../check/shapes';
import { uniqueKey } from '../program/keys';
import type { ProgramIndex } from '../program/lookup';
import type { VariableUse } from './variables';
import { wireKey } from './values';
import { refuse } from './result';

export interface InputSpec {
  readonly name: string;
  readonly type: FlowType;
  readonly argument: PortValue;
}

export interface VariableSpec {
  readonly name: string;
  readonly type: FlowType;
  readonly input: string;
  readonly written: boolean;
}

export interface Inputs {
  readonly specs: readonly InputSpec[];
  readonly variables: readonly VariableSpec[];
  readonly derived: ReadonlyMap<string, string>;
}

export interface Needs {
  readonly callerInputs: readonly string[];
  readonly variableNames: readonly string[];
  readonly chains: readonly Wire[];
}

const ANY: FlowType = { t: 'any' };
const INSTANCE_PORTS = ['fn', 'pin'];
const KEPT_ROOTS: ReadonlySet<string> = new Set(['home', 'run']);

function fieldType(type: FlowType | undefined, port: string): FlowType | undefined {
  return type?.t === 'record' ? (own(type.fields, port) ?? type.values) : undefined;
}

export function typeOfWire(typed: TypedProgram, source: Wire): FlowType {
  if (isReservedRoot(source.from)) return fieldType(typed.roots[source.from], source.port) ?? ANY;
  return own(typed.outputs.get(source.from), source.port) ?? ANY;
}

export function needsOf(
  references: readonly Wire[],
  inside: ReadonlySet<string>,
  index: ProgramIndex,
): Needs {
  const callerInputs = new Set<string>();
  const variableNames = new Set<string>();
  const chains = new Map<string, Wire>();
  for (const reference of references) {
    const { from, port } = reference;
    if (inside.has(from) || KEPT_ROOTS.has(from)) continue;
    if (from === 'inputs') callerInputs.add(port);
    else if (from === 'vars') variableNames.add(port);
    else if (from === 'trigger' || index.byKey.has(from))
      chains.set(wireKey(reference), { from, port });
    else refuse('unreadable', `${from} is not a node, a trigger or a variable of this program`);
  }
  return {
    callerInputs: [...callerInputs],
    variableNames: [...variableNames],
    chains: [...chains.values()],
  };
}

function claim(taken: Set<string>, name: string): string {
  const claimed = uniqueKey(name, taken);
  taken.add(claimed);
  return claimed;
}

export function buildInputs(
  needs: Needs,
  uses: readonly VariableUse[],
  typed: TypedProgram,
): Inputs {
  const taken = new Set<string>(INSTANCE_PORTS);
  const specs: InputSpec[] = needs.callerInputs.map((name) => {
    if (taken.has(name)) refuse('name_taken', `the input ${name} collides with a port of the call`);
    taken.add(name);
    return {
      name,
      type: typeOfWire(typed, { from: 'inputs', port: name }),
      argument: wire('inputs', name),
    };
  });
  const variables = uses.map(({ variable, written }): VariableSpec => {
    const input = claim(taken, variable.name);
    specs.push({
      name: input,
      type: variable.type,
      argument: wire('vars', variable.name),
    });
    return { name: variable.name, type: variable.type, input, written };
  });
  const derived = new Map<string, string>();
  for (const chain of needs.chains) {
    const name = claim(taken, `${chain.from} ${chain.port}`);
    derived.set(wireKey(chain), name);
    specs.push({ name, type: typeOfWire(typed, chain), argument: { wire: chain } });
  }
  return { specs, variables, derived };
}
