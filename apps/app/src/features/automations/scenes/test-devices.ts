import type {
  AccessMode,
  CapabilityKey,
  DeviceCapability,
  ValueDescriptor,
} from '@smarteverything/domain';
import type { DeviceLike } from '../shared/capability-choices';

export const PURIFIER = '10000000-0000-4000-8000-000000000001';
export const LAMP = '10000000-0000-4000-8000-000000000002';
export const DOOR = '10000000-0000-4000-8000-000000000003';
export const LEAK = '10000000-0000-4000-8000-000000000004';
export const SENSOR = '10000000-0000-4000-8000-000000000005';
const REMOTE = '10000000-0000-4000-8000-000000000006';

export function capability(
  key: CapabilityKey,
  label: string,
  access: AccessMode,
  value: ValueDescriptor,
): DeviceCapability {
  return { key, label, access, value };
}

const POWER = capability('power', 'Power', 'read_write', { kind: 'boolean' });

function device(
  id: string,
  label: string,
  kind: DeviceLike['kind'],
  capabilities: DeviceCapability[],
): DeviceLike {
  return { id, label, kind, model: 'test.model', capabilities };
}

export const purifier = device(PURIFIER, 'Bedroom purifier', 'air_purifier', [
  POWER,
  capability('purifier_mode', 'Purifier mode', 'read_write', {
    kind: 'enum',
    options: ['auto', 'sleep', 'favorite'],
  }),
  capability('pm25', 'PM2.5', 'read', {
    kind: 'number',
    min: 0,
    max: 600,
    step: 1,
    unit: 'µg/m³',
  }),
  capability('filter_reset', 'Reset filter', 'write', { kind: 'action' }),
]);

export const lamp = device(LAMP, 'Hallway light', 'light', [
  POWER,
  capability('brightness', 'Brightness', 'read_write', {
    kind: 'number',
    min: 1,
    max: 100,
    step: 1,
    unit: '%',
  }),
  capability('color', 'Colour', 'read_write', { kind: 'color' }),
]);

export const door = device(DOOR, 'Front door', 'sensor', [
  capability('contact', 'Contact', 'read', { kind: 'boolean' }),
  capability('battery', 'Battery', 'read', {
    kind: 'number',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  }),
]);

const leak = device(LEAK, 'Laundry leak sensor', 'sensor', [
  capability('leak', 'Water leak', 'read', { kind: 'boolean' }),
]);

const motionSensor = device(SENSOR, 'Landing sensor', 'sensor', [
  capability('motion', 'Motion', 'read', { kind: 'boolean' }),
  capability('raw:note', 'Note', 'read', { kind: 'text', maxLength: 20 }),
]);

const remote = device(REMOTE, 'Living room remote', 'ir_blaster', [
  capability('ir_send', 'Send IR code', 'write', { kind: 'action', arguments: ['format', 'code'] }),
]);

export const DEVICES: readonly DeviceLike[] = [purifier, lamp, door, leak, motionSensor, remote];
