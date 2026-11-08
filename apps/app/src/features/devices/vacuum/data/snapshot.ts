import {
  VACUUM_FAULT_KEY,
  VACUUM_MAP_KEY,
  vacuumValuesOf,
  type CapabilityKey,
  type CapabilityRole,
  type DevicePresentation,
  type JsonValue,
  type VacuumValues,
} from '@smarteverything/domain';
import { sameJson } from '../../../../store/same-json';
import type { DeviceValues } from '../../../../store/state';

export interface VacuumSnapshot {
  readonly values: VacuumValues;
  readonly online: boolean;
  readonly mapVersionText: JsonValue | undefined;
  readonly faultText: JsonValue | undefined;
  readonly statusObservedAt: string | null;
}

export function snapshotOf(
  presentation: DevicePresentation,
  values: DeviceValues,
  online: boolean,
): VacuumSnapshot {
  const status = presentation.capabilities.find((presented) => presented.role === 'vacuum_status');
  return {
    values: vacuumValuesOf(presentation.capabilities, (key) => values[key]?.value),
    online,
    mapVersionText: values[VACUUM_MAP_KEY]?.value,
    faultText: values[VACUUM_FAULT_KEY]?.value,
    statusObservedAt: status === undefined ? null : (values[status.key]?.observedAt ?? null),
  };
}

export function sameSnapshot(left: VacuumSnapshot, right: VacuumSnapshot): boolean {
  return (
    left.online === right.online &&
    left.statusObservedAt === right.statusObservedAt &&
    sameJson(left.mapVersionText ?? null, right.mapVersionText ?? null) &&
    sameJson(left.faultText ?? null, right.faultText ?? null) &&
    sameJson(left.values, right.values)
  );
}

export function keyOfRole(
  presentation: DevicePresentation,
  role: CapabilityRole,
): CapabilityKey | undefined {
  return presentation.capabilities.find((presented) => presented.role === role)?.key;
}
