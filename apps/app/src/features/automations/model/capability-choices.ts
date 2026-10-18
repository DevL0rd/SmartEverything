import {
  numberPresets,
  pickableControls,
  presentDevice,
  type DeviceCapability,
  type JsonValue,
  type TriggerTestV2,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export type DeviceLike = Pick<Device, 'id' | 'label' | 'kind' | 'model' | 'capabilities'>;

export type TestOperator = TriggerTestV2['is'];

const EQUALITY: readonly TestOperator[] = ['eq', 'ne'];

const NUMERIC: readonly TestOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'];

export const OPERATOR_LABELS: Readonly<Record<TestOperator, string>> = {
  eq: 'Is',
  ne: 'Is not',
  gt: 'Above',
  gte: 'At least',
  lt: 'Below',
  lte: 'At most',
  between: 'Between',
  in: 'Is one of',
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

export function valueOperators(descriptor: ValueDescriptor): readonly TestOperator[] {
  return descriptor.kind === 'number' ? NUMERIC : EQUALITY;
}

export function triggerOperators(descriptor: ValueDescriptor): readonly TestOperator[] {
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

function actionDefault(descriptor: Extract<ValueDescriptor, { kind: 'action' }>): JsonValue {
  if (descriptor.argumentSchema !== undefined) {
    return {};
  }
  return descriptor.arguments === undefined
    ? null
    : Object.fromEntries(descriptor.arguments.map((name) => [name, '']));
}

export interface TestSeed {
  readonly fallback: JsonValue;
  readonly min?: number;
  readonly max?: number;
}

export function seedOf(descriptor: ValueDescriptor): TestSeed {
  return descriptor.kind === 'number'
    ? { fallback: defaultValue(descriptor), min: descriptor.min, max: descriptor.max }
    : { fallback: defaultValue(descriptor) };
}

function carriedValue(previous: TriggerTestV2 | undefined, seed: TestSeed): JsonValue {
  if (previous === undefined || previous.is === 'changed') return seed.fallback;
  if (previous.is === 'between') return previous.min;
  return previous.is === 'in' ? (previous.to[0] ?? seed.fallback) : previous.to;
}

function numberOr(value: JsonValue, seed: TestSeed): number {
  return typeof value === 'number' ? value : (seed.min ?? 0);
}

export function testFor(
  operator: TestOperator,
  seed: TestSeed,
  previous?: TriggerTestV2,
): TriggerTestV2 {
  if (operator === 'changed') return { is: operator };
  const carried = carriedValue(previous, seed);
  if (operator === 'between') {
    const min = numberOr(carried, seed);
    return { is: operator, min, max: Math.max(min, seed.max ?? min) };
  }
  if (operator === 'in') return { is: operator, to: [carried] };
  return operator === 'eq' || operator === 'ne'
    ? { is: operator, to: carried }
    : { is: operator, to: numberOr(carried, seed) };
}

export type BetweenTest = Extract<TriggerTestV2, { is: 'between' }>;

export function betweenFrom(test: BetweenTest, min: number): BetweenTest {
  return { ...test, min, max: Math.max(min, test.max) };
}

export function betweenTo(test: BetweenTest, max: number): BetweenTest {
  return { ...test, max, min: Math.min(max, test.min) };
}
