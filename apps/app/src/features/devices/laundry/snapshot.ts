import {
  isLaundryValueRole,
  type CapabilityKey,
  type CapabilityRole,
  type DevicePresentation,
  type JsonValue,
  type LaundryValues,
} from '@smarteverything/domain';
import { sameJson } from '../../../store/same-json';
import type { DeviceValues } from '../../../store/state';

interface LaundryStamps {
  readonly status: string | null;
  readonly remaining: string | null;
  readonly delay: string | null;
}

export interface LaundrySnapshot {
  readonly values: LaundryValues;
  readonly online: boolean;
  readonly stamps: LaundryStamps;
}

export function snapshotOf(
  presentation: DevicePresentation,
  values: DeviceValues,
  online: boolean,
): LaundrySnapshot {
  const read: Partial<Record<CapabilityRole, JsonValue>> = {};
  const stamps: { status: string | null; remaining: string | null; delay: string | null } = {
    status: null,
    remaining: null,
    delay: null,
  };
  for (const { key, role } of presentation.capabilities) {
    const entry = values[key];
    if (entry === undefined || !isLaundryValueRole(role)) {
      continue;
    }
    read[role] = entry.value;
    if (role === 'laundry_status') {
      stamps.status = entry.observedAt;
    } else if (role === 'remaining_minutes') {
      stamps.remaining = entry.observedAt;
    } else if (role === 'delay_minutes') {
      stamps.delay = entry.observedAt;
    }
  }
  return { values: read, online, stamps };
}

export function sameSnapshot(left: LaundrySnapshot, right: LaundrySnapshot): boolean {
  return left.online === right.online && sameJson(left.values, right.values);
}

export function keyOfRole(
  presentation: DevicePresentation,
  role: CapabilityRole,
): CapabilityKey | undefined {
  return presentation.capabilities.find((presented) => presented.role === role)?.key;
}

export function rolesOf(presentation: DevicePresentation): ReadonlySet<CapabilityRole> {
  const roles = new Set<CapabilityRole>();
  for (const { role } of presentation.capabilities) {
    if (role !== null) {
      roles.add(role);
    }
  }
  return roles;
}
