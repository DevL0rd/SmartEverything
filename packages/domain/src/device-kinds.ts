import { isStandardCapability, type StandardCapability } from './capabilities';
import type { DeviceKind } from './devices';
import { CLIMATE_FAMILIES, deviceFamily } from './presentation/device-family';
import type { PresentableDevice, PresentableDeviceWithCapabilities } from './presentation/types';

export const DEVICE_KIND_LABELS: Readonly<Record<DeviceKind, string>> = {
  light: 'Light',
  switch: 'Switch',
  plug: 'Plug',
  air_purifier: 'Air purifier',
  humidifier: 'Humidifier',
  dehumidifier: 'Dehumidifier',
  air_conditioner: 'Air conditioner',
  heater: 'Heater',
  fan: 'Fan',
  thermostat: 'Thermostat',
  sensor: 'Sensor',
  camera: 'Camera',
  doorbell: 'Doorbell',
  lock: 'Lock',
  vacuum: 'Vacuum',
  cover: 'Blind',
  television: 'TV',
  speaker: 'Speaker',
  ir_blaster: 'IR blaster',
  ir_remote: 'Remote',
  gateway: 'Hub',
  router: 'Router',
  file_sync: 'File sync',
  dns_filter: 'Ad blocker',
  robot: 'Robot',
  appliance: 'Appliance',
  computer: 'Computer',
  phone: 'Phone',
  other: 'Device',
};

const CLIMATE_READINGS: ReadonlySet<StandardCapability> = new Set([
  'temperature',
  'humidity',
  'pm25',
  'pm10',
  'co2',
  'tvoc',
  'hcho',
  'air_quality_index',
]);

export function isCamera(device: PresentableDevice): boolean {
  const family = deviceFamily(device);
  return family === 'camera' || family === 'doorbell';
}

export function isClimateDevice(device: PresentableDeviceWithCapabilities): boolean {
  const family = deviceFamily(device);
  if (CLIMATE_FAMILIES.has(family)) {
    return true;
  }
  return (
    family === 'sensor' &&
    device.capabilities.some(
      (capability) => isStandardCapability(capability.key) && CLIMATE_READINGS.has(capability.key),
    )
  );
}

export function isClimateAppliance(device: PresentableDeviceWithCapabilities): boolean {
  return isClimateDevice(device) && deviceFamily(device) !== 'sensor';
}

export function isWearable(device: PresentableDevice): boolean {
  return deviceFamily(device) === 'wearable';
}

export function isScale(device: PresentableDevice): boolean {
  return deviceFamily(device) === 'scale';
}

export interface NamedDevice extends PresentableDevice {
  readonly id: string;
  readonly name: string;
  readonly display_name: string | null;
  readonly room_id: string | null;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface NamedRoom {
  readonly id: string;
  readonly name: string;
}

export function baseNameOf(device: Pick<NamedDevice, 'name' | 'display_name'>): string {
  return device.display_name ?? device.name;
}

function sameName(left: NamedDevice, right: NamedDevice): boolean {
  return baseNameOf(left).trim().toLowerCase() === baseNameOf(right).trim().toLowerCase();
}

function roomPrefixed(device: NamedDevice, room: string): string {
  const name = baseNameOf(device);
  const generic = name.trim().toLowerCase() === DEVICE_KIND_LABELS[device.kind].toLowerCase();
  return generic ? `${room} ${name.toLowerCase()}` : `${room} ${name}`;
}

export function roomNameOf(
  device: { readonly room_id: string | null },
  rooms: readonly NamedRoom[],
): string | null {
  return rooms.find((candidate) => candidate.id === device.room_id)?.name ?? null;
}

export function replacedIds(devices: readonly NamedDevice[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const device of devices) {
    const replaces = device.details?.['replaces'];
    if (typeof replaces === 'string') {
      ids.add(replaces);
    }
  }
  return ids;
}

export function displayName(
  device: NamedDevice,
  allDevices: readonly NamedDevice[],
  rooms: readonly NamedRoom[],
): string {
  const replaced = replacedIds(allDevices);
  if (replaced.has(device.id)) {
    return baseNameOf(device);
  }
  const twins = allDevices.filter((other) => !replaced.has(other.id) && sameName(other, device));
  if (twins.length < 2) {
    return baseNameOf(device);
  }
  const room = roomNameOf(device, rooms);
  const peers = twins.filter((other) => roomNameOf(other, rooms) === room);
  const named = room === null ? baseNameOf(device) : roomPrefixed(device, room);
  if (peers.length < 2) {
    return named;
  }
  const ordinal = peers.findIndex((other) => other.id === device.id) + 1;
  return `${named} ${String(ordinal)}`;
}
