import type { FlowNode, FunctionV3, PortValue } from '@smarteverything/domain';
import { FUNCTION_V3, PROGRAM_V3, wire } from '@smarteverything/domain';
import { check } from '../check/check';
import type { CheckContext, Problem } from '../check/check';
import { interfaceOf } from '../functions/interface-hash';
import { uniqueKey, usedKeys } from '../program/keys';
import { indexProgram, type ProgramIndex } from '../program/lookup';
import type { Program } from '../program/walk';
import type { Boundary, FixedReference } from './boundary';
import { analyseBoundary } from './boundary';
import { DEFAULT_EXIT } from './control';
import type { Region } from './region';
import { isExec, knownKind, resolveRegion } from './region';
import { editScope } from './scope-edit';
import type { Refusal } from './result';
import { attempt, refuse } from './result';
import type { Mapping } from './values';
import { editWires, mapNode, mapProgram, valuesOnly, wireKey } from './values';

export interface ExposedPort {
  readonly key: string;
  readonly port: string;
}

export interface ExtractOptions {
  readonly functionId: string;
  readonly name: string;
  readonly expose?: readonly ExposedPort[];
  readonly newId?: () => string;
}

export interface Extraction {
  readonly ok: true;
  readonly callee: FunctionV3;
  readonly caller: Program;
  readonly instanceKey: string;
  readonly fixed: readonly FixedReference[];
  readonly problems: { readonly callee: readonly Problem[]; readonly caller: readonly Problem[] };
}

export type ExtractResult = Extraction | Refusal;

