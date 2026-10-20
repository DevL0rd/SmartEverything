import { MICROWAVE_KEYS, type DeviceCapability, type DeviceKind } from '@smarteverything/domain';
import type { TemplateDevice, TemplateRoom } from './parameters';

export function capability(
  key: DeviceCapability['key'],
  access: DeviceCapability['access'],
  value: DeviceCapability['value'],
): DeviceCapability {
  return { key, label: key, access, value };
}

export const BOOLEAN = { kind: 'boolean' } as const;
export const NUMBER = { kind: 'number', min: 0, max: 1000, step: 1 } as const;

export function device(
  id: string,
  kind: DeviceKind,
  label: string,
  capabilities: readonly DeviceCapability[],
): TemplateDevice {
  return { id, kind, label, model: 'test.model', capabilities: [...capabilities] };
}

export function inRoom(entry: TemplateDevice, roomId: string): TemplateDevice {
  return { ...entry, room_id: roomId };
}

export const ROOMS: readonly TemplateRoom[] = [{ id: 'room-living', name: 'Living room' }];

export const HOME: readonly TemplateDevice[] = [
  inRoom(
    device('lamp', 'light', 'Lamp', [capability('power', 'read_write', BOOLEAN)]),
    'room-living',
  ),
  inRoom(
    device('lamp2', 'light', 'Floor lamp', [capability('power', 'read_write', BOOLEAN)]),
    'room-living',
  ),
  device('motion', 'sensor', 'Hall motion', [capability('motion', 'read', BOOLEAN)]),
  device('door', 'sensor', 'Front door', [capability('contact', 'read', BOOLEAN)]),
  device('leaky', 'sensor', 'Sink sensor', [capability('leak', 'read', BOOLEAN)]),
  device('smoky', 'sensor', 'Smoke alarm', [capability('smoke', 'read', BOOLEAN)]),
  device('air', 'sensor', 'Air monitor', [capability('pm25', 'read', NUMBER)]),
  device('purifier', 'air_purifier', 'Purifier', [
    capability('power', 'read_write', BOOLEAN),
    capability('purifier_mode', 'read_write', { kind: 'enum', options: ['auto', 'sleep'] }),
  ]),
  device('humid', 'humidifier', 'Humidifier', [
    capability('power', 'read_write', BOOLEAN),
    capability('humidity', 'read', NUMBER),
  ]),
];

function modelled(entry: TemplateDevice, model: string): TemplateDevice {
  return { ...entry, model };
}

const TEXT = { kind: 'text', maxLength: 40 } as const;

export const APPLIANCES: readonly TemplateDevice[] = [
  modelled(
    device('microwave', 'appliance', 'Kitchen microwave', [
      capability(MICROWAVE_KEYS.mode, 'read', TEXT),
      capability(MICROWAVE_KEYS.power, 'read', TEXT),
      capability(MICROWAVE_KEYS.state, 'read', TEXT),
      capability(MICROWAVE_KEYS.job, 'read', TEXT),
      capability(MICROWAVE_KEYS.door, 'read', TEXT),
    ]),
    'MW7300B',
  ),
  modelled(device('scale', 'other', 'Bathroom scale', []), 'xiaomi.scales.400pgj'),
  device('adguard', 'dns_filter', 'AdGuard Home', [
    capability('dns_protection', 'read_write', BOOLEAN),
  ]),
  device('sync', 'file_sync', 'Syncthing', [
    capability('sync_state', 'read', { kind: 'enum', options: ['in_sync', 'error'] }),
  ]),
  modelled(device('button', 'other', 'Kitchen switch', []), 'lumi.sensor_switch.v2'),
  modelled(
    device('treadmill', 'appliance', 'WalkingPad', [
      capability('child_lock', 'read_write', BOOLEAN),
      capability('belt_incline', 'read', NUMBER),
    ]),
    'kingsmith.treadmill.k15',
  ),
  modelled(
    device('bottle', 'other', 'Kitchen bottle', [
      capability('water_level', 'read', NUMBER),
      capability('quiet_hours', 'read_write', { kind: 'enum', options: ['off', 'on'] }),
    ]),
    'larq.bottle.purevis2',
  ),
  modelled(
    device('brush', 'other', 'Bathroom brush', [
      capability('brush_activity', 'read', { kind: 'enum', options: ['standby', 'brushing'] }),
      capability('battery', 'read', NUMBER),
    ]),
    'philips.toothbrush.hx992x',
  ),
  modelled(device('printer', 'printer', 'Office printer', []), 'HP LaserJet'),
  device('cam', 'camera', 'Porch camera', []),
  device('desk', 'computer', 'Desk PC', []),
  device('speaker', 'speaker', 'Kitchen speaker', []),
];
