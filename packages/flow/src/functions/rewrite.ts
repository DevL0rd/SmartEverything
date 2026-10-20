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
import type { Program } from '../program/walk';

export interface Rewrite {
  readonly wire: (wire: Wire) => Wire;
  readonly node: (node: FlowNode) => FlowNode;
}

function value(port: PortValue, rewrite: Rewrite): PortValue {
  return 'wire' in port ? { wire: rewrite.wire(port.wire) } : port;
}

function record(
  ports: Readonly<Record<string, PortValue>>,
  rewrite: Rewrite,
): Record<string, PortValue> {
  return Object.fromEntries(
    Object.entries(ports).map(([name, port]) => [name, value(port, rewrite)]),
  );
}

function match(row: SwitchMatch, rewrite: Rewrite): SwitchMatch {
  return 'when' in row ? { when: value(row.when, rewrite) } : row;
}

function output(row: StructuredOutput, rewrite: Rewrite): StructuredOutput {
  return { ...row, values: record(row.values, rewrite) };
}

function branch(row: Branch, rewrite: Rewrite): Branch {
  return { ...row, when: value(row.when, rewrite), scope: scope(row.scope, rewrite) };
}

function switchCase(row: SwitchCase, rewrite: Rewrite): SwitchCase {
  return { ...row, match: match(row.match, rewrite), scope: scope(row.scope, rewrite) };
}

function catchRow(row: CatchRow, rewrite: Rewrite): CatchRow {
  return { ...row, scope: scope(row.scope, rewrite) };
}

function scopes(all: Readonly<Record<string, Scope>>, rewrite: Rewrite): Record<string, Scope> {
  return Object.fromEntries(
    Object.entries(all).map(([name, inner]) => [name, scope(inner, rewrite)]),
  );
}

function node(source: FlowNode, rewrite: Rewrite): FlowNode {
  return rewrite.node({
    ...source,
    ports: source.ports && record(source.ports, rewrite),
    branches: source.branches?.map((row) => branch(row, rewrite)),
    cases: source.cases?.map((row) => switchCase(row, rewrite)),
    catches: source.catches?.map((row) => catchRow(row, rewrite)),
    scopes: source.scopes && scopes(source.scopes, rewrite),
    outputs: source.outputs?.map((row) => output(row, rewrite)),
  });
}

function scope(source: Scope, rewrite: Rewrite): Scope {
  return { nodes: source.nodes.map((entry) => node(entry, rewrite)) };
}

function trigger(source: TriggerNode, rewrite: Rewrite): TriggerNode {
  return {
    ...source,
    ports: record(source.ports, rewrite),
  };
}

export function rewriteProgram<P extends Program>(program: P, rewrite: Rewrite): P {
  const body = scope(program.body, rewrite);
  if (program.kind === 'function') return { ...program, body };
  return {
    ...program,
    triggers: program.triggers.map((entry) => trigger(entry, rewrite)),
    ...(program.admit === undefined ? {} : { admit: value(program.admit, rewrite) }),
    body,
    ...(program.onFailure === undefined ? {} : { onFailure: scope(program.onFailure, rewrite) }),
  };
}
