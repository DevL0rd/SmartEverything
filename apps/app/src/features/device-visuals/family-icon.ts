import { deviceFamily, type DeviceFamily, type PresentableDevice } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';

export const FAMILY_ICONS: Readonly<Record<DeviceFamily, IconName>> = {
  air_purifier: 'fan',
  humidifier: 'droplet',
  diffuser: 'flower',
  microwave: 'heater',
  laundry: 'washer',
  dehumidifier: 'droplet',
  tower_fan: 'fan',
  fan: 'fan',
  heater: 'heater',
  air_conditioner: 'snowflake',
  thermostat: 'thermometer',
  light: 'bulb',
  switch: 'power',
  plug: 'plug',
  sensor: 'gauge',
  button: 'circle',
  camera: 'camera',
  doorbell: 'bell',
  scale: 'scale',
  wearable: 'activity',
  television: 'tv',
  speaker: 'speaker',
  lock: 'lock',
  cover: 'blinds',
  vacuum: 'vacuum',
  ir_blaster: 'remote',
  ir_remote: 'remote',
  gateway: 'router',
  router: 'wifi',
  file_sync: 'folderSync',
  dns_filter: 'shield',
  robot: 'bot',
  treadmill: 'footprints',
  printer: 'printer',
  bottle: 'glassWater',
  toothbrush: 'toothbrush',
  computer: 'monitor',
  phone: 'smartphone',
  generic: 'cpu',
};

export function familyIcon(family: DeviceFamily): IconName {
  return FAMILY_ICONS[family];
}

export function deviceIcon(device: PresentableDevice): IconName {
  return familyIcon(deviceFamily(device));
}
