import {
  isFrom,
  staticValueOf,
  type AutomationValueContent,
  type AutomationValueRow,
  type DeviceCapability,
  type InputDeclarationV2,
  type InputV2,
  type JsonValue,
  type OperandV2,
  type ToV2,
  type ValueDescriptor,
  type WeatherMetric,
} from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { defaultValue, readableCapabilities, type DeviceLike } from './capability-choices';

export type Kind = InputDeclarationV2['type'];

export const KIND_LABELS: Readonly<Record<Kind, string>> = {
  flag: 'On / off',
  number: 'Number',
  duration: 'Duration',
  choice: 'Choice',
  text: 'Text',
};

export const KINDS: readonly Kind[] = ['flag', 'number', 'duration', 'choice', 'text'];

function kindOfDescriptor(descriptor: ValueDescriptor): Kind | null {
  switch (descriptor.kind) {
    case 'boolean':
      return 'flag';
    case 'number':
      return descriptor.unit === 'ms' ? 'duration' : 'number';
    case 'enum':
    case 'text':
      return 'text';
    case 'action':
    case 'color':
      return null;
  }
}

export function kindOfValue(content: AutomationValueContent): Kind {
  return content.kind === 'boolean' ? 'flag' : content.kind;
}

export function fits(consumer: Kind, source: Kind): boolean {
  return consumer === source || (consumer === 'text' && source === 'choice');
}

export function defaultLiteral(kind: Kind): JsonValue {
  if (kind === 'flag') return false;
  return kind === 'number' || kind === 'duration' ? 0 : '';
}

type OperandInfo =
  | {
      readonly source: 'device';
      readonly device: DeviceLike;
      readonly capability: DeviceCapability;
      readonly kind: Kind | null;
    }
  | { readonly source: 'value'; readonly row: AutomationValueRow; readonly kind: Kind }
  | { readonly source: 'input'; readonly declared: InputDeclarationV2; readonly kind: Kind }
  | { readonly source: 'weather'; readonly metric: WeatherMetric | 'kind' }
  | { readonly source: 'literal'; readonly kind: Kind }
  | { readonly source: 'missing'; readonly problem: string };

function literalKind(value: JsonValue): Kind {
  if (typeof value === 'boolean') return 'flag';
  return typeof value === 'number' ? 'number' : 'text';
}

export function operandInfo(catalog: Catalog, operand: OperandV2): OperandInfo {
  if ('literal' in operand) return { source: 'literal', kind: literalKind(operand.literal) };
  if ('weather' in operand) return { source: 'weather', metric: operand.weather };
  if ('input' in operand) {
    const declared = catalog.inputs.find((input) => input.name === operand.input);
    return declared === undefined
      ? { source: 'missing', problem: 'This input is not declared any more.' }
      : { source: 'input', declared, kind: declared.type };
  }
  if ('value' in operand) {
    const row = catalog.values.find((value) => value.id === operand.value);
    return row === undefined
      ? { source: 'missing', problem: 'This Value was deleted.' }
      : { source: 'value', row, kind: kindOfValue(row.content) };
  }
  const device = catalog.allDevices.find((candidate) => candidate.id === operand.device);
  const capability = device?.capabilities.find((candidate) => candidate.key === operand.control);
  return device === undefined || capability === undefined
    ? { source: 'missing', problem: 'This device or reading is gone.' }
    : { source: 'device', device, capability, kind: kindOfDescriptor(capability.value) };
}

export function valuesFitting(catalog: Catalog, consumer: Kind): readonly AutomationValueRow[] {
  return catalog.values.filter((row) => fits(consumer, kindOfValue(row.content)));
}

export function inputsFitting(catalog: Catalog, consumer: Kind): readonly InputDeclarationV2[] {
  return catalog.inputs.filter((input) => fits(consumer, input.type));
}

export function readingsFitting(device: DeviceLike, consumer: Kind): readonly DeviceCapability[] {
  return readableCapabilities(device).filter((capability) => {
    const kind = kindOfDescriptor(capability.value);
    return kind !== null && fits(consumer, kind);
  });
}

export function firstReading(
  catalog: Catalog,
  consumer?: Kind,
): { readonly device: DeviceLike; readonly capability: DeviceCapability } | null {
  for (const device of catalog.devices) {
    const capability = (
      consumer === undefined ? readableCapabilities(device) : readingsFitting(device, consumer)
    )[0];
    if (capability !== undefined) return { device, capability };
  }
  return null;
}

export type LiteralShape =
  | { readonly type: 'reading'; readonly device: DeviceLike; readonly capability: DeviceCapability }
  | { readonly type: 'weather'; readonly metric: WeatherMetric }
  | {
      readonly type: 'kind';
      readonly kind: Kind;
      readonly choices?: readonly { readonly id: string; readonly label: string }[];
      readonly unit?: string | null;
    };

export function kindOfShape(shape: LiteralShape): Kind | null {
  if (shape.type === 'reading') return kindOfDescriptor(shape.capability.value);
  return shape.type === 'weather' ? 'number' : shape.kind;
}

export function shapeOfOperand(info: OperandInfo): LiteralShape | null {
  switch (info.source) {
    case 'device':
      return { type: 'reading', device: info.device, capability: info.capability };
    case 'weather':
      return info.metric === 'kind' ? null : { type: 'weather', metric: info.metric };
    case 'value':
      return info.row.content.kind === 'choice'
        ? { type: 'kind', kind: 'choice', choices: info.row.content.choices }
        : { type: 'kind', kind: info.kind };
    case 'input':
    case 'literal':
      return { type: 'kind', kind: info.kind };
    case 'missing':
      return null;
  }
}

export function defaultFor(shape: LiteralShape): JsonValue {
  if (shape.type === 'reading') return defaultValue(shape.capability.value);
  if (shape.type === 'weather') return 0;
  if (shape.kind === 'choice') return shape.choices?.[0]?.id ?? '';
  return defaultLiteral(shape.kind);
}

export function singleInput(to: ToV2 | undefined, fallback: JsonValue): InputV2 {
  if (to === undefined) return fallback;
  if (isFrom(to)) return to;
  const literal = staticValueOf(to);
  return literal === undefined ? fallback : literal;
}

function isFieldMap(to: ToV2): to is Readonly<Record<string, InputV2>> {
  return typeof to === 'object' && to !== null && !Array.isArray(to) && !isFrom(to);
}

export function fieldInputs(to: ToV2 | undefined): Readonly<Record<string, InputV2>> {
  return to !== undefined && isFieldMap(to) ? to : {};
}
