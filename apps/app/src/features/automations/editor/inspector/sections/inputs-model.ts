import type {
  FlowNode,
  FlowType,
  InputPortDecl,
  JsonValue,
  NodeKind,
  OptionSourceId,
  PortValue,
  TriggerNode,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { TIMING_PORT_NAMES, summaryPlaceholders } from '@smarteverything/domain';
import { shortTypeName } from '../../../model/graph/scene-pins';
import type { Field } from '../schema-fields';
import { fieldOf, formKind, isTextOnly } from '../schema-fields';
import { chainedPortOps } from '../values/source-chain-model';
import { targetFormOf, targetValue } from '../values/target-model';

const OWN_SECTION_PORTS: Readonly<Record<string, ReadonlySet<string>>> = {
  'flow.repeat': new Set(['gap', 'limit']),
  'flow.while': new Set(['gap', 'limit']),
  'flow.do_until': new Set(['gap', 'limit']),
  'flow.forever': new Set(['gap', 'limit']),
  'flow.for_each': new Set(['concurrency', 'collect']),
  'flow.switch': new Set(['mode']),
  'flow.parallel': new Set(['join', 'errors']),
  'flow.break': new Set(['target']),
  'flow.continue': new Set(['target']),
  'flow.return': new Set(['exit']),
  'fn.call': new Set(['fn', 'pin']),
};

export const TOOL_KIND = 'tool.call';

const PICKED_SOURCES: ReadonlySet<OptionSourceId> = new Set<OptionSourceId>([
  'device.controls',
  'device.writable_controls',
]);

const PLAIN_TYPES: ReadonlySet<FlowType['t']> = new Set([
  'any',
  'param',
  'text',
  'record',
  'choice',
]);

export type InputPart = 'inputs' | 'timing' | 'args';

export interface InputRow {
  readonly field: Field;
  readonly value: PortValue | undefined;
  readonly typeChip: string;
  readonly main: boolean;
  readonly form: boolean;
  readonly source: OptionSourceId | undefined;
}

export interface InputsModel {
  readonly rows: readonly InputRow[];
}

export function ownedPorts(kind: NodeKind): ReadonlySet<string> {
  return new Set(OWN_SECTION_PORTS[kind.id] ?? []);
}

export function partOf(kind: NodeKind, name: string): InputPart {
  if (kind.class === 'trigger' && TIMING_PORT_NAMES.has(name)) return 'timing';
  return kind.id === TOOL_KIND && name === 'args' ? 'args' : 'inputs';
}

function pickedSource(decl: InputPortDecl): OptionSourceId | undefined {
  const source = decl.ui?.optionsFrom;
  return source !== undefined && PICKED_SOURCES.has(source) && decl.type.t === 'text'
    ? source
    : undefined;
}

function chipOf(type: FlowType): string {
  const inner = type.t === 'optional' ? type.of : type;
  return PLAIN_TYPES.has(inner.t) ? '' : shortTypeName(type);
}

function rowOf(kind: NodeKind, decl: InputPortDecl, node: FlowNode | TriggerNode): InputRow {
  const field = fieldOf(decl);
  const source = pickedSource(decl);
  const named = summaryPlaceholders(kind.summary).includes(decl.name);
  return {
    field,
    value: node.ports?.[decl.name],
    typeChip: chipOf(decl.type),
    main: decl.required || decl.summary === true || named,
    form: source === undefined && field.isStatic && formKind(field) !== null,
    source,
  };
}

export function inputsModel(
  kind: NodeKind,
  node: FlowNode | TriggerNode,
  part: InputPart = 'inputs',
): InputsModel {
  const owned = ownedPorts(kind);
  const rows = kind.inputs
    .filter((decl) => !owned.has(decl.name) && partOf(kind, decl.name) === part)
    .map((decl) => rowOf(kind, decl, node));
  return { rows };
}

export function isGiven(row: InputRow): boolean {
  return row.main || row.value !== undefined;
}

function isComposite(value: PortValue | undefined): boolean {
  return (
    value !== undefined && 'lit' in value && typeof value.lit === 'object' && value.lit !== null
  );
}

export function textFields(kind: NodeKind, node: FlowNode | TriggerNode): readonly Field[] {
  const owned = ownedPorts(kind);
  return kind.inputs
    .filter((decl) => !owned.has(decl.name))
    .map(fieldOf)
    .filter((field) => isTextOnly(field.control) && isComposite(node.ports?.[field.name]));
}

const DEVICE_LIST_KINDS: ReadonlySet<string> = new Set(['flow.for_each']);

function deviceIdOf(item: JsonValue): string | undefined {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined;
  const entries = Object.entries(item);
  const [only] = entries;
  return entries.length === 1 && only?.[0] === 'device' && typeof only[1] === 'string'
    ? only[1]
    : undefined;
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function deviceListOf(kind: NodeKind, row: InputRow): readonly string[] | undefined {
  if (!DEVICE_LIST_KINDS.has(kind.id) || row.field.name !== 'items') return undefined;
  const { value } = row;
  if (value === undefined || !('lit' in value) || !isList(value.lit)) return undefined;
  const items = value.lit;
  const ids = items.flatMap((item) => {
    const id = deviceIdOf(item);
    return id === undefined ? [] : [id];
  });
  return items.length > 0 && ids.length === items.length ? ids : undefined;
}

export function deviceListValue(target: JsonValue): JsonValue {
  const form = targetFormOf(target);
  if (form.t === 'devices') return form.ids.map((device) => ({ device }));
  return form.id === '' ? [] : [targetValue(form)];
}

export interface InputsOwner {
  readonly key: string;
  readonly kind: NodeKind | undefined;
  readonly node: FlowNode | TriggerNode;
}

export function inputOps(
  owner: InputsOwner,
  name: string,
  value: PortValue | null,
): readonly PatchOp[] {
  const inputs = owner.kind?.inputs ?? [];
  return chainedPortOps({ key: owner.key, inputs, ports: owner.node.ports ?? {} }, name, value);
}
