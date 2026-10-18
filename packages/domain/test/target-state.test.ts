import { describe, expect, it } from 'vitest';
import {
  DEVICE_ROW,
  presentDevice,
  targetState,
  type DeviceRow,
  type JsonValue,
  type TargetState,
} from '../src';

type Reading = Readonly<Record<string, { readonly value: JsonValue }>>;

let counter = 0;

const POWER = { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } };
const BRIGHTNESS = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 1 },
};
const COLOUR = { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } };
const WHITE = {
  key: 'color_temperature',
  label: 'Colour temperature',
  access: 'read_write',
  value: { kind: 'number', min: 2700, max: 6500, step: 100 },
};

function device(overrides: Record<string, unknown>): DeviceRow {
  counter += 1;
  return DEVICE_ROW.parse({
    id: `7e000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`,
    provider: 'xiaomi',
    external_id: `target-state-${String(counter)}`,
    parent_id: null,
    kind: 'light',
    name: `Light ${String(counter)}`,
    display_name: null,
    model: 'generic.model',
    manufacturer: 'Maker',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [POWER, BRIGHTNESS, COLOUR, WHITE],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-08T10:00:00.000Z',
    updated_at: '2026-10-08T10:00:00.000Z',
    ...overrides,
  });
}

function diffuser(descriptors: { readonly brightness: Record<string, unknown> }): DeviceRow {
  return device({
    kind: 'other',
    model: 'xiaomi.diffuser.xw2iv',
    capabilities: [
      POWER,
      { key: 'raw:3.2', label: 'Brightness', access: 'read_write', value: descriptors.brightness },
      {
        key: 'raw:3.3',
        label: 'Colour',
        access: 'read_write',
        value: { kind: 'number', min: 0, max: 16777215, step: 1 },
      },
    ],
  });
}

function state(
  devices: readonly DeviceRow[],
  readings: Readonly<Record<string, Reading>>,
): TargetState {
  return targetState(devices, (id) => readings[id], presentDevice);
}

function lit(level: number, extra: Reading = {}): Reading {
  return { power: { value: true }, brightness: { value: level }, ...extra };
}

describe('targetState power', () => {
  it('reports none when no member is online', () => {
    const away = device({ online: false });
    expect(state([away], {})).toMatchObject({ members: 1, online: 0, on: 0, power: 'none' });
    expect(state([], {})).toMatchObject({ members: 0, power: 'none', level: null });
  });

  it('reports off when every online member is off or has no power reading', () => {
    const first = device({});
    const second = device({});
    const result = state([first, second], { [first.id]: { power: { value: false } } });
    expect(result).toMatchObject({ members: 2, online: 2, on: 0, power: 'off', level: null });
  });

  it('reports on when every online member is on, ignoring offline members', () => {
    const first = device({});
    const second = device({});
    const away = device({ online: false });
    const result = state([first, second, away], {
      [first.id]: lit(40),
      [second.id]: lit(80),
      [away.id]: lit(10),
    });
    expect(result).toMatchObject({ members: 3, online: 2, on: 2, power: 'on' });
  });

  it('reports mixed when only some online members are on', () => {
    const first = device({});
    const second = device({});
    const result = state([first, second], {
      [first.id]: lit(40),
      [second.id]: { power: { value: false } },
    });
    expect(result).toMatchObject({ on: 1, online: 2, power: 'mixed' });
  });

  it('never counts a member without a power capability as on', () => {
    const sensor = device({ kind: 'sensor', capabilities: [] });
    expect(state([sensor], {})).toMatchObject({ online: 1, on: 0, power: 'off' });
  });
});

