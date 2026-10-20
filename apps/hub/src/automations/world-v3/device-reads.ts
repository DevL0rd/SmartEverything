import {
  CAPABILITY_KEY,
  capabilityOf,
  jsonEquals,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';
import type { WorldReadDeps } from './deps';

const EPOCH = '1970-01-01T00:00:00.000Z';

const DEVICE_GET = z.object({ device: DEVICE_REF, control: z.string().min(1) });

interface ControlChange {
  readonly previous?: JsonValue;
  readonly changedAt: string;
}

export function controlKey(control: string): CapabilityKey {
  const parsed = CAPABILITY_KEY.safeParse(control);
  if (!parsed.success) {
    throw new ReadFailure('Invalid', `${control} is not a control a device can have`);
  }
  return parsed.data;
}

export function readableControl(device: DeviceRow, control: string): DeviceCapability {
  const capability = capabilityOf(device, controlKey(control));
  if (capability === undefined) {
    throw new ReadFailure('NotFound', `${device.name} has no ${control} control`);
  }
  if (capability.access === 'write' || capability.value.kind === 'action') {
    throw new ReadFailure('Invalid', `${control} of ${device.name} cannot be read`);
  }
  return capability;
}

export function hasReadableControl(device: DeviceRow, key: CapabilityKey): boolean {
  const capability = capabilityOf(device, key);
  return (
    capability !== undefined && capability.access !== 'write' && capability.value.kind !== 'action'
  );
}

export function controlValue(
  deps: WorldReadDeps,
  device: DeviceRow,
  control: string,
): JsonValue | undefined {
  const { store, executor, observed } = deps;
  const effect = store.deviceEffects.find(device.id, control);
  if (effect !== undefined) return effect.base;
  const current = observed(device.id, control);
  if (executor.intendedValue(device.id, control) === undefined) return current;
  const row = store.state.ofDevice(device.id).find((entry) => entry.capability === control);
  return executor.intendedValue(device.id, control, row?.observed_at) ?? current;
}

export function lastChange(
  deps: WorldReadDeps,
  deviceId: string,
  control: string,
  value: JsonValue | undefined,
): ControlChange | undefined {
  if (value === undefined) return undefined;
  const [latest, before] = deps.store.state.history({
    capabilities: [control],
    deviceIds: [deviceId],
    from: EPOCH,
    order: 'desc',
    limit: 2,
  });
  if (latest === undefined || !jsonEquals(latest.value, value)) return undefined;
  return {
    changedAt: latest.observed_at,
    ...(before === undefined ? {} : { previous: before.value }),
  };
}

export function deviceReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.get': (inputs): ReadResult => {
      const { device: id, control } = parseInputs('device.get', DEVICE_GET, inputs);
      const device = deviceById(deps.store, id);
      readableControl(device, control);
      const value = controlValue(deps, device, controlKey(control));
      const change = lastChange(deps, device.id, control, value);
      const sinceMs =
        change === undefined
          ? undefined
          : deps.clock.now().getTime() - Date.parse(change.changedAt);
      return outputsOf({
        value: value ?? null,
        reading: value,
        previous: change?.previous,
        changedAt: change?.changedAt,
        inStateFor: sinceMs === undefined ? undefined : Math.max(0, sinceMs),
        available: device.online,
      });
    },
  };
}
