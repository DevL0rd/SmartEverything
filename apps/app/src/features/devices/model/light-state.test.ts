import { describe, expect, it } from 'vitest';
import {
  levelPercent,
  levelRangeOf,
  levelValue,
  type DeviceCapability,
} from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf } from './device-model';
import { colourAccessOf, fromKelvin, lightPartsOf, lightStateOf } from './light-state';

const CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'brightness',
    label: 'Brightness',
    access: 'read_write',
    value: { kind: 'number', min: 0, max: 254, step: 1 },
  },
  {
    key: 'color_temperature',
    label: 'Colour temperature',
    access: 'read_write',
    value: { kind: 'number', min: 2700, max: 6500, step: 100, unit: 'kelvin' },
  },
  { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
];

function lamp(online = true): Device {
  return {
    id: 'lamp',
    provider: 'local',
    external_id: 'lamp',
    parent_id: null,
    kind: 'light',
    name: 'Lamp',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online,
    capabilities: [...CAPABILITIES],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Lamp',
  };
}

function at(value: DeviceValues[string]['value'], observedAt: string): DeviceValues[string] {
  return { value, observedAt };
}

describe('light state', () => {
  const model = deviceModelOf(lamp());
  const parts = lightPartsOf(model);

  it('finds the dimmer, the white temperature and the colour of a light', () => {
    expect(parts.brightness?.key).toBe('brightness');
    expect(parts.temperature?.key).toBe('color_temperature');
    expect(parts.colour?.key).toBe('color');
  });

  it('reads the brightness as a percentage of the light range', () => {
    const state = lightStateOf(model, parts, {
      power: at(true, '2026-10-16T10:00:00Z'),
      brightness: at(127, '2026-10-16T10:00:00Z'),
    });
    expect(state.power).toBe('on');
    expect(state.level).toBe(50);
  });

  it('shows a colour only when it was set after the white temperature', () => {
    const colour = { hue: 20, saturation: 80, value: 100 };
    const white = lightStateOf(model, parts, {
      color_temperature: at(3000, '2026-10-16T10:05:00Z'),
      color: at(colour, '2026-10-16T10:00:00Z'),
    });
    const coloured = lightStateOf(model, parts, {
      color_temperature: at(3000, '2026-10-16T10:00:00Z'),
      color: at(colour, '2026-10-16T10:05:00Z'),
    });
    expect(white.mode).toBe('white');
    expect(white.kelvin).toBe(3000);
    expect(coloured.mode).toBe('colour');
  });

  it('does not claim a power state for a light that is offline', () => {
    const offline = deviceModelOf(lamp(false));
    const state = lightStateOf(offline, lightPartsOf(offline), {
      power: at(true, '2026-10-16T10:00:00Z'),
    });
    expect(state.online).toBe(false);
    expect(state.power).toBe('unknown');
  });

  it('writes a percentage back inside the range of the capability', () => {
    const brightness = parts.brightness;
    if (brightness === null) {
      throw new Error('expected a brightness control');
    }
    const range = levelRangeOf(brightness);
    if (range === null) {
      throw new Error('expected a brightness range');
    }
    expect(levelValue(range, 100)).toBe(254);
    expect(levelPercent(range, levelValue(range, 30))).toBe(30);
  });

  it('keeps a written temperature inside what the light supports', () => {
    const temperature = parts.temperature;
    if (temperature === null) {
      throw new Error('expected a temperature control');
    }
    expect(fromKelvin(temperature, 2200)).toBe(2700);
    expect(fromKelvin(temperature, 4100)).toBe(4100);
  });

  it('offers colour presets for a colour light, white presets for a white-only one, none otherwise', () => {
    expect(colourAccessOf(parts)).toBe('colour');
    expect(colourAccessOf({ ...parts, colour: null })).toBe('white');
    expect(colourAccessOf({ ...parts, colour: null, temperature: null })).toBeNull();
  });
});
