import {
  FLOW_SCOPE_OUTPUTS,
  portText,
  typeDisplayName,
  type DescribeContext,
  type FlowType,
  type InputPort,
  type NodeKind,
  type NodeKindLookup,
  type PortValue,
  type StructuredOutput,
  type WireScope,
} from '@smarteverything/domain';
import type { PinGroup, PortShape, ScenePin } from './scene-contract';
import { valueInHandle, valueOutHandle } from './handle-ids';

export interface PinContext {
  readonly describe: DescribeContext;
  readonly scope: WireScope;
  readonly sentence: WireScope;
  readonly sole: (key: string, port: string) => string | undefined;
  readonly kinds: NodeKindLookup;
}

export function valueWords(
  value: PortValue,
  decl: Pick<NodeKind['inputs'][number], 'type'> | undefined,
  ctx: PinContext,
): string {
  const named = 'wire' in value ? ctx.sole(value.wire.from, value.wire.port) : undefined;
  return named ?? portText(value, decl, ctx.describe.names, ctx.scope);
}

export function shortTypeName(type: FlowType): string {
  if (type.t === 'optional') return `Optional ${shortTypeName(type.of).toLowerCase()}`;
  if (type.t === 'record') return 'Record';
  if (type.t === 'choice') return 'Choice';
  if (type.t === 'list') {
    const of = type.of.t === 'record' || type.of.t === 'list' ? 'items' : null;
    return of === null ? typeDisplayName(type) : `List of ${of}`;
  }
  return typeDisplayName(type);
}

export interface PinSubject {
  readonly kind: string;
  readonly ports?: Readonly<Record<string, PortValue>> | undefined;
  readonly outputs?: readonly StructuredOutput[] | undefined;
}

interface OutputDecl {
  readonly name: string;
  readonly type: FlowType;
  readonly group: PinGroup;
}

const ANY: FlowType = { t: 'any' };

const DYNAMIC_OUTPUT_KINDS: ReadonlySet<string> = new Set(['fn.call']);

const SHAPE_BY_TYPE: Partial<Record<FlowType['t'], PortShape>> = {
  list: 'diamond',
  record: 'square',
  ref: 'hexagon',
  error: 'triangle',
};

export function shapeOf(type: FlowType): PortShape {
  if (type.t === 'optional') return shapeOf(type.of);
  return SHAPE_BY_TYPE[type.t] ?? 'circle';
}

export function labelOf(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1).toLowerCase()}`;
}

function inputPin(
  name: string,
  decl: NodeKind['inputs'][number] | undefined,
  value: PortValue | undefined,
  ctx: PinContext,
): ScenePin {
  const type = decl?.type ?? ANY;
  const given = value ?? (decl?.default === undefined ? undefined : { lit: decl.default });
  return {
    handle: valueInHandle(name),
    name,
    label: labelOf(name),
    shape: shapeOf(type),
    type: shortTypeName(type),
    group: 'input',
    value: given === undefined ? null : valueWords(given, decl, ctx),
    wired: value !== undefined && 'wire' in value,
  };
}

export function inputPins(subject: PinSubject, ctx: PinContext): readonly ScenePin[] {
  const declared = ctx.kinds.get(subject.kind)?.inputs ?? [];
  const ports = subject.ports ?? {};
  const shown = declared.filter((decl) => ports[decl.name] !== undefined || decl.required);
  const extra = Object.keys(ports).filter((name) => !declared.some((decl) => decl.name === name));
  return [
    ...shown.map((decl) => inputPin(decl.name, decl, ports[decl.name], ctx)),
    ...extra.map((name) => inputPin(name, undefined, ports[name], ctx)),
  ];
}

const ADMIT_DECL: NodeKind['inputs'][number] = {
  name: 'admit',
  type: { t: 'boolean' },
  required: false,
  description: 'Only start the run when this is true.',
};

export function admitPin(admit: PortValue | undefined, ctx: PinContext): ScenePin {
  return {
    ...inputPin('admit', ADMIT_DECL, admit, ctx),
    label: 'Only start if',
  };
}

function declaredOutputs(
  subject: PinSubject,
  referenced: ReadonlySet<string>,
  kinds: NodeKindLookup,
): OutputDecl[] {
  const kind = kinds.get(subject.kind);
  const dynamic = DYNAMIC_OUTPUT_KINDS.has(subject.kind) ? [...referenced] : [];
  return [
    ...(kind?.outputs ?? []).map((decl) => ({ ...decl, group: 'output' as const })),
    ...(FLOW_SCOPE_OUTPUTS[subject.kind] ?? []).map((decl) => ({
      ...decl,
      group: 'inside' as const,
    })),
    ...(subject.outputs ?? []).map((out) => ({
      name: out.name,
      type: out.type ?? ANY,
      group: 'after' as const,
    })),
    ...dynamic.map((name) => ({ name, type: ANY, group: 'output' as const })),
  ];
}

function outputPin(decl: OutputDecl, referenced: ReadonlySet<string>): ScenePin {
  return {
    handle: valueOutHandle(decl.name),
    name: decl.name,
    label: labelOf(decl.name),
    shape: shapeOf(decl.type),
    type: shortTypeName(decl.type),
    group: decl.group,
    value: null,
    wired: referenced.has(decl.name),
  };
}

export function outputPins(
  subject: PinSubject,
  referenced: ReadonlySet<string>,
  ctx: PinContext,
): readonly ScenePin[] {
  const seen = new Set<string>();
  const unique = declaredOutputs(subject, referenced, ctx.kinds).filter((decl) => {
    const repeated = seen.has(decl.name);
    seen.add(decl.name);
    return !repeated;
  });
  return unique.map((decl) => outputPin(decl, referenced));
}

export function programInputPins(
  inputs: readonly InputPort[],
  referenced: ReadonlySet<string>,
): readonly ScenePin[] {
  return inputs.map((input) => ({
    ...outputPin({ name: input.name, type: input.type, group: 'output' }, referenced),
    label: input.label ?? labelOf(input.name),
  }));
}
