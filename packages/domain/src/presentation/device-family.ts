import type { DeviceKind } from '../devices';
import { MODEL_OVERRIDES } from './overrides/index';
import type { DeviceFamily, PresentableDevice } from './types';

const KIND_FAMILIES: Readonly<Record<DeviceKind, DeviceFamily>> = {
  light: 'light',
  switch: 'switch',
  plug: 'plug',
  air_purifier: 'air_purifier',
  humidifier: 'humidifier',
  dehumidifier: 'dehumidifier',
  air_conditioner: 'air_conditioner',
  heater: 'heater',
  fan: 'fan',
  thermostat: 'thermostat',
  sensor: 'sensor',
  camera: 'camera',
  doorbell: 'doorbell',
  lock: 'lock',
  vacuum: 'vacuum',
  cover: 'cover',
  television: 'television',
  speaker: 'speaker',
  ir_blaster: 'ir_blaster',
  ir_remote: 'ir_remote',
  gateway: 'gateway',
  router: 'router',
  file_sync: 'file_sync',
  dns_filter: 'dns_filter',
  robot: 'robot',
  computer: 'computer',
  phone: 'phone',
  appliance: 'generic',
  other: 'generic',
};

const MODEL_FAMILIES: readonly (readonly [RegExp, DeviceFamily])[] = [
  [/\.scales?\./, 'scale'],
  [/^miwear\.|\.watch\.|\.band\./, 'wearable'],
];

export function deviceFamily(device: PresentableDevice): DeviceFamily {
  const override = MODEL_OVERRIDES[device.model];
  if (override !== undefined) {
    return override.family;
  }
  const byModel = MODEL_FAMILIES.find(([pattern]) => pattern.test(device.model));
  return byModel === undefined ? KIND_FAMILIES[device.kind] : byModel[1];
}

const SLEEPY_FAMILIES: ReadonlySet<DeviceFamily> = new Set(['scale', 'wearable']);

export function sleepsBetweenUse(device: PresentableDevice): boolean {
  return SLEEPY_FAMILIES.has(deviceFamily(device));
}

export const CLIMATE_FAMILIES: ReadonlySet<DeviceFamily> = new Set([
  'air_purifier',
  'humidifier',
  'dehumidifier',
  'tower_fan',
  'fan',
  'heater',
  'air_conditioner',
  'thermostat',
]);
