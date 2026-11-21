import {
  CAPABILITY_KEY,
  capabilityOf,
  jsonEquals,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceRow,
  type HistoryRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadResult,
  type ReadScope,
} from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';
import type { WorldReadDeps } from './deps';

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
  const { world, executor, observed } = deps;
  const effect = world.deviceEffects.find(device.id, control);
  if (effect !== undefined) return effect.base;
  const current = observed(device.id, control);
  if (executor.intendedValue(device.id, control) === undefined) return current;
  const row = world.state.ofDevice(device.id).find((entry) => entry.capability === control);
  return executor.intendedValue(device.id, control, row?.observed_at) ?? current;
}

export function rowsOf(
  found: Readonly<Record<string, readonly HistoryRow[]>>,
  deviceId: string,
): readonly HistoryRow[] {
  const rows = found[deviceId];
  if (rows === undefined) {
    throw new ReadFailure('Failed', `The history of ${deviceId} did not come back`);
  }
  return rows;
}

export function recentChanges(
  scope: Pick<ReadScope, 'fetch'>,
  deviceIds: readonly string[],
  control: string,
): Readonly<Record<string, readonly HistoryRow[]>> {
  return deviceIds.length === 0
    ? {}
    : scope.fetch('worldLatest', { capability: control, deviceIds, limit: 2 });
}

export function lastChange(
  recent: readonly HistoryRow[],
  value: JsonValue | undefined,
): ControlChange | undefined {
  if (value === undefined) return undefined;
  const [latest, before] = recent;
  if (latest === undefined || !jsonEquals(latest.value, value)) return undefined;
  return {
    changedAt: latest.observed_at,
    ...(before === undefined ? {} : { previous: before.value }),
  };
}

export function deviceReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.get': (inputs, scope): ReadResult => {
      const { device: id, control } = parseInputs('device.get', DEVICE_GET, inputs);
      const device = deviceById(deps.world, id);
      readableControl(device, control);
      const value = controlValue(deps, device, controlKey(control));
      const change =
        value === undefined
          ? undefined
          : lastChange(rowsOf(recentChanges(scope, [device.id], control), device.id), value);
      const sinceMs =
        change === undefined ? undefined : scope.now().getTime() - Date.parse(change.changedAt);
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
