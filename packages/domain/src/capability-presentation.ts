import { CAPABILITY_CATALOGUE, isStandardCapability, type CapabilityGroup } from './capabilities';
import type { DeviceCapability } from './devices';
import { dangerOf } from './presentation/danger';
import { deviceFamily } from './presentation/device-family';
import { friendlyUnit, humanizeEnum, providerLabelOf, serviceOf } from './presentation/humanize';
import { KIND_OVERRIDES, MODEL_OVERRIDES } from './presentation/overrides/index';
import {
  CAPABILITY_GROUP_LABELS,
  READ_ONLY_STANDARD,
  ROLE_ORDER,
  STANDARD_TIERS,
} from './presentation/standard';
import {
  PRESENTATION_TIERS,
  type CapabilityOverride,
  type CapabilityPresentation,
  type CapabilityRole,
  type DevicePresentation,
  type EnumOption,
  type PresentableDevice,
  type PresentableDeviceWithCapabilities,
  type PresentationTier,
  type PresentedCapability,
} from './presentation/types';
import { decimalsOf, formatValue, withUnit } from './value-format';
import type { JsonValue } from './values';

const DIAGNOSTIC_LABEL =
  /device information|heartbeat|debug|country[\s-]?code|serial|reboot|rfid|qrcode|firmware/i;

const HIDDEN_ACTION = /toggle|webrtc|p2p|stream/i;

function overrideFor(device: PresentableDevice, key: string): CapabilityOverride | undefined {
  return MODEL_OVERRIDES[device.model]?.capabilities[key] ?? KIND_OVERRIDES[device.kind]?.[key];
}

function rawTier(capability: DeviceCapability): PresentationTier {
  if (DIAGNOSTIC_LABEL.test(capability.label)) {
    return 'diagnostic';
  }
  return capability.value.kind === 'action' && HIDDEN_ACTION.test(capability.label)
    ? 'hidden'
    : 'extra';
}

function tierOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): PresentationTier {
  if (override !== undefined) {
    return override.tier;
  }
  return isStandardCapability(capability.key)
    ? STANDARD_TIERS[capability.key]
    : rawTier(capability);
}

function groupOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): CapabilityGroup {
  if (override?.group !== undefined) {
    return override.group;
  }
  return isStandardCapability(capability.key)
    ? CAPABILITY_CATALOGUE[capability.key].group
    : 'system';
}

function groupLabelOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): string {
  if (override?.group !== undefined || isStandardCapability(capability.key)) {
    return CAPABILITY_GROUP_LABELS[groupOf(capability, override)];
  }
  return serviceOf(capability.label) ?? CAPABILITY_GROUP_LABELS.system;
}

function labelOf(capability: DeviceCapability, override: CapabilityOverride | undefined): string {
  if (override !== undefined) {
    return override.label;
  }
  return isStandardCapability(capability.key)
    ? CAPABILITY_CATALOGUE[capability.key].label
    : providerLabelOf(capability.label);
}

function optionsOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): readonly EnumOption[] {
  if (capability.value.kind !== 'enum') {
    return [];
  }
  return capability.value.options.map((value) => ({
    value,
    label: override?.options?.[value] ?? humanizeEnum(value),
  }));
}

function unitOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): string | null {
  if (override?.unit !== undefined) {
    return override.unit;
  }
  return capability.value.kind === 'number' ? friendlyUnit(capability.value.unit) : null;
}

function writableOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): boolean {
  const readOnly =
    override?.readOnly === true ||
    (isStandardCapability(capability.key) && READ_ONLY_STANDARD.has(capability.key));
  return capability.access !== 'read' && !readOnly;
}

function roleOf(
  capability: DeviceCapability,
  override: CapabilityOverride | undefined,
): CapabilityRole | null {
  if (override?.role !== undefined) {
    return override.role;
  }
  return isStandardCapability(capability.key) ? capability.key : null;
}

export function presentCapability(
  device: PresentableDevice,
  capability: DeviceCapability,
): CapabilityPresentation {
  const override = overrideFor(device, capability.key);
  return {
    key: capability.key,
    label: labelOf(capability, override),
    group: groupOf(capability, override),
    groupLabel: groupLabelOf(capability, override),
    tier: tierOf(capability, override),
    role: roleOf(capability, override),
    danger: override?.danger ?? dangerOf(capability),
    writable: writableOf(capability, override),
    options: optionsOf(capability, override),
    unit: unitOf(capability, override),
    states: override?.states ?? null,
    clock: override?.clock ?? null,
  };
}

function rankOf(presented: PresentedCapability): number {
  const role = presented.role === null ? -1 : ROLE_ORDER.indexOf(presented.role);
  return role < 0 ? ROLE_ORDER.length : role;
}

function byTierAndRole(
  left: { readonly presented: PresentedCapability; readonly index: number },
  right: { readonly presented: PresentedCapability; readonly index: number },
): number {
  return (
    PRESENTATION_TIERS.indexOf(left.presented.tier) -
      PRESENTATION_TIERS.indexOf(right.presented.tier) ||
    rankOf(left.presented) - rankOf(right.presented) ||
    left.index - right.index
  );
}

export function presentDevice(device: PresentableDeviceWithCapabilities): DevicePresentation {
  const presented = device.capabilities.map((capability, index) => ({
    presented: { ...presentCapability(device, capability), capability },
    index,
  }));
  return {
    family: deviceFamily(device),
    capabilities: presented.sort(byTierAndRole).map((entry) => entry.presented),
  };
}

export const CURATED_CONTROL_LIMIT = 6;

export function curatedControls(
  device: PresentableDeviceWithCapabilities,
): readonly PresentedCapability[] {
  return presentDevice(device)
    .capabilities.filter(
      (presented) =>
        presented.tier === 'primary' && presented.writable && presented.role !== 'power',
    )
    .slice(0, CURATED_CONTROL_LIMIT);
}

const UNPICKABLE_TIERS: ReadonlySet<PresentationTier> = new Set(['hidden', 'diagnostic']);

export function pickableControls(
  device: PresentableDeviceWithCapabilities,
): readonly PresentedCapability[] {
  return presentDevice(device).capabilities.filter(
    (presented) =>
      !UNPICKABLE_TIERS.has(presented.tier) &&
      presented.writable &&
      presented.danger.tier === 'none' &&
      presented.capability.access !== 'read',
  );
}

export function inTier(
  presentation: DevicePresentation,
  tier: PresentationTier,
): readonly PresentedCapability[] {
  return presentation.capabilities.filter((presented) => presented.tier === tier);
}

export function withRole(
  presentation: DevicePresentation,
  role: CapabilityRole,
): PresentedCapability | undefined {
  return presentation.capabilities.find((presented) => presented.role === role);
}

function stateOf(presented: PresentedCapability, value: JsonValue): string | null {
  if (presented.states === null || typeof value !== 'boolean') {
    return null;
  }
  return value ? presented.states[0] : presented.states[1];
}

export function presentValue(presented: PresentedCapability, value: JsonValue): string {
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'enum' && typeof value === 'string') {
    return presented.options.find((option) => option.value === value)?.label ?? humanizeEnum(value);
  }
  if (descriptor.kind === 'number' && typeof value === 'number') {
    return withUnit(value.toFixed(decimalsOf(descriptor.step)), presented.unit);
  }
  if (descriptor.kind === 'action') {
    return presented.label;
  }
  return (
    stateOf(presented, value) ?? formatValue(presented.role ?? presented.key, descriptor, value)
  );
}
