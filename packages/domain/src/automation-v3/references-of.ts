import type { JsonValue } from '../values';
import type { KindLookup } from './describe-context';
import type { FlowNode } from './node';
import type { PortValue } from './port-value';
import type { FunctionV3, ProgramV3 } from './program';
import type { FlowType } from './types';
import { programNodes } from './describe';
import { isList, recordOf } from './describe-values';

export type FunctionLookup = (id: string, revision: number | undefined) => FunctionV3 | undefined;

export interface ReferenceContext {
  readonly kinds: KindLookup;
  readonly functions: FunctionLookup;
}

const TARGET_KEYS = ['device', 'devices', 'room', 'group'] as const;

type Found = Set<string>;

function addStrings(value: JsonValue | undefined, found: Found): void {
  if (typeof value === 'string') found.add(value);
  else if (isList(value)) for (const item of value) addStrings(item, found);
}

function addTarget(value: JsonValue, found: Found): void {
  const record = recordOf(value);
  if (record === undefined) return;
  for (const key of TARGET_KEYS) addStrings(record[key], found);
}

function addEntries(
  type: Extract<FlowType, { t: 'record' }>,
  record: Readonly<Record<string, JsonValue>>,
  found: Found,
): void {
  for (const [key, item] of Object.entries(record)) {
    const fieldType = type.fields?.[key] ?? type.values;
    if (fieldType !== undefined) addTyped(fieldType, item, found);
  }
}

function addTyped(type: FlowType, value: JsonValue, found: Found): void {
  if (type.t === 'ref') {
    if (type.of === 'target') addTarget(value, found);
    else addStrings(value, found);
  } else if (type.t === 'optional') addTyped(type.of, value, found);
  else if (type.t === 'list' && isList(value)) {
    for (const item of value) addTyped(type.of, item, found);
  } else if (type.t === 'record') {
    const record = recordOf(value);
    if (record !== undefined) addEntries(type, record, found);
  }
}

function portTypes(kindId: string, ctx: ReferenceContext): ReadonlyMap<string, FlowType> {
  const kind = ctx.kinds(kindId);
  return new Map((kind?.inputs ?? []).map((input) => [input.name, input.type]));
}

function addPorts(
  node: Pick<FlowNode, 'kind' | 'ports'>,
  ctx: ReferenceContext,
  found: Found,
): void {
  const types = portTypes(node.kind, ctx);
  for (const [name, port] of Object.entries(node.ports ?? {})) {
    const type = types.get(name);
    if (type !== undefined && 'lit' in port) addTyped(type, port.lit, found);
  }
}

function pinOf(port: PortValue | undefined): number | undefined {
  return port !== undefined && 'lit' in port && typeof port.lit === 'number' ? port.lit : undefined;
}

function functionOf(node: FlowNode): { id: string; pin: number | undefined } | undefined {
  const fn = node.ports?.['fn'];
  return fn !== undefined && 'lit' in fn && typeof fn.lit === 'string'
    ? { id: fn.lit, pin: pinOf(node.ports?.['pin']) }
    : undefined;
}

interface Walk {
  readonly ctx: ReferenceContext;
  readonly found: Found;
  readonly seen: Set<string>;
}

function collect(program: ProgramV3, walk: Walk): void {
  const { ctx, found } = walk;
  if (program.kind === 'automation') {
    for (const trigger of program.triggers) addPorts(trigger, ctx, found);
  }
  for (const variable of program.variables) {
    if ('lit' in variable.initial) addTyped(variable.type, variable.initial.lit, found);
  }
  for (const node of programNodes(program)) {
    addPorts(node, ctx, found);
    const called = node.kind === 'fn.call' ? functionOf(node) : undefined;
    if (called !== undefined) collectFunction(called.id, called.pin, walk);
  }
}

function collectFunction(id: string, pin: number | undefined, walk: Walk): void {
  const key = `${id}@${pin === undefined ? 'latest' : String(pin)}`;
  if (walk.seen.has(key)) return;
  walk.seen.add(key);
  const body = walk.ctx.functions(id, pin);
  if (body !== undefined) collect(body, walk);
}

export function programReferenceIds(
  program: ProgramV3,
  ctx: ReferenceContext,
): ReadonlySet<string> {
  const found: Found = new Set();
  collect(program, { ctx, found, seen: new Set() });
  return found;
}

export function programReferences(program: ProgramV3, id: string, ctx: ReferenceContext): boolean {
  return programReferenceIds(program, ctx).has(id);
}
