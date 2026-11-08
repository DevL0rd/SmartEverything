import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIOT_SPEC, modelFromSpec, type MiotProperty, type MiotSpec } from '../src';

function fixture(name: string): MiotSpec {
  return MIOT_SPEC.parse(
    JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')),
  );
}

function standardKeys(spec: MiotSpec): string[] {
  return modelFromSpec(spec)
    .capabilities.map(({ key }) => key)
    .filter((key) => !key.startsWith('raw:'));
}

const BEFORE: Readonly<Record<string, readonly string[]>> = {
  'chuangmi-ipc019.json': ['firmware', 'power', 'night_vision', 'watermark', 'recording'],
  'isa-hldb6.json': ['firmware', 'motion_detection'],
  'lumi-aq2.json': ['firmware', 'motion', 'illuminance'],
  'lumi-mgl03.json': ['firmware'],
  'lumi-v2.json': ['firmware', 'contact'],
  'nwt-wdh318efw1.json': [
    'firmware',
    'power',
    'fan_mode',
    'humidity',
    'temperature',
    'buzzer',
    'status_light',
    'child_lock',
  ],
  'xiaomi-091ac1.json': [
    'firmware',
    'power',
    'night_vision',
    'watermark',
    'recording',
    'storage_free',
    'motion_detection',
    'motion_sensitivity',
    'status_light',
    'volume',
    'mute',
    'call_status',
  ],
  'yeelink-color4.json': [
    'firmware',
    'power',
    'brightness',
    'color_temperature',
    'color',
    'light_effect',
  ],
  'zhimi-ca4.json': [
    'firmware',
    'power',
    'mist_level',
    'target_humidity',
    'water_level',
    'temperature',
    'humidity',
    'buzzer',
    'display_brightness',
    'child_lock',
  ],
  'zhimi-mb5.json': [
    'firmware',
    'power',
    'purifier_mode',
    'fan_mode',
    'humidity',
    'pm25',
    'temperature',
    'filter_life',
    'filter_reset',
    'buzzer',
    'child_lock',
    'display_brightness',
  ],
  'vacuum/pv11gl-spec.json': [
    'firmware',
    'battery',
    'buzzer',
    'child_lock',
    'filter_life',
    'filter_reset',
    'power',
  ],
};

const VACUUM = 'vacuum/pv11gl-spec.json';

describe('the generic power binding over every Xiaomi spec fixture', () => {
  const others = Object.entries(BEFORE).filter(([name]) => name !== VACUUM);

  it.each(others)('leaves the standard capabilities of %s unchanged', (name, before) => {
    expect(standardKeys(fixture(name))).toStrictEqual(before);
  });

  it('only the vacuum lost power, and gained suction, mop water and volume', () => {
    expect(standardKeys(fixture(VACUUM))).toStrictEqual([
      'firmware',
      'suction',
      'mop_level',
      'battery',
      'buzzer',
      'volume',
      'child_lock',
      'filter_life',
      'filter_reset',
    ]);
  });

  it('keeps the camera switch of stream-management as its own raw capability', () => {
    const model = modelFromSpec(fixture(VACUUM));
    expect(model.bindings.has('power')).toBe(false);
    expect(model.bindings.get('raw:21.6')).toMatchObject({ kind: 'property', siid: 21, piid: 6 });
  });

  it('binds the vacuum properties to the existing standard keys', () => {
    const model = modelFromSpec(fixture(VACUUM));
    expect(model.bindings.get('suction')).toMatchObject({ siid: 2, piid: 9 });
    expect(model.bindings.get('mop_level')).toMatchObject({ siid: 2, piid: 10 });
    expect(model.bindings.get('volume')).toMatchObject({ siid: 4, piid: 2 });
    expect(model.capabilities.find(({ key }) => key === 'suction')?.value.kind).toBe('enum');
    expect(model.capabilities.find(({ key }) => key === 'mop_level')?.value.kind).toBe('enum');
    expect(model.capabilities.find(({ key }) => key === 'volume')?.value.kind).toBe('number');
  });
});

describe('alarm volume', () => {
  function alarmSpec(shape: Partial<MiotProperty>): MiotSpec {
    return {
      type: 'urn:miot-spec-v2:device:vacuum:0:test:1',
      description: 'Test',
      services: [
        {
          iid: 4,
          type: 'urn:miot-spec-v2:service:alarm:0:test:1',
          description: 'Alarm',
          properties: [
            {
              iid: 2,
              type: 'urn:miot-spec-v2:property:volume:0:test:1',
              description: 'Volume',
              format: 'uint8',
              access: ['read', 'write'],
              ...shape,
            },
          ],
          actions: [],
          events: [],
        },
      ],
    };
  }

  it('binds volume when the value is a number', () => {
    expect(standardKeys(alarmSpec({ 'value-range': [0, 100, 1] }))).toStrictEqual(['volume']);
  });

  it('stays raw when the value is not a number', () => {
    const spec = alarmSpec({ 'value-list': [{ value: 1, description: 'Low' }] });
    expect(standardKeys(spec)).toStrictEqual([]);
    expect(modelFromSpec(spec).capabilities.map(({ key }) => key)).toStrictEqual(['raw:4.2']);
  });
});
