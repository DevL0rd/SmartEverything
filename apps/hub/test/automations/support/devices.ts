import type { DiscoveredDevice } from '@smarteverything/domain';
import { LAMP } from '../../support/fake-provider';

const PERCENT = { kind: 'number', min: 0, max: 100, step: 1, unit: '%' } as const;

const LAMP_ONE: DiscoveredDevice = { ...LAMP, externalId: 'lamp-1' };

const LAMP_TWO: DiscoveredDevice = {
  ...LAMP,
  externalId: 'lamp-2',
  name: 'Reading lamp',
  room: 'Study',
};

const FAN: DiscoveredDevice = {
  ...LAMP,
  externalId: 'fan-1',
  kind: 'fan',
  name: 'Hall fan',
  room: 'Hall',
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    { key: 'fan_speed', label: 'Fan speed', access: 'read_write', value: PERCENT },
    {
      key: 'fan_mode',
      label: 'Fan mode',
      access: 'read_write',
      value: { kind: 'enum', options: ['auto', 'sleep', 'boost'] },
    },
    {
      key: 'raw:blink',
      label: 'Blink',
      access: 'write',
      value: { kind: 'action', arguments: ['times', 'rate'] },
    },
    {
      key: 'off_timer',
      label: 'Turn off in',
      access: 'read_write',
      value: { kind: 'number', min: 0, max: 3_600_000, step: 1000, unit: 'ms' },
    },
  ],
};

const SENSOR: DiscoveredDevice = {
  ...LAMP,
  externalId: 'sensor-1',
  kind: 'sensor',
  name: 'Hall sensor',
  room: 'Hall',
  capabilities: [
    {
      key: 'temperature',
      label: 'Temperature',
      access: 'read',
      value: { kind: 'number', min: -40, max: 80, step: 0.1 },
    },
    { key: 'occupancy', label: 'Occupancy', access: 'read', value: { kind: 'boolean' } },
  ],
};

const PURIFIER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'purifier-1',
  kind: 'air_purifier',
  model: 'zhimi.airp.vb4',
  name: 'Study purifier',
  room: 'Study',
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    {
      key: 'fan_speed',
      label: 'Favourite level',
      access: 'read_write',
      value: { kind: 'number', min: 0, max: 14, step: 1 },
    },
  ],
};

export const ALL_DEVICES = [LAMP_ONE, LAMP_TWO, FAN, SENSOR, PURIFIER];

export interface DeviceIds {
  readonly lamp: string;
  readonly lampTwo: string;
  readonly fan: string;
  readonly sensor: string;
  readonly purifier: string;
}
