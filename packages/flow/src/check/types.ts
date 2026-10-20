import type {
  FlowNode,
  FlowType,
  GenericBindings,
  JsonValue,
  PortValue,
  StructuredOutput,
  Wire,
} from '@smarteverything/domain';
import {
  hasUnresolvedGenerics,
  isAssignable,
  resolveGenerics,
  substituteGenerics,
  isReservedRoot,
  typeDisplayName,
} from '@smarteverything/domain';
import type { Entry, ProgramIndex } from '../program/lookup';
import type { ChildPart } from '../program/paths';
import { formatChildPart } from '../program/paths';
import type { Program } from '../program/walk';
import { literalFits, literalType } from './literals';
import type { Problem } from './problems';
import { problem } from './problems';
import { programRoots } from './roots';
import { conversionFix, mapValues, optionalIf, own } from './scope-types';
import type { CheckContext, NodeShape, PortTypes, TypedProgram } from './shapes';
import { entriesOf, shapeOf } from './shapes';

export type ResolvedTyping =
  | { readonly kind: 'lit'; readonly value: JsonValue; readonly type: FlowType }
  | { readonly kind: 'type'; readonly type: FlowType };

export type ValueTyping = ResolvedTyping | { readonly kind: 'opaque' };

export interface TypeReport {
  readonly typed: TypedProgram;
  readonly problems: readonly Problem[];
}

interface Disagreement {
  readonly expected: FlowType;
  readonly received: FlowType;
}

interface EntryResult {
  readonly types: PortTypes;
  readonly problems: readonly Problem[];
}

const ANY: FlowType = { t: 'any' };

function relaxNumbers(type: FlowType, keepInteger: boolean): FlowType {
  if (type.t === 'number') {
    return { t: 'number', ...(keepInteger && type.integer === true ? { integer: true } : {}) };
  }
  if (type.t === 'list') return { t: 'list', of: relaxNumbers(type.of, keepInteger) };
  if (type.t === 'optional') return { t: 'optional', of: relaxNumbers(type.of, keepInteger) };
  if (type.t !== 'record') return type;
  return {
    t: 'record',
    ...(type.fields === undefined
      ? {}
      : { fields: mapValues(type.fields, (member) => relaxNumbers(member, keepInteger)) }),
    ...(type.values === undefined ? {} : { values: relaxNumbers(type.values, keepInteger) }),
  };
}

export function typingAccepts(typing: ResolvedTyping, expected: FlowType): boolean {
  if (typing.kind === 'lit') return literalFits(expected, typing.value);
  if (typing.type.t === 'any') return true;
  return isAssignable(relaxNumbers(typing.type, false), relaxNumbers(expected, false));
}

function fieldType(type: FlowType | undefined, port: string): FlowType | undefined {
  if (type?.t !== 'record') return undefined;
  return own(type.fields, port) ?? type.values;
}

function wireType(wire: Wire, typed: TypedProgram): FlowType | undefined {
  if (isReservedRoot(wire.from)) return fieldType(typed.roots[wire.from], wire.port);
  return own(typed.outputs.get(wire.from), wire.port);
}

function rootMisses(root: FlowType | undefined, port: string): boolean {
  if (root?.t !== 'record') return true;
  return root.values === undefined && own(root.fields, port) === undefined;
}

export function missesPort(wire: Wire, typed: TypedProgram): boolean {
  if (isReservedRoot(wire.from)) return rootMisses(typed.roots[wire.from], wire.port);
  const outputs = typed.outputs.get(wire.from);
  return outputs !== undefined && own(outputs, wire.port) === undefined;
}

export function typeOfValue(value: PortValue, typed: TypedProgram): ValueTyping {
  if ('lit' in value) return { kind: 'lit', value: value.lit, type: literalType(value.lit) };
  const type = wireType(value.wire, typed);
  return type === undefined ? { kind: 'opaque' } : { kind: 'type', type };
}

function partsOf(node: FlowNode): readonly ChildPart[] {
  return [
    ...Object.keys(node.scopes ?? {}).map((name): ChildPart => ({ kind: 'scope', name })),
    ...(node.branches ?? []).map((row): ChildPart => ({ kind: 'branch', id: row.id })),
    ...(node.cases ?? []).map((row): ChildPart => ({ kind: 'case', id: row.id })),
    ...(node.catches ?? []).map((row): ChildPart => ({ kind: 'catch', id: row.id })),
  ];
}

function givesEveryPath(node: FlowNode, lanes: readonly string[]): boolean {
  const parts = partsOf(node);
  const has = (name: string): boolean =>
    parts.some((part) => part.kind === 'scope' && part.name === name);
  const open =
    (node.kind === 'flow.if' && !has('else')) || (node.kind === 'flow.switch' && !has('default'));
  return (
    !open &&
    parts
      .filter((part) => !(part.kind === 'scope' && part.name === 'finally'))
      .every((part) =>
        lanes.some(
          (lane) => lane === formatChildPart(part) || (part.kind !== 'scope' && part.id === lane),
        ),
      )
  );
}

function unify(typings: readonly ResolvedTyping[]): FlowType | Disagreement {
  const [first, ...rest] = typings;
  let current = first?.type ?? ANY;
  for (const typing of rest) {
    if (isAssignable(typing.type, current)) continue;
    if (!isAssignable(current, typing.type)) return { expected: current, received: typing.type };
    current = typing.type;
  }
  return current;
}

