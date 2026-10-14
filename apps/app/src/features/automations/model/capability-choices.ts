import {
  numberPresets,
  pickableControls,
  presentDevice,
  type Comparison,
  type DeviceCapability,
  type JsonValue,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export type DeviceLike = Pick<Device, 'id' | 'label' | 'kind' | 'model' | 'capabilities'>;

export type Operator = Comparison['operator'];

export type ValueOperator = Exclude<Operator, 'changed'>;

const EQUALITY: readonly ValueOperator[] = ['eq', 'ne'];

const NUMERIC: readonly ValueOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'];

export const OPERATOR_LABELS: Readonly<Record<Operator, string>> = {
  eq: 'Is',
  ne: 'Is not',
  gt: 'Above',
  gte: 'At least',
  lt: 'Below',
  lte: 'At most',
  between: 'Between',
  changed: 'Changes',
};

export function isReadable(capability: DeviceCapability): boolean {
  return capability.access !== 'write' && capability.value.kind !== 'action';
}

export function isWritable(capability: DeviceCapability): boolean {
  return capability.access !== 'read';
}

const UNPICKABLE_TIERS: ReadonlySet<string> = new Set(['hidden', 'diagnostic']);

export function readableCapabilities(device: DeviceLike): DeviceCapability[] {
  return presentDevice(device)
    .capabilities.filter(
      (presented) => !UNPICKABLE_TIERS.has(presented.tier) && isReadable(presented.capability),
    )
    .map((presented) => presented.capability);
}

export function writableCapabilities(device: DeviceLike): DeviceCapability[] {
  return pickableControls(device).map((presented) => presented.capability);
}

const SCENE_TIERS: ReadonlySet<string> = new Set(['primary', 'control']);

export function sceneCapabilities(device: DeviceLike): DeviceCapability[] {
  const allowed = new Set(writableCapabilities(device).map((capability) => capability.key));
  return presentDevice(device)
    .capabilities.filter(
      (presented) => SCENE_TIERS.has(presented.tier) && allowed.has(presented.capability.key),
    )
    .map((presented) => presented.capability);
}

export function valueOperators(descriptor: ValueDescriptor): readonly ValueOperator[] {
  return descriptor.kind === 'number' ? NUMERIC : EQUALITY;
}

export function triggerOperators(descriptor: ValueDescriptor): readonly Operator[] {
  return [...valueOperators(descriptor), 'changed'];
}

const DEFAULT_COLOUR = { hue: 32, saturation: 52, value: 100 } as const;

export function defaultValue(descriptor: ValueDescriptor): JsonValue {
  switch (descriptor.kind) {
    case 'boolean':
      return true;
    case 'number':
      return numberPresets(descriptor)[2] ?? descriptor.min;
    case 'enum':
      return descriptor.options[0] ?? null;
    case 'color':
      return DEFAULT_COLOUR;
    case 'text':
      return '';
    case 'action':
      return actionDefault(descriptor);
  }
}

function numberOr(value: JsonValue, descriptor: ValueDescriptor): number {
  if (typeof value === 'number') {
    return value;
  }
  return descriptor.kind === 'number' ? descriptor.min : 0;
}

function carriedValue(previous: Comparison | null, descriptor: ValueDescriptor): JsonValue {
  if (previous === null || previous.operator === 'changed') {
    return defaultValue(descriptor);
  }
  return previous.operator === 'between' ? previous.min : previous.value;
}

export type ValueComparison = Extract<Comparison, { operator: ValueOperator }>;

export function valueComparisonFor(
  operator: ValueOperator,
  descriptor: ValueDescriptor,
  previous: Comparison | null,
): ValueComparison {
  const carried = carriedValue(previous, descriptor);
  switch (operator) {
    case 'eq':
    case 'ne':
      return { operator, value: carried };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { operator, value: numberOr(carried, descriptor) };
    case 'between': {
      const min = numberOr(carried, descriptor);
      return { operator, min, max: descriptor.kind === 'number' ? descriptor.max : min };
    }
  }
}

export function comparisonFor(
  operator: Operator,
  descriptor: ValueDescriptor,
  previous: Comparison | null,
): Comparison {
  return operator === 'changed' ? { operator } : valueComparisonFor(operator, descriptor, previous);
}

function actionDefault(descriptor: Extract<ValueDescriptor, { kind: 'action' }>): JsonValue {
  if (descriptor.argumentSchema !== undefined) {
    return {};
  }
  return descriptor.arguments === undefined
    ? null
    : Object.fromEntries(descriptor.arguments.map((name) => [name, '']));
}
