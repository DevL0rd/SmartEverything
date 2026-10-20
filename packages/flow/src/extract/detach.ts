import type { FlowNode, FunctionV3, PortValue, Variable } from '@smarteverything/domain';
import { PROGRAM_V3, wire } from '@smarteverything/domain';
import { functionIdOf } from '../functions/calls';
import { uniqueKey, usedKeys } from '../program/keys';
import type { NodeEntry } from '../program/lookup';
import { indexProgram } from '../program/lookup';
import { BODY_PATH, formatScopePath } from '../program/paths';
import type { Program } from '../program/walk';
import { walkProgram } from '../program/walk';
import { DEFAULT_EXIT } from './control';
import { editScope } from './scope-edit';
import type { Refusal } from './result';
import { attempt, refuse } from './result';
import type { Mapping, WireEdit } from './values';
import { editWires, mapNode, mapProgram, valuesOnly } from './values';

export interface DetachOptions {
  readonly newId?: () => string;
}

export interface Detached {
  readonly ok: true;
  readonly program: Program;
  readonly renamed: Readonly<Record<string, string>>;
}

export type DetachResult = Detached | Refusal;

interface Names {
  readonly keys: Set<string>;
  readonly ids: Set<string>;
  readonly newId: () => string;
}

const NOTHING: PortValue = { lit: null };
const VARIABLE_KINDS: ReadonlySet<string> = new Set(['var.get', 'var.set', 'var.change']);

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function claimId(names: Names, wanted: string): string {
  let id = wanted;
  while (names.ids.has(id)) id = names.newId();
  names.ids.add(id);
  return id;
}

function claimKey(names: Names, wanted: string): string {
  const key = names.keys.has(wanted) ? uniqueKey(wanted, names.keys) : wanted;
  names.keys.add(key);
  return key;
}

function idsOf(program: Program): Set<string> {
  const ids = new Set<string>(
    program.kind === 'automation' ? program.triggers.map((t) => t.id) : [],
  );
  for (const { node } of walkProgram(program)) {
    ids.add(node.id);
    for (const row of [...(node.branches ?? []), ...(node.cases ?? []), ...(node.catches ?? [])]) {
      ids.add(row.id);
    }
  }
  return ids;
}

function inputSubstitutes(instance: FlowNode, callee: FunctionV3): ReadonlyMap<string, PortValue> {
  return new Map(
    callee.inputs.map((input) => {
      const given = instance.ports?.[input.name];
      const standard: PortValue = input.default === undefined ? NOTHING : { lit: input.default };
      return [input.name, given ?? standard];
    }),
  );
}

function checkTail(last: FlowNode | undefined): void {
  const exit = last?.kind === 'flow.return' ? last.ports?.['exit'] : undefined;
  if (exit !== undefined && !('lit' in exit && exit.lit === DEFAULT_EXIT)) {
    refuse('control', 'the final return leaves by an exit other than done');
  }
}

function checkBody(callee: FunctionV3): void {
  const last = callee.body.nodes.at(-1);
  for (const { node, scope } of walkProgram(callee)) {
    if (node.kind === 'flow.return' && node !== last) {
      refuse('control', `${node.key} returns before the end of the body and cannot be inlined`);
    }
    if (node.kind === 'flow.guard' && formatScopePath(scope) === formatScopePath(BODY_PATH)) {
      refuse('control', `${node.key} ends the body early and cannot be inlined`);
    }
  }
  checkTail(last);
}

function checkCallee(callee: FunctionV3, instance: FlowNode): void {
  if (callee.exits.length !== 1 || callee.exits[0] !== DEFAULT_EXIT) {
    refuse('unsupported', 'a Custom Node with exits other than done cannot be inlined');
  }
  checkBody(callee);
  const stray = Object.entries(instance.scopes ?? {}).filter(
    ([name, scope]) => name !== DEFAULT_EXIT && scope.nodes.length > 0,
  );
  if (stray.length > 0) refuse('unsupported', 'the instance continues from exits other than done');
}

function variableRenames(program: Program, callee: FunctionV3): ReadonlyMap<string, string> {
  const taken = new Set(program.variables.map((variable) => variable.name));
  return new Map(
    callee.variables.map((variable) => {
      const name = taken.has(variable.name) ? uniqueKey(variable.name, taken) : variable.name;
      taken.add(name);
      return [variable.name, name];
    }),
  );
}

interface Renames {
  readonly key: (key: string) => string;
  readonly variable: (name: string) => string;
}

function referenceEdit(inputs: ReadonlyMap<string, PortValue>, renames: Renames): WireEdit {
  return (reference) => {
    const { from, port } = reference;
    if (from === 'inputs') return inputs.get(port);
    if (from === 'vars') {
      const name = renames.variable(port);
      return name === port ? undefined : wire('vars', name);
    }
    const key = renames.key(from);
    return key === from ? undefined : wire(key, port);
  };
}

