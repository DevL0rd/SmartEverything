import type { DeviceFamily } from '../presentation/types';
import type { ModelDefaults } from './resolve';

export const IR_REMOTE_CATEGORIES = [
  'ac',
  'fan',
  'light',
  'speaker',
  'projector',
  'settop',
  'tv',
  'other',
] as const;

export type IrRemoteCategory = (typeof IR_REMOTE_CATEGORIES)[number];

export const FAMILY_DEFAULT_MODELS: Readonly<Record<DeviceFamily, string>> = {
  air_purifier: 'dev.purifier.generic',
  humidifier: 'dev.humidifier.generic',
  diffuser: 'dev.diffuser.ultrasonic',
  microwave: 'dev.microwave.countertop',
  laundry: 'dev.laundry.washer-front',
  dehumidifier: 'dev.dehumidifier',
  tower_fan: 'dev.fan.tower',
  fan: 'dev.fan.pedestal',
  heater: 'dev.heater.ceramic',
  air_conditioner: 'dev.ac.split-indoor',
  thermostat: 'dev.thermostat.round',
  light: 'dev.light.bulb-a60',
  switch: 'dev.switch.wall-rocker',
  plug: 'dev.plug.wall',
  sensor: 'dev.sensor.multi',
  button: 'dev.button.remote-4key',
  camera: 'dev.camera.dome-indoor',
  doorbell: 'dev.doorbell.video',
  scale: 'dev.scale.glass',
  wearable: 'dev.watch.round',
  television: 'dev.tv.generic',
  speaker: 'dev.speaker.smart',
  lock: 'dev.lock.deadbolt',
  cover: 'dev.cover.roller-blind',
  vacuum: 'dev.vacuum.robot-generic',
  ir_blaster: 'dev.ir.puck',
  ir_remote: 'dev.remote.other',
  gateway: 'dev.gateway.puck',
  computer: 'dev.computer.laptop',
  phone: 'dev.phone.generic',
  router: 'dev.router.generic',
  file_sync: 'dev.service.sync',
  dns_filter: 'dev.service.shield',
  robot: 'dev.robot.desk',
  treadmill: 'dev.treadmill.generic',
  printer: 'dev.printer.inkjet',
  bottle: 'dev.bottle.generic',
  toothbrush: 'dev.toothbrush.generic',
  generic: 'dev.generic.chip',
};

export const IR_CATEGORY_DEFAULT_MODELS: Readonly<Record<IrRemoteCategory, string>> = {
  ac: 'dev.remote.ac',
  fan: 'dev.remote.fan',
  light: 'dev.remote.light',
  speaker: 'dev.remote.speaker',
  projector: 'dev.remote.projector',
  settop: 'dev.remote.settop',
  tv: 'dev.remote.tv',
  other: 'dev.remote.other',
};

export const MODEL_DEFAULTS: ModelDefaults = {
  kindDefaults: new Map(Object.entries(FAMILY_DEFAULT_MODELS)),
  irCategoryDefaults: new Map(Object.entries(IR_CATEGORY_DEFAULT_MODELS)),
};
