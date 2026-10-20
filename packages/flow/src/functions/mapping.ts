import type { FlowNode, PortValue, Scope } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { callInstances, functionIdOf, pinOf } from './calls';
import type { FunctionInterface } from './interface-hash';
import { rewriteProgram } from './rewrite';

export interface UpdateMapping {
  readonly inputs?: Readonly<Record<string, string>> | undefined;
  readonly outputs?: Readonly<Record<string, string>> | undefined;
  readonly inputValues?: Readonly<Record<string, PortValue>> | undefined;
  readonly exits?: Readonly<Record<string, string>> | undefined;
}

export interface MappingIssue {
  readonly key: string;
  readonly kind: 'input' | 'output' | 'exit';
  readonly name: string;
  readonly message: string;
}

interface Update {
  readonly mapping: UpdateMapping;
  readonly next: FunctionInterface;
  readonly issues: MappingIssue[];
}

export interface MappingResult {
  readonly program: Program;
  readonly touched: readonly string[];
  readonly issues: readonly MappingIssue[];
}

const KEPT_PORTS: ReadonlySet<string> = new Set(['fn', 'pin']);

function readOutputs(program: Program, key: string): ReadonlySet<string> {
  const found = new Set<string>();
  rewriteProgram(program, {
    wire: (wire) => {
      if (wire.from === key) found.add(wire.port);
      return wire;
    },
    node: (entry) => entry,
  });
  return found;
}

function renameOutputs(
  program: Program,
  key: string,
  renames: Readonly<Record<string, string>>,
): Program {
  return rewriteProgram(program, {
    wire: (wire) => {
      const target = wire.from === key ? renames[wire.port] : undefined;
      return target === undefined ? wire : { from: key, port: target };
    },
    node: (entry) => entry,
  });
}

function renamedPorts(node: FlowNode, update: Update): Record<string, PortValue> {
  const { mapping, next, issues } = update;
  const known = new Set(next.inputs.map((input) => input.name));
  const ports: Record<string, PortValue> = {};
  for (const [name, port] of Object.entries({ ...node.ports })) {
    const target = KEPT_PORTS.has(name) ? name : (mapping.inputs?.[name] ?? name);
    if (!KEPT_PORTS.has(target) && !known.has(target)) continue;
    if (target in ports) {
      issues.push({
        key: node.key,
        kind: 'input',
        name: target,
        message: `Two inputs of ${node.key} map to ${target}.`,
      });
    } else {
      ports[target] = port;
    }
  }
  return ports;
}

function filledPorts(
  node: FlowNode,
  ports: Readonly<Record<string, PortValue>>,
  update: Update,
): Record<string, PortValue> {
  const { mapping, next, issues } = update;
  const filled: Record<string, PortValue> = { ...ports };
  for (const input of next.inputs) {
    if (input.name in filled || !input.required || input.default !== undefined) continue;
    const given = mapping.inputValues?.[input.name];
    if (given === undefined) {
      issues.push({
        key: node.key,
        kind: 'input',
        name: input.name,
        message: `${node.key} needs a value for the new input ${input.name}.`,
      });
    } else {
      filled[input.name] = given;
    }
  }
  return filled;
}

function routedScopes(
  node: FlowNode,
  all: Readonly<Record<string, Scope>>,
  update: Update,
): Record<string, Scope> {
  const { mapping, next, issues } = update;
  const exits = new Set(next.exits);
  const routed: Record<string, Scope> = {};
  for (const [name, scope] of Object.entries(all)) {
    const target = exits.has(name) ? name : mapping.exits?.[name];
    if (target === undefined || !exits.has(target)) {
      issues.push({
        key: node.key,
        kind: 'exit',
        name,
        message: `The exit ${name} of ${node.key} was removed and needs another exit to continue from.`,
      });
      routed[name] = scope;
    } else {
      routed[target] = { nodes: [...(routed[target]?.nodes ?? []), ...scope.nodes] };
    }
  }
  return routed;
}

function updatedInstance(node: FlowNode, update: Update): FlowNode {
  const ports = filledPorts(node, renamedPorts(node, update), update);
  return {
    ...node,
    ports,
    ...(node.scopes === undefined ? {} : { scopes: routedScopes(node, node.scopes, update) }),
  };
}

function checkOutputs(
  program: Program,
  key: string,
  next: FunctionInterface,
  issues: MappingIssue[],
): void {
  const outputs = new Set(next.outputs.map((output) => output.name));
  for (const name of readOutputs(program, key)) {
    if (!outputs.has(name)) {
      issues.push({
        key,
        kind: 'output',
        name,
        message: `${key}.${name} is read but the output ${name} no longer exists.`,
      });
    }
  }
}

export function applyUpdateMapping(
  program: Program,
  functionId: string,
  next: FunctionInterface,
  mapping: UpdateMapping,
): MappingResult {
  const issues: MappingIssue[] = [];
  const keys = new Set(
    callInstances(program)
      .filter(({ node }) => functionIdOf(node) === functionId && pinOf(node) === undefined)
      .map(({ node }) => node.key),
  );
  let current = program;
  for (const key of keys) {
    if (mapping.outputs !== undefined) current = renameOutputs(current, key, mapping.outputs);
    checkOutputs(current, key, next, issues);
  }
  const touched: string[] = [];
  const updated = rewriteProgram(current, {
    wire: (wire) => wire,
    node: (entry) => {
      if (entry.kind !== 'fn.call' || !keys.has(entry.key)) return entry;
      touched.push(entry.key);
      return updatedInstance(entry, { mapping, next, issues });
    },
  });
  return { program: updated, touched, issues };
}