function localVariableName(node: FlowNode): string | undefined {
  const source = node.ports?.['source'];
  const name = node.ports?.['name'];
  const local = source === undefined || ('lit' in source && source.lit === 'run');
  if (!VARIABLE_KINDS.has(node.kind) || !local) return undefined;
  return name !== undefined && 'lit' in name && typeof name.lit === 'string' ? name.lit : undefined;
}

function renamedVariableNode(node: FlowNode, renames: Renames): FlowNode {
  const name = localVariableName(node);
  return name === undefined
    ? node
    : { ...node, ports: { ...node.ports, name: { lit: renames.variable(name) } } };
}

function relocated(node: FlowNode, renames: Renames, names: Names): FlowNode {
  const moved = renamedVariableNode(node, renames);
  const row = <T extends { readonly id: string }>(item: T): T => ({
    ...item,
    id: claimId(names, item.id),
  });
  return {
    ...moved,
    id: claimId(names, node.id),
    key: renames.key(node.key),
    branches: moved.branches?.map(row),
    cases: moved.cases?.map(row),
    catches: moved.catches?.map(row),
  };
}

function outputSubstitutes(
  tail: FlowNode | undefined,
  callee: FunctionV3,
): ReadonlyMap<string, PortValue> {
  return new Map(
    callee.outputs.map((output) => [output.name, tail?.ports?.[output.name] ?? NOTHING]),
  );
}

function calleeKeys(callee: FunctionV3, names: Names): ReadonlyMap<string, string> {
  return new Map(
    indexProgram(callee).nodes.map(({ node }) => [node.key, claimKey(names, node.key)]),
  );
}

interface Prepared {
  readonly kept: readonly FlowNode[];
  readonly outputs: ReadonlyMap<string, PortValue>;
  readonly added: readonly Variable[];
  readonly renamed: Record<string, string>;
}

function prepare(
  program: Program,
  instance: FlowNode,
  callee: FunctionV3,
  options: DetachOptions,
): Prepared {
  const names: Names = {
    keys: new Set(usedKeys(program)),
    ids: idsOf(program),
    newId: options.newId ?? randomId,
  };
  const keys = calleeKeys(callee, names);
  const variables = variableRenames(program, callee);
  const renames: Renames = {
    key: (key) => keys.get(key) ?? key,
    variable: (name) => variables.get(name) ?? name,
  };
  const inputs = inputSubstitutes(instance, callee);
  const edit = (value: PortValue): PortValue => editWires(value, referenceEdit(inputs, renames));
  const mapping = {
    value: edit,
    node: (node: FlowNode): FlowNode => relocated(node, renames, names),
  };
  const body = callee.body.nodes.map((node) => mapNode(node, mapping));
  const tail = body.at(-1)?.kind === 'flow.return' ? body.at(-1) : undefined;
  const outputs = outputSubstitutes(tail, callee);
  return {
    kept: tail === undefined ? body : body.slice(0, -1),
    outputs,
    added: callee.variables.map((variable) => ({
      ...variable,
      name: renames.variable(variable.name),
      initial: edit(variable.initial),
    })),
    renamed: Object.fromEntries([...keys].filter(([from, to]) => from !== to)),
  };
}

function place(program: Program, entry: NodeEntry, prepared: Prepared): Program {
  const after = entry.node.scopes?.[DEFAULT_EXIT]?.nodes ?? [];
  const replacement = [...prepared.kept, ...after];
  const edited = editScope(program, entry.scope, (nodes) =>
    nodes.flatMap((node) => (node.id === entry.node.id ? replacement : [node])),
  );
  return { ...edited, variables: [...edited.variables, ...prepared.added] };
}

function outputReads(instanceKey: string, outputs: ReadonlyMap<string, PortValue>): Mapping {
  return valuesOnly((value) =>
    editWires(value, (reference) =>
      reference.from === instanceKey ? outputs.get(reference.port) : undefined,
    ),
  );
}

export function detachInstance(
  program: Program,
  instanceKey: string,
  callee: FunctionV3,
  options: DetachOptions = {},
): DetachResult {
  return attempt((): Detached => {
    const entry = indexProgram(program).byKey.get(instanceKey);
    if (entry?.kind !== 'node' || entry.node.kind !== 'fn.call') {
      refuse('unknown_key', `${instanceKey} is not a Custom Node instance`);
    }
    if (functionIdOf(entry.node) === undefined) {
      refuse('unsupported', `${instanceKey} does not name a Custom Node`);
    }
    checkCallee(callee, entry.node);
    const prepared = prepare(program, entry.node, callee, options);
    const placed = place(program, entry, prepared);
    const parsed = PROGRAM_V3.safeParse(
      mapProgram(placed, outputReads(instanceKey, prepared.outputs)),
    );
    if (!parsed.success) {
      refuse('invalid_result', `the inlined program is not valid: ${parsed.error.message}`);
    }
    return { ok: true, program: parsed.data, renamed: prepared.renamed };
  });
}
