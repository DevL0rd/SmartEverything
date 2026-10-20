import type {
  Branch,
  CatchRow,
  FlowNode,
  PortValue,
  Scope,
  StructuredOutput,
  SwitchCase,
  SwitchMatch,
  TriggerNode,
  Wire,
} from '@smarteverything/domain';
import { portValueReferences } from '../check/references';
import type { Program } from '../program/walk';

export type ValueMapper = (value: PortValue) => PortValue;

export interface Mapping {
  readonly value: ValueMapper;
  readonly node: (node: FlowNode) => FlowNode;
}

export type WireEdit = (wire: Wire) => PortValue | undefined;

export function wireKey(wire: Wire): string {
  return `${wire.from}\u0000${wire.port}`;
}

export function editWires(value: PortValue, edit: WireEdit): PortValue {
  if (!('wire' in value)) return value;
  return edit(value.wire) ?? value;
}

export function wiresOf(value: PortValue): readonly Wire[] {
  return portValueReferences(value);
}

function mapRecord(
  ports: Readonly<Record<string, PortValue>>,
  mapping: Mapping,
): Record<string, PortValue> {
  return Object.fromEntries(
    Object.entries(ports).map(([name, port]) => [name, mapping.value(port)]),
  );
}

function mapMatch(row: SwitchMatch, mapping: Mapping): SwitchMatch {
  return 'when' in row ? { when: mapping.value(row.when) } : row;
}

function mapOutput(row: StructuredOutput, mapping: Mapping): StructuredOutput {
  return { ...row, values: mapRecord(row.values, mapping) };
}

function mapBranch(row: Branch, mapping: Mapping): Branch {
  return { ...row, when: mapping.value(row.when), scope: mapScope(row.scope, mapping) };
}

function mapCase(row: SwitchCase, mapping: Mapping): SwitchCase {
  return { ...row, match: mapMatch(row.match, mapping), scope: mapScope(row.scope, mapping) };
}

function mapCatch(row: CatchRow, mapping: Mapping): CatchRow {
  return { ...row, scope: mapScope(row.scope, mapping) };
}

function mapScopes(all: Readonly<Record<string, Scope>>, mapping: Mapping): Record<string, Scope> {
  return Object.fromEntries(
    Object.entries(all).map(([name, inner]) => [name, mapScope(inner, mapping)]),
  );
}

export function mapNode(source: FlowNode, mapping: Mapping): FlowNode {
  return mapping.node({
    ...source,
    ports: source.ports && mapRecord(source.ports, mapping),
    branches: source.branches?.map((row) => mapBranch(row, mapping)),
    cases: source.cases?.map((row) => mapCase(row, mapping)),
    catches: source.catches?.map((row) => mapCatch(row, mapping)),
    scopes: source.scopes && mapScopes(source.scopes, mapping),
    outputs: source.outputs?.map((row) => mapOutput(row, mapping)),
  });
}

export function mapScope(source: Scope, mapping: Mapping): Scope {
  return { nodes: source.nodes.map((entry) => mapNode(entry, mapping)) };
}

function mapTrigger(source: TriggerNode, mapping: Mapping): TriggerNode {
  return {
    ...source,
    ports: mapRecord(source.ports, mapping),
  };
}

export function mapProgram<P extends Program>(program: P, mapping: Mapping): P {
  const variables = program.variables.map((variable) => ({
    ...variable,
    initial: mapping.value(variable.initial),
  }));
  const body = mapScope(program.body, mapping);
  if (program.kind === 'function') return { ...program, variables, body };
  return {
    ...program,
    triggers: program.triggers.map((entry) => mapTrigger(entry, mapping)),
    ...(program.admit === undefined ? {} : { admit: mapping.value(program.admit) }),
    variables,
    body,
    ...(program.onFailure === undefined ? {} : { onFailure: mapScope(program.onFailure, mapping) }),
  };
}

export function valuesOnly(value: ValueMapper): Mapping {
  return { value, node: (node) => node };
}
