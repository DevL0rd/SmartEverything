import { CAPABILITY_CATALOGUE, isStandardCapability } from './capabilities';
import { presentCapability } from './capability-presentation';
import { DEVICE_KIND_LABELS } from './device-kinds';
import type { DeviceCapability, DeviceKind } from './devices';
import { InvalidValueError, checkValue } from './values';
import { decimalsOf, formatValue } from './value-format';
import type { JsonValue, ValueDescriptor } from './values';

export type SearchGroup =
  'action' | 'device' | 'room' | 'setting' | 'scene' | 'page' | 'automation';

export type SearchTarget =
  | {
      readonly kind: 'command';
      readonly deviceId: string;
      readonly capability: string;
      readonly value: JsonValue;
    }
  | { readonly kind: 'device'; readonly deviceId: string }
  | { readonly kind: 'room'; readonly roomId: string }
  | { readonly kind: 'page'; readonly path: string }
  | { readonly kind: 'setting'; readonly settingId: string; readonly value: JsonValue }
  | { readonly kind: 'scene'; readonly sceneId: string }
  | { readonly kind: 'automation'; readonly automationId: string; readonly enabled: boolean }
  | { readonly kind: 'device-page'; readonly deviceId: string; readonly focus: string | null }
  | { readonly kind: 'camera'; readonly deviceId: string; readonly talk: boolean };

export interface SearchEntry {
  readonly id: string;
  readonly group: SearchGroup;
  readonly title: string;
  readonly detail: string;
  readonly keywords: readonly string[];
  readonly state: string | null;
  readonly run: SearchTarget | null;
  readonly runLabel: string | null;
  readonly open: SearchTarget;
  readonly openLabel: string;
  readonly suggested: boolean;
}

export interface SearchDevice {
  readonly id: string;
  readonly name: string;
  readonly room: string | null;
  readonly kind: DeviceKind;
  readonly model: string;
  readonly online: boolean;
  readonly favourite: boolean;
  readonly capabilities: readonly DeviceCapability[];
  readonly state: Readonly<Record<string, JsonValue>>;
}

export interface SearchRoom {
  readonly id: string;
  readonly name: string;
  readonly deviceCount: number;
}

export interface SearchPage {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export interface SearchSetting {
  readonly id: string;
  readonly title: string;
  readonly section: string;
  readonly keywords: readonly string[];
  readonly state: string | null;
  readonly value: JsonValue | undefined;
  readonly runLabel: string;
  readonly path: string;
}

export interface SearchScene {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface SearchAutomation {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly path: string;
}

export interface SearchIrButton {
  readonly button: string;
  readonly format: string;
  readonly code: string;
}

export interface SearchIrRemote {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string | null;
  readonly blasterId: string;
  readonly pageDeviceId: string;
  readonly buttons: readonly SearchIrButton[];
}

export interface SearchCamera {
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceKind;
  readonly room: string | null;
  readonly online: boolean;
  readonly twoWayAudio: boolean;
}

export interface SearchSources {
  readonly devices: readonly SearchDevice[];
  readonly rooms: readonly SearchRoom[];
  readonly pages: readonly SearchPage[];
  readonly settings: readonly SearchSetting[];
  readonly scenes: readonly SearchScene[];
  readonly automations: readonly SearchAutomation[];
  readonly irRemotes: readonly SearchIrRemote[];
  readonly cameras: readonly SearchCamera[];
}

export interface NumberTemplate {
  readonly device: SearchDevice;
  readonly capability: DeviceCapability;
  readonly descriptor: Extract<ValueDescriptor, { kind: 'number' }>;
}

export interface SearchIndex {
  readonly entries: readonly SearchEntry[];
  readonly numbers: readonly NumberTemplate[];
}

function readingOf(device: SearchDevice): string | null {
  for (const capability of device.capabilities) {
    const value = device.state[capability.key];
    if (
      capability.key !== 'power' &&
      isStandardCapability(capability.key) &&
      value !== undefined &&
      capability.value.kind !== 'action'
    ) {
      return formatValue(capability.key, capability.value, value);
    }
  }
  return null;
}

export function deviceSummary(device: SearchDevice): string {
  if (!device.online) {
    return 'Offline';
  }
  const power = device.state['power'];
  const reading = readingOf(device);
  const parts = [typeof power === 'boolean' ? (power ? 'On' : 'Off') : null, reading];
  const shown = parts.filter((part): part is string => part !== null);
  return shown.length === 0 ? 'No reading yet' : shown.join(' · ');
}

export function numberPresets(descriptor: Extract<ValueDescriptor, { kind: 'number' }>): number[] {
  const span = descriptor.max - descriptor.min;
  const found: number[] = [];
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const steps = Math.round((span * fraction) / descriptor.step);
    const value = Number(
      (descriptor.min + steps * descriptor.step).toFixed(decimalsOf(descriptor.step)),
    );
    if (value <= descriptor.max && !found.includes(value)) {
      found.push(value);
    }
  }
  return found;
}

export function accepts(descriptor: ValueDescriptor, value: JsonValue): boolean {
  try {
    checkValue(descriptor, value);
    return true;
  } catch (error) {
    if (error instanceof InvalidValueError) {
      return false;
    }
    throw error;
  }
}

export function keywordsOf(device: SearchDevice, capability: DeviceCapability): readonly string[] {
  const presented = presentCapability(device, capability);
  const catalogued = isStandardCapability(capability.key)
    ? CAPABILITY_CATALOGUE[capability.key].keywords
    : [];
  return [
    device.name,
    DEVICE_KIND_LABELS[device.kind],
    device.room ?? '',
    capability.label,
    presented.label,
    presented.groupLabel,
    ...(presented.keywords ?? []),
    capability.key.replaceAll('_', ' '),
    ...catalogued,
  ].filter((word) => word !== '');
}

export function detailOf(device: SearchDevice): string {
  return device.room === null ? device.name : `${device.room} · ${device.name}`;
}

export function describeCommandValue(
  capability: DeviceCapability | undefined,
  command: { readonly capability: string; readonly value: JsonValue },
): string {
  if (capability === undefined) {
    return `${command.capability} → ${JSON.stringify(command.value)}`;
  }
  if (capability.value.kind === 'action') {
    return capability.label;
  }
  return `${capability.label} → ${formatValue(capability.key, capability.value, command.value)}`;
}
