import {
  decimalsOf,
  presentDevice,
  presentValue,
  withRole,
  type CapabilityRole,
  type DevicePresentation,
  type JsonValue,
  type PresentableDeviceWithCapabilities,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { VisualReading } from '../types';

interface ObservedValue {
  readonly value: JsonValue;
  readonly observedAt: string;
}

export type ObservedValues = Readonly<Record<string, ObservedValue>>;

export interface Lookup {
  readonly presentation: DevicePresentation;
  readonly values: ObservedValues;
}

export function lookupOf(
  device: PresentableDeviceWithCapabilities,
  values: ObservedValues,
): Lookup {
  return { presentation: presentDevice(device), values };
}

function observed(lookup: Lookup, role: CapabilityRole): ObservedValue | null {
  const presented = withRole(lookup.presentation, role);
  return presented === undefined ? null : (lookup.values[presented.key] ?? null);
}

export function valueOf(lookup: Lookup, role: CapabilityRole): JsonValue {
  return observed(lookup, role)?.value ?? null;
}

export function textOf(lookup: Lookup, role: CapabilityRole): string | null {
  const value = valueOf(lookup, role);
  return typeof value === 'string' ? value : null;
}

export function numberOf(lookup: Lookup, role: CapabilityRole): number | null {
  const value = valueOf(lookup, role);
  if (typeof value === 'number') {
    return value;
  }
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function flagOf(lookup: Lookup, role: CapabilityRole): boolean | null {
  const value = valueOf(lookup, role);
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  return null;
}

function clampShare(share: number): number {
  return Math.min(1, Math.max(0, share));
}

function enumShare(presented: PresentedCapability, value: JsonValue): number | null {
  const index = presented.options.findIndex((option) => option.value === value);
  return index < 0 ? null : (index + 1) / presented.options.length;
}

export function shareOf(lookup: Lookup, role: CapabilityRole): number | null {
  const presented = withRole(lookup.presentation, role);
  const value = presented === undefined ? null : lookup.values[presented.key]?.value;
  if (presented === undefined || value === undefined || value === null) {
    return null;
  }
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'enum') {
    return enumShare(presented, value);
  }
  if (descriptor.kind !== 'number' || typeof value !== 'number') {
    return null;
  }
  const span = descriptor.max - descriptor.min;
  return span > 0 ? clampShare((value - descriptor.min) / span) : null;
}

function readingFrom(presented: PresentedCapability, found: ObservedValue): VisualReading {
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'number' && typeof found.value === 'number') {
    return {
      text: found.value.toFixed(decimalsOf(descriptor.step)),
      unit: presented.unit,
      at: found.observedAt,
    };
  }
  return { text: presentValue(presented, found.value), unit: null, at: found.observedAt };
}

export function readingOf(lookup: Lookup, roles: readonly CapabilityRole[]): VisualReading | null {
  for (const role of roles) {
    const presented = withRole(lookup.presentation, role);
    const found = presented === undefined ? undefined : lookup.values[presented.key];
    if (presented !== undefined && found !== undefined && found.value !== null) {
      return readingFrom(presented, found);
    }
  }
  return null;
}
