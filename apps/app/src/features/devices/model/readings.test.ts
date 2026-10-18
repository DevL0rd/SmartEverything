import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf, type DeviceModel } from './device-model';
import { airOf, heroReadingOf, readingsOf } from './readings';

function modelOf(kind: Device['kind'], capabilities: DeviceCapability[]): DeviceModel {
  return deviceModelOf({
    id: 'd1',
    provider: 'local',
    external_id: 'd1',
    parent_id: null,
    kind,
    name: 'Device',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Device',
  });
}

function reading(key: DeviceCapability['key']): DeviceCapability {
  return {
    key,
    label: key,
    access: 'read',
    value: { kind: 'number', min: 0, max: 5000, step: 1 },
  };
}

function values(readings: Record<string, number>): DeviceValues {
  return Object.fromEntries(
    Object.entries(readings).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-16T10:00:00Z' },
    ]),
  );
}

describe('heroReadingOf', () => {
  const purifier = modelOf('air_purifier', [
    reading('pm25'),
    reading('air_quality_index'),
    reading('temperature'),
  ]);

  it('leads an air purifier with its fine dust, else its air index', () => {
    expect(heroReadingOf(purifier, values({ pm25: 8, air_quality_index: 30 }))?.key).toBe('pm25');
    expect(heroReadingOf(purifier, values({ air_quality_index: 30 }))?.key).toBe(
      'air_quality_index',
    );
  });

  it('has no hero until a reading has a value', () => {
    expect(heroReadingOf(purifier, {})).toBeNull();
  });

  it('leads a humidifier with humidity and a plug with its power draw', () => {
    const humidifier = modelOf('humidifier', [reading('humidity'), reading('temperature')]);
    expect(heroReadingOf(humidifier, values({ humidity: 50, temperature: 21 }))?.key).toBe(
      'humidity',
    );
    const plug = modelOf('plug', [reading('power_draw')]);
    expect(heroReadingOf(plug, values({ power_draw: 40 }))?.key).toBe('power_draw');
  });

  it('never leads a light or a fan with a reading', () => {
    const light = modelOf('light', [reading('temperature')]);
    const fan = modelOf('fan', [reading('temperature')]);
    expect(heroReadingOf(light, values({ temperature: 20 }))).toBeNull();
    expect(heroReadingOf(fan, values({ temperature: 20 }))).toBeNull();
  });

  it('leads a sensor with the first reading it has, in the order of the usual ones', () => {
    const sensor = modelOf('sensor', [reading('humidity'), reading('temperature')]);
    expect(heroReadingOf(sensor, values({ humidity: 50, temperature: 21 }))?.key).toBe(
      'temperature',
    );
    expect(heroReadingOf(sensor, values({ humidity: 50 }))?.key).toBe('humidity');
  });
});

describe('readingsOf', () => {
  it('lists the readings that have a value, without the hero', () => {
    const model = modelOf('sensor', [reading('temperature'), reading('humidity'), reading('co2')]);
    const now = values({ temperature: 21, humidity: 50 });
    const hero = heroReadingOf(model, now);
    expect(readingsOf(model, now, hero).map((item) => item.key)).toEqual(['humidity']);
    expect(
      readingsOf(model, now, null)
        .map((item) => item.key)
        .toSorted(),
    ).toEqual(['humidity', 'temperature']);
  });
});

describe('airOf', () => {
  const model = modelOf('air_purifier', [reading('pm25'), reading('humidity')]);

  it('names the air band of the fine dust reading', () => {
    const now = values({ pm25: 8 });
    expect(airOf(heroReadingOf(model, now), now)).toEqual({ band: 'good', label: 'Good air' });
    const dusty = values({ pm25: 70 });
    expect(airOf(heroReadingOf(model, dusty), dusty)?.band).toBe('poor');
  });

  it('has no air for another hero, no hero or a value that is not a number', () => {
    const humidity = values({ humidity: 50 });
    const other = modelOf('humidifier', [reading('humidity')]);
    expect(airOf(heroReadingOf(other, humidity), humidity)).toBeNull();
    expect(airOf(null, {})).toBeNull();
    const text: DeviceValues = { pm25: { value: 'n/a', observedAt: '2026-10-16T10:00:00Z' } };
    expect(airOf(heroReadingOf(model, text), text)).toBeNull();
  });
});
