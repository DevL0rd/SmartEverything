import type { DeviceFamily } from '@smarteverything/domain';

export interface FamilyGroup {
  readonly one: string;
  readonly many: string;
}

function group(one: string, many = `${one}s`): FamilyGroup {
  return { one, many };
}

export const FAMILY_GROUPS: Readonly<Record<DeviceFamily, FamilyGroup>> = {
  air_purifier: group('Air purifier'),
  humidifier: group('Humidifier'),
  diffuser: group('Scent diffuser'),
  microwave: group('Microwave'),
  laundry: group('Laundry'),
  dehumidifier: group('Dehumidifier'),
  tower_fan: group('Fan'),
  fan: group('Fan'),
  heater: group('Heater'),
  air_conditioner: group('Air conditioner'),
  thermostat: group('Thermostat'),
  light: group('Light'),
  switch: group('Switch', 'Switches'),
  plug: group('Plug'),
  sensor: group('Sensor'),
  button: group('Button'),
  camera: group('Camera'),
  doorbell: group('Doorbell'),
  scale: group('Scale'),
  wearable: group('Watch', 'Watches'),
  television: group('TV'),
  speaker: group('Speaker'),
  lock: group('Lock'),
  cover: group('Blind'),
  vacuum: group('Vacuum'),
  ir_blaster: group('IR blaster'),
  ir_remote: group('Remote'),
  gateway: group('Hub'),
  router: group('Network'),
  file_sync: group('File sync'),
  dns_filter: group('Network'),
  robot: group('Robot'),
  treadmill: group('Treadmill'),
  printer: group('Printer'),
  bottle: group('Water bottle'),
  toothbrush: group('Toothbrush'),
  computer: group('Computer'),
  phone: group('Phone'),
  generic: group('Other device'),
};
