import type { DeviceCapability } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device, DeviceValues } from '../../../store/state';

export const DIFFUSER_ID = '00000000-0000-4000-8000-0000000000d1';

const CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  { key: 'raw:2.1', label: 'Fault', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'raw:2.3',
    label: 'Spray duration',
    access: 'read_write',
    value: { kind: 'number', min: 2, max: 6, step: 1 },
  },
  {
    key: 'raw:2.4',
    label: 'Spray interval',
    access: 'read_write',
    value: { kind: 'number', min: 10, max: 20, step: 5 },
  },
  { key: 'raw:action.4.1', label: 'Spray now', access: 'write', value: { kind: 'action' } },
  { key: 'raw:3.1', label: 'Ambient light', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'battery',
    label: 'Battery',
    access: 'read',
    value: { kind: 'number', min: 0, max: 100, step: 5 },
  },
  {
    key: 'raw:5.2',
    label: 'Charging state',
    access: 'read',
    value: { kind: 'text', maxLength: 32 },
  },
];

export function diffuserDevice(online = true): Device {
  return deviceFixture(0, {
    id: DIFFUSER_ID,
    kind: 'humidifier',
    model: 'xiaomi.diffuser.xw2iv',
    online,
    capabilities: [...CAPABILITIES],
  });
}

const AT = '2026-10-18T08:00:00.000Z';

export function diffuserValues(
  entries: Readonly<Record<string, number | boolean | string>>,
): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}
