import {
  groupTargets,
  presentDevice,
  roomLightTargets,
  targetState,
  type DeviceScope,
  type JsonValue,
  type TargetEntry,
  type TargetReadings,
  type TargetState,
} from '@smarteverything/domain';
import { deviceHidden } from '../../../server/person-scope';
import { deviceIdReachable } from '../../../server/person-scope-units';
import { storeUnit } from '../../../store/host/unit';
import type { HostStore } from '../../../store/host/host-store';

export interface TargetSummary extends TargetEntry {
  readonly state: TargetState;
}

function readingsOf(store: HostStore): TargetReadings {
  const byDevice = new Map<string, Record<string, { readonly value: JsonValue }>>();
  for (const row of store.state.list()) {
    const readings = byDevice.get(row.device_id) ?? {};
    readings[row.capability] = { value: row.value };
    byDevice.set(row.device_id, readings);
  }
  return (deviceId) => byDevice.get(deviceId);
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right);
}

export function deviceGroupSummaries(
  store: HostStore,
  scope: DeviceScope | null,
): readonly TargetSummary[] {
  const devices = store.devices.list().filter((device) => !deviceHidden(scope, device));
  const readings = readingsOf(store);
  const groups = store.deviceGroups
    .list()
    .filter((group) => group.device_ids.every((id) => deviceIdReachable(store, scope, id)));
  return [
    ...groupTargets(devices, groups),
    ...roomLightTargets(devices, store.rooms.list(), compareNames),
  ].map((entry) => ({
    ...entry,
    state: targetState(entry.members, readings, presentDevice),
  }));
}

export const MCP_DEVICE_GROUP_SUMMARIES_UNIT = storeUnit(deviceGroupSummaries);
