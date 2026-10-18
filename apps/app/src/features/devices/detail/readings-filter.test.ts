import { describe, expect, it } from 'vitest';
import { DEVICE_ROW, type DeviceCapability } from '@smarteverything/domain';
import { deviceOf, type DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { shownReadings } from './readings-filter';

const capabilities: readonly DeviceCapability[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    access: 'read',
    value: { kind: 'number', min: -20, max: 60, step: 1, unit: '°C' },
  },
  {
    key: 'battery',
    label: 'Battery',
    access: 'read',
    value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
  },
  { key: 'charging', label: 'Charging', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'raw:vendor.status',
    label: 'Vendor status',
    access: 'read',
    value: { kind: 'text', maxLength: 40 },
  },
];

const model = deviceModelOf(
  deviceOf(
    DEVICE_ROW.parse({
      id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      provider: 'tuya',
      external_id: 'door-1',
      parent_id: null,
      kind: 'sensor',
      name: 'Door',
      display_name: null,
      model: 'door-sensor',
      manufacturer: 'Acme',
      provider_room: null,
      room_id: null,
      online: true,
      capabilities,
      details: {},
      hidden: false,
      favourite: false,
      position: 0,
      created_at: '2026-10-16T08:00:00.000Z',
      updated_at: '2026-10-16T08:00:00.000Z',
    }),
  ),
);

function valuesOf(entries: Readonly<Record<string, boolean | number | string>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-16T08:00:00.000Z' },
    ]),
  );
}

const values = valuesOf({
  temperature: 21,
  battery: 87,
  charging: false,
  'raw:vendor.status': 'Ready',
});

function keys(line: string, shown: DeviceValues = values): readonly string[] {
  return shownReadings(model, shown, line).map((presented) => presented.key);
}

describe('shownReadings', () => {
  it('lists the readings that the state line does not already say', () => {
    expect(keys('Hall')).toContain('battery');
    expect(keys('Hall')).toContain('charging');
  });

  it('hides a reading whose value is already a word of the state line', () => {
    expect(keys('Hall · Not charging')).not.toContain('charging');
    expect(keys('Hall · Not charging')).toContain('battery');
  });

  it('matches regardless of case and spacing', () => {
    expect(keys('hall · 87 %')).not.toContain('battery');
    expect(keys('hall · 87 %')).toContain('charging');
  });

  it('states a boolean in words, never as a raw boolean', () => {
    expect(
      keys('Hall · Charging', valuesOf({ temperature: 21, battery: 87, charging: true })),
    ).not.toContain('charging');
    expect(keys('Hall · false')).toContain('charging');
  });

  it('keeps a reading that has no value yet out of the way', () => {
    expect(keys('Hall', valuesOf({}))).toEqual([]);
  });

  it('never lists provider extras', () => {
    expect(keys('Hall')).not.toContain('raw:vendor.status');
  });
});