interface Build {
  readonly program: Program;
  readonly region: Region;
  readonly boundary: Boundary;
  readonly ctx: CheckContext;
  readonly newId: () => string;
  readonly exposed: ReadonlyMap<string, string>;
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function variableReturns(boundary: Boundary): Record<string, PortValue> {
  return Object.fromEntries(
    boundary.outputs
      .filter((output) => output.origin.kind === 'variable')
      .map((output) => [output.name, output.value]),
  );
}

function earlyReturn(node: FlowNode, build: Build): FlowNode {
  const exit = node.ports?.['exit'];
  const kept = build.program.kind === 'function' && exit !== undefined ? { exit } : {};
  return { ...node, ports: { ...kept, ...variableReturns(build.boundary) } };
}

function endsWithReturn(nodes: readonly FlowNode[], build: Build): boolean {
  const last = nodes.findLast((node) => isExec(node, build.ctx.kinds));
  return last?.kind === 'flow.return';
}

function finalReturn(build: Build): FlowNode {
  return {
    id: build.newId(),
    key: uniqueKey('finish', build.region.keys),
    kind: 'flow.return',
    ports: Object.fromEntries(build.boundary.outputs.map((output) => [output.name, output.value])),
  };
}

const exposedId = (key: string, port: string): string => `${key}\u0000${port}`;

function exposePorts(node: FlowNode, build: Build): FlowNode {
  const ports = node.ports;
  if (ports === undefined) return node;
  const swapped = Object.entries(ports).map(([port, value]) => {
    const name = build.exposed.get(exposedId(node.key, port));
    return [port, name === undefined ? value : wire('inputs', name)] as const;
  });
  return { ...node, ports: Object.fromEntries(swapped) };
}

function bodyNodes(build: Build): readonly FlowNode[] {
  const { region, boundary } = build;
  const mapping = {
    value: (value: PortValue): PortValue =>
      editWires(value, (reference) => {
        const name = boundary.derived.get(wireKey(reference));
        return name === undefined ? undefined : wire('inputs', name);
      }),
    node: (node: FlowNode): FlowNode =>
      node.kind === 'flow.return' ? earlyReturn(node, build) : exposePorts(node, build),
  };
  const nodes = region.nodes.map((node) => mapNode(node, mapping));
  const needsFinal = boundary.outputs.length > 0 && !endsWithReturn(nodes, build);
  return needsFinal ? [...nodes, finalReturn(build)] : nodes;
}

function calleeOf(build: Build): FunctionV3 {
  const { boundary } = build;
  const candidate = {
    version: 3,
    kind: 'function',
    flavour: boundary.flavour,
    inputs: boundary.inputs.map(({ name, type }) => ({ name, type, required: true })),
    outputs: boundary.outputs.map(({ name, type, optional }) => ({
      name,
      type,
      ...(optional ? { optional: true } : {}),
    })),
    exits: boundary.exits,
    variables: boundary.variables.map(({ name, type, input }) => ({
      name,
      type,
      initial: wire('inputs', input),
    })),
    body: { nodes: bodyNodes(build) },
  };
  const parsed = FUNCTION_V3.safeParse(candidate);
  if (!parsed.success) {
    refuse('invalid_result', `the new Custom Node is not valid: ${parsed.error.message}`);
  }
  return parsed.data;
}

function exitScopes(build: Build, taken: Set<string>): Record<string, { nodes: FlowNode[] }> {
  const extra = build.boundary.exits.filter((exit) => exit !== DEFAULT_EXIT);
  return Object.fromEntries(
    extra.map((exit) => {
      const key = uniqueKey('finish', taken);
      taken.add(key);
      const node: FlowNode = {
        id: build.newId(),
        key,
        kind: 'flow.return',
        ports: { exit: { lit: exit } },
      };
      return [exit, { nodes: [node] }];
    }),
  );
}

function instanceOf(build: Build, options: ExtractOptions, taken: Set<string>): FlowNode {
  const key = uniqueKey(options.name, taken);
  taken.add(key);
  const scopes = exitScopes(build, taken);
  return {
    id: build.newId(),
    key,
    kind: 'fn.call',
    ports: {
      fn: { lit: options.functionId },
      ...Object.fromEntries(build.boundary.inputs.map(({ name, argument }) => [name, argument])),
    },
    ...(Object.keys(scopes).length === 0 ? {} : { scopes }),
  };
}

function writeBacks(build: Build, instance: FlowNode, taken: Set<string>): readonly FlowNode[] {
  return build.boundary.variables
    .filter((variable) => variable.written)
    .map((variable) => {
      const key = uniqueKey(`set ${variable.name}`, taken);
      taken.add(key);
      return {
        id: build.newId(),
        key,
        kind: 'var.set',
        ports: {
          name: { lit: variable.name },
          to: wire(instance.key, variable.name),
        },
      };
    });
}

function outsideReads(build: Build, instanceKey: string): Mapping {
  const { boundary } = build;
  return valuesOnly((value) =>
    editWires(value, (reference) => {
      const name = boundary.outputNames.get(wireKey(reference));
      return name === undefined ? undefined : wire(instanceKey, name);
    }),
  );
}

function callerOf(build: Build, options: ExtractOptions): { caller: Program; key: string } {
  const { program, region } = build;
  const taken = new Set(usedKeys(program));
  const instance = instanceOf(build, options, taken);
  const members = new Set(region.nodes.map((node) => node.id));
  const replacement = [instance, ...writeBacks(build, instance, taken)];
  const spliced = editScope(program, region.scope, (nodes) => [
    ...nodes.slice(0, region.position).filter((node) => !members.has(node.id)),
    ...replacement,
    ...nodes.slice(region.position).filter((node) => !members.has(node.id)),
  ]);
  return { caller: mapProgram(spliced, outsideReads(build, instance.key)), key: instance.key };
}

function validated(program: Program): Program {
  const parsed = PROGRAM_V3.safeParse(program);
  if (!parsed.success) {
    refuse('invalid_result', `the rewritten program is not valid: ${parsed.error.message}`);
  }
  return parsed.data;
}

function exposure(
  boundary: Boundary,
  scope: { readonly index: ProgramIndex; readonly region: Region; readonly ctx: CheckContext },
  expose: readonly ExposedPort[],
): { boundary: Boundary; exposed: ReadonlyMap<string, string> } {
  const { index, region, ctx } = scope;
  const taken = new Set<string>(['fn', 'pin', ...boundary.inputs.map((input) => input.name)]);
  const exposed = new Map<string, string>();
  const added = expose.map(({ key, port }) => {
    const known = boundary.fixed.some((item) => item.key === key && item.port === port);
    const node = region.keys.has(key) ? index.byKey.get(key)?.node : undefined;
    const decl = node && knownKind(node, ctx.kinds).inputs.find((input) => input.name === port);
    const value = node?.ports?.[port];
    if (!known || decl === undefined || value === undefined) {
      refuse('unreadable', `${key} › ${port} is not a fixed pick that can become an input`);
    }
    const name = uniqueKey(`${key} ${port}`, taken);
    taken.add(name);
    exposed.set(exposedId(key, port), name);
    return { name, type: decl.type, argument: value };
  });
  return {
    boundary: {
      ...boundary,
      inputs: [...boundary.inputs, ...added],
      fixed: boundary.fixed.filter((item) => !exposed.has(exposedId(item.key, item.port))),
    },
    exposed,
  };
}

export function extractRegion(
  program: Program,
  selection: readonly string[],
  ctx: CheckContext,
  options: ExtractOptions,
): ExtractResult {
  return attempt((): Extraction => {
    const index = indexProgram(program);
    const region = resolveRegion(index, selection, ctx.kinds);
    const analysed = analyseBoundary(program, index, region, ctx);
    const { boundary, exposed } = exposure(analysed, { index, region, ctx }, options.expose ?? []);
    const build: Build = {
      program,
      region,
      boundary,
      ctx,
      exposed,
      newId: options.newId ?? randomId,
    };
    const callee = calleeOf(build);
    const { caller: raw, key } = callerOf(build, options);
    const caller = validated(raw);
    const shape = interfaceOf(callee);
    const callerCtx: CheckContext = {
      ...ctx,
      functions: (id, pin) => (id === options.functionId ? shape : ctx.functions(id, pin)),
    };
    return {
      ok: true,
      callee,
      caller,
      instanceKey: key,
      fixed: boundary.fixed,
      problems: { callee: check(callee, ctx), caller: check(caller, callerCtx) },
    };
  });
}