describe('targetState spreads', () => {
  it('summarises brightness of lit members as min, max, rounded mean and per member values', () => {
    const first = device({});
    const second = device({});
    const third = device({});
    const off = device({});
    const result = state([first, second, third, off], {
      [first.id]: lit(40),
      [second.id]: lit(80),
      [third.id]: lit(41),
      [off.id]: { power: { value: false }, brightness: { value: 100 } },
    });
    expect(result.level).toEqual({
      min: 40,
      max: 80,
      mean: 54,
      perMember: [
        { deviceId: first.id, value: 40 },
        { deviceId: second.id, value: 80 },
        { deviceId: third.id, value: 41 },
      ],
    });
  });

  it('converts a device brightness range to a percentage', () => {
    const wide = device({
      capabilities: [
        POWER,
        { ...BRIGHTNESS, value: { kind: 'number', min: 0, max: 255, step: 1 } },
      ],
    });
    expect(state([wide], { [wide.id]: lit(51) }).level?.mean).toBe(20);
  });

  it('skips brightness that is missing, not a number, or on a non-numeric capability', () => {
    const missing = device({});
    const text = device({});
    const enumerated = diffuser({ brightness: { kind: 'enum', options: ['dim', 'bright'] } });
    const result = state([missing, text, enumerated], {
      [missing.id]: { power: { value: true } },
      [text.id]: { power: { value: true }, brightness: { value: 'high' } },
      [enumerated.id]: { power: { value: true }, 'raw:3.2': { value: 'dim' } },
    });
    expect(result).toMatchObject({ on: 3, level: null });
  });

  it('summarises white temperature of lit members', () => {
    const first = device({});
    const second = device({});
    const result = state([first, second], {
      [first.id]: lit(50, { color_temperature: { value: 2700 } }),
      [second.id]: lit(50, { color_temperature: { value: 4000 } }),
    });
    expect(result.whiteTemperature).toEqual({
      min: 2700,
      max: 4000,
      mean: 3350,
      perMember: [
        { deviceId: first.id, value: 2700 },
        { deviceId: second.id, value: 4000 },
      ],
    });
  });

  it('leaves white temperature empty when no lit member reports a number', () => {
    const only = device({});
    const result = state([only], { [only.id]: lit(50, { color_temperature: { value: 'warm' } }) });
    expect(result.whiteTemperature).toBeNull();
  });
});

describe('targetState colours', () => {
  const red = { hue: 0, saturation: 100, value: 100 };
  const blue = { hue: 240, saturation: 100, value: 100 };
  const green = { hue: 120, saturation: 80, value: 90 };

  function coloursOf(values: readonly Reading[]): TargetState['colours'] {
    const lights = values.map(() => device({}));
    return state(
      lights,
      Object.fromEntries(lights.map((light, index) => [light.id, values[index] ?? {}])),
    ).colours;
  }

  const paint = (value: JsonValue): Reading => lit(50, { color: { value } });

  it('lists distinct colours of lit members sorted by hue', () => {
    const painted = [blue, red, { ...red, hue: 0.4 }, green].map(paint);
    expect(coloursOf(painted)).toEqual([red, green, blue]);
  });

  it('orders colours of the same hue by saturation then value', () => {
    const painted = [
      { hue: 10, saturation: 90, value: 50 },
      { hue: 10, saturation: 40, value: 80 },
      { hue: 10, saturation: 40, value: 20 },
    ].map(paint);
    expect(coloursOf(painted).map((colour) => [colour.saturation, colour.value])).toEqual([
      [40, 20],
      [40, 80],
      [90, 50],
    ]);
  });

  it('reads colours a device stores as packed RGB', () => {
    const glow = diffuser({ brightness: { kind: 'number', min: 0, max: 100, step: 1 } });
    const result = state([glow], {
      [glow.id]: {
        power: { value: true },
        'raw:3.2': { value: 60 },
        'raw:3.3': { value: 0xff0000 },
      },
    });
    expect(result.level?.mean).toBe(60);
    expect(result.colours).toEqual([{ hue: 0, saturation: 100, value: 100 }]);
  });

  it('ignores colours of members that are off or unreadable', () => {
    const off = device({});
    const broken = device({});
    const result = state([off, broken], {
      [off.id]: { power: { value: false }, color: { value: red } },
      [broken.id]: lit(50, { color: { value: 'red' } }),
    });
    expect(result.colours).toEqual([]);
  });
});

describe('targetState support', () => {
  it('still counts what the members can do when every member is offline', () => {
    const result = state([device({ online: false })], {});
    expect(result.power).toBe('none');
    expect(result.support.brightness).toBe(1);
  });

  it('counts every member, online or not, that can write each role once', () => {
    const full = device({});
    const white = device({ capabilities: [POWER, BRIGHTNESS] });
    const readOnly = device({
      capabilities: [POWER, { ...BRIGHTNESS, access: 'read' }],
    });
    const away = device({ online: false });
    const result = state([full, white, readOnly, away], {});
    expect(result.support).toEqual({ power: 4, brightness: 3, color: 2, color_temperature: 2 });
  });

  it('counts a role once even when a member offers it twice', () => {
    const twice = device({
      kind: 'other',
      model: 'xiaomi.diffuser.xw2iv',
      capabilities: [
        POWER,
        BRIGHTNESS,
        { ...BRIGHTNESS, key: 'raw:3.2', label: 'Ambient brightness' },
      ],
    });
    expect(state([twice], {}).support).toEqual({ power: 1, brightness: 1 });
  });
});