function agreedType(
  typings: readonly ResolvedTyping[],
  declared: FlowType | undefined,
): FlowType | Disagreement {
  if (declared === undefined) return unify(typings);
  const wrong = typings.find((typing) => !typingAccepts(typing, declared));
  return wrong === undefined ? declared : { expected: declared, received: wrong.type };
}

function structuredOutput(
  node: FlowNode,
  output: StructuredOutput,
  previous: TypedProgram,
): EntryResult & { readonly type: FlowType } {
  const typings = Object.values(output.values)
    .map((value) => typeOfValue(value, previous))
    .flatMap((typing) => (typing.kind === 'opaque' ? [] : [typing]));
  const found = agreedType(typings, output.type);
  if (!('received' in found)) {
    const complete = givesEveryPath(node, Object.keys(output.values));
    return { type: optionalIf(!complete, found), types: {}, problems: [] };
  }
  const expected = typeDisplayName(found.expected);
  const received = typeDisplayName(found.received);
  const message = `The values of output ${output.name} do not agree: one is ${received} where ${expected} is expected.`;
  return {
    type: found.expected,
    types: {},
    problems: [
      problem({ nodeId: node.id, key: node.key }, 'structured_output_mismatch', message, {
        port: `outputs.${output.name}`,
        expected,
        received,
        fix: conversionFix(found.received, found.expected),
      }),
    ],
  };
}

function genericProblem(entry: Entry, port: string, mismatch: Disagreement): Problem {
  const expected = typeDisplayName(mismatch.expected);
  const received = typeDisplayName(mismatch.received);
  return problem(
    { nodeId: entry.node.id, key: entry.node.key },
    'generic_mismatch',
    `${port} gives ${received} but ${expected} is what the other values of this step use.`,
    { port, expected, received, fix: conversionFix(mismatch.received, mismatch.expected) },
  );
}

function bindingsOf(
  entry: Entry,
  shape: NodeShape,
  previous: TypedProgram,
): { readonly bindings: GenericBindings; readonly problems: readonly Problem[] } {
  let bindings: GenericBindings = new Map();
  const problems: Problem[] = [];
  for (const decl of shape.inputs) {
    const value = own(entry.node.ports, decl.name);
    if (value === undefined || !hasUnresolvedGenerics(decl.type)) continue;
    const typing = typeOfValue(value, previous);
    if (typing.kind === 'opaque') continue;
    const resolved = resolveGenerics(decl.type, relaxNumbers(typing.type, false), bindings);
    if (resolved.ok) bindings = resolved.bindings;
    else problems.push(genericProblem(entry, decl.name, resolved));
  }
  return { bindings, problems };
}

function entryTypes(
  entry: Entry,
  program: Program,
  ctx: CheckContext,
  previous: TypedProgram,
): EntryResult | undefined {
  const shape = shapeOf(entry, program, ctx);
  if (shape === undefined) return undefined;
  const { bindings, problems } = bindingsOf(entry, shape, previous);
  const scope = entry.kind === 'node' ? ctx.scopeOutputs(entry.node.kind) : [];
  const declared = [
    ...shape.outputs.map((out) => [out.name, optionalIf(out.optional === true, out.type)] as const),
    ...scope.map((out) => [out.name, out.type] as const),
  ];
  const types = mapValues(Object.fromEntries(declared), (type) =>
    substituteGenerics(type, bindings),
  );
  if (entry.kind === 'trigger') return { types, problems };
  const structured = (entry.node.outputs ?? []).map(
    (out) => [out.name, structuredOutput(entry.node, out, previous)] as const,
  );
  return {
    types: {
      ...types,
      ...Object.fromEntries(structured.map(([name, found]) => [name, found.type])),
    },
    problems: [...problems, ...structured.flatMap(([, found]) => found.problems)],
  };
}

function step(index: ProgramIndex, ctx: CheckContext, previous: TypedProgram): TypeReport {
  const { program } = index;
  const multiple = program.kind === 'automation' && program.triggers.length > 1;
  const outputs = new Map<string, PortTypes>();
  const problems: Problem[] = [];
  const triggers: PortTypes[] = [];
  for (const entry of entriesOf(index)) {
    const result = entryTypes(entry, program, ctx, previous);
    if (result === undefined) continue;
    problems.push(...result.problems);
    if (entry.kind === 'trigger') triggers.push(result.types);
    const wrap = entry.kind === 'trigger' && multiple;
    outputs.set(
      entry.node.key,
      wrap ? mapValues(result.types, (type) => optionalIf(true, type)) : result.types,
    );
  }
  return { typed: { roots: programRoots(program, triggers), outputs }, problems };
}

function signature(typed: TypedProgram): string {
  return JSON.stringify([[...typed.outputs], typed.roots]);
}

function settle(
  index: ProgramIndex,
  ctx: CheckContext,
  current: TypeReport,
  rounds: number,
): TypeReport {
  const next = step(index, ctx, current.typed);
  const stable = signature(next.typed) === signature(current.typed);
  return rounds === 0 || stable ? next : settle(index, ctx, next, rounds - 1);
}

export function resolveTypes(index: ProgramIndex, ctx: CheckContext): TypeReport {
  const entries = entriesOf(index);
  const empty: TypedProgram = { roots: {}, outputs: new Map() };
  return settle(index, ctx, step(index, ctx, empty), entries.length + 2);
}
