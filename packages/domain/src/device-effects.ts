import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { checkValue, JSON_VALUE, type JsonValue, type ValueDescriptor } from './values';
import type { DeviceCapability } from './devices';

export const DEVICE_EFFECT_OPERATION = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), value: JSON_VALUE }),
  z.strictObject({ type: z.literal('add'), value: z.number() }),
]);
export type DeviceEffectOperation = z.infer<typeof DEVICE_EFFECT_OPERATION>;
export const DEVICE_EFFECT = z.strictObject({
  id: z.uuid(),
  runId: z.uuid(),
  nodeId: z.uuid(),
  operation: DEVICE_EFFECT_OPERATION,
  priority: z.int().min(-1000).max(1000),
  order: z.int().nonnegative(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type DeviceEffect = z.infer<typeof DEVICE_EFFECT>;
export const DEVICE_EFFECT_TARGET = z.strictObject({
  device_id: z.uuid(),
  capability: CAPABILITY_KEY,
  base: JSON_VALUE,
  resolved: JSON_VALUE,
  effects: z.array(DEVICE_EFFECT),
  updated_at: z.iso.datetime({ offset: true }),
});
export type DeviceEffectTarget = z.infer<typeof DEVICE_EFFECT_TARGET>;

export function deviceEffectSupport(capability: DeviceCapability): string | null {
  if (capability.access !== 'read_write') return 'This control must support reading and writing.';
  return capability.value.kind === 'action' ? 'Actions cannot be temporary state changes.' : null;
}
export class DeviceEffectValueError extends Error {
  override readonly name = 'DeviceEffectValueError';
  constructor(readonly reason: string) {
    super(reason);
  }
}
export function validateDeviceEffect(
  descriptor: ValueDescriptor,
  operation: DeviceEffectOperation,
): void {
  if (descriptor.kind === 'action')
    throw new DeviceEffectValueError('Actions cannot be temporary state changes.');
  if (operation.type === 'set') {
    if (descriptor.kind !== 'number') checkValue(descriptor, operation.value);
    else if (typeof operation.value !== 'number' || !Number.isFinite(operation.value))
      throw new DeviceEffectValueError('Numeric Set requires a finite number.');
  } else if (descriptor.kind !== 'number')
    throw new DeviceEffectValueError('Only numeric controls support Add.');
}
export function resolveDeviceEffects(
  descriptor: ValueDescriptor,
  base: JsonValue,
  effects: readonly DeviceEffect[],
): JsonValue {
  let value = checkValue(descriptor, base);
  for (const effect of [...effects].sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    validateDeviceEffect(descriptor, effect.operation);
    if (effect.operation.type === 'set') value = effect.operation.value;
    else {
      if (typeof value !== 'number')
        throw new DeviceEffectValueError('Add requires a numeric base.');
      value += effect.operation.value;
      if (!Number.isFinite(value))
        throw new DeviceEffectValueError('Temporary numeric change exceeds finite range.');
    }
  }
  if (descriptor.kind === 'number' && typeof value === 'number') {
    const bounded = Math.min(descriptor.max, Math.max(descriptor.min, value));
    const steps = Number(((descriptor.max - descriptor.min) / descriptor.step).toPrecision(12));
    const maximum = descriptor.min + Math.floor(steps) * descriptor.step;
    value = Math.min(
      maximum,
      descriptor.min + Math.round((bounded - descriptor.min) / descriptor.step) * descriptor.step,
    );
    value = Math.min(descriptor.max, Math.max(descriptor.min, Number(value.toPrecision(12))));
  }
  return checkValue(descriptor, value);
}
