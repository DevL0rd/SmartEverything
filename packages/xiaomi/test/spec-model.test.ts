import { readFileSync } from 'node:fs';
import { DEVICE_CAPABILITY, type StandardCapability } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  MIOT_SPEC,
  MIOT_SPEC_INDEX,
  MiotSpecError,
  deviceKindOf,
  modelFromSpec,
  parseUrn,
  propertyKeyOf,
  specTypeForModel,
  standardName,
  type MiotProperty,
  type MiotSpec,
} from '../src';

function fixture(name: string): MiotSpec {
  return MIOT_SPEC.parse(
    JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
}

function urn(category: string, name: string, namespace = 'miot-spec-v2'): string {
  return `urn:${namespace}:${category}:${name}:00000001:test-model:1`;
}

function property(name: string, shape: Partial<MiotProperty> = {}): MiotProperty {
  return {
    iid: 1,
    type: urn('property', name),
    description: name,
    format: 'bool',
    access: ['read', 'write', 'notify'],
    ...shape,
  };
}

function specWith(services: MiotSpec['services'], device = 'outlet'): MiotSpec {
  return { type: urn('device', device), description: 'Test', services };
}

function service(
  name: string,
  properties: MiotProperty[],
  extra: Partial<MiotSpec['services'][number]> = {},
): MiotSpec['services'][number] {
  return {
    iid: 2,
    type: urn('service', name),
    description: name,
    properties,
    actions: [],
    events: [],
    ...extra,
  };
}

const SHAPES = {
  boolean: { format: 'bool' },
  number: { format: 'uint8', 'value-range': [0, 100, 1] },
  enum: { format: 'uint8', 'value-list': [{ value: 1, description: 'One' }] },
  text: { format: 'string' },
  color: { format: 'uint32', 'value-range': [1, 16777215, 1] },
} as const satisfies Record<string, Partial<MiotProperty>>;

const RULES: readonly (readonly [string, string, keyof typeof SHAPES, StandardCapability])[] = [
  ['indicator-light', 'on', 'boolean', 'status_light'],
  ['air-purifier', 'on', 'boolean', 'power'],
  ['light', 'brightness', 'number', 'brightness'],
  ['light', 'color-temperature', 'number', 'color_temperature'],
  ['light', 'color', 'color', 'color'],
  ['light', 'mode', 'enum', 'light_effect'],
  ['air-purifier', 'mode', 'enum', 'purifier_mode'],
  ['humidifier', 'fan-level', 'enum', 'mist_level'],
  ['fan', 'fan-level', 'enum', 'fan_mode'],
  ['fan', 'fan-level', 'number', 'fan_speed'],
  ['environment', 'target-humidity', 'number', 'target_humidity'],
  ['heater', 'target-temperature', 'number', 'target_temperature'],
  ['environment', 'relative-humidity', 'number', 'humidity'],
  ['environment', 'temperature', 'number', 'temperature'],
  ['environment', 'pm2.5-density', 'number', 'pm25'],
  ['environment', 'pm10-density', 'number', 'pm10'],
  ['environment', 'co2-density', 'number', 'co2'],
  ['environment', 'tvoc-density', 'number', 'tvoc'],
  ['environment', 'hcho-density', 'number', 'hcho'],
  ['environment', 'air-quality-index', 'number', 'air_quality_index'],
  ['filter', 'filter-life-level', 'number', 'filter_life'],
  ['physical-controls-locked', 'physical-controls-locked', 'boolean', 'child_lock'],
  ['alarm', 'alarm', 'boolean', 'buzzer'],
  ['screen', 'brightness', 'enum', 'display_brightness'],
  ['humidifier', 'water-level', 'number', 'water_level'],
  ['illumination-sensor', 'illumination', 'number', 'illuminance'],
  ['motion-sensor', 'motion-state', 'boolean', 'motion'],
  ['magnet-sensor', 'contact-state', 'boolean', 'contact'],
  ['submersion-sensor', 'submersion-state', 'boolean', 'leak'],
  ['battery', 'battery-level', 'number', 'battery'],
  ['camera-control', 'night-shot', 'enum', 'night_vision'],
  ['camera-control', 'time-watermark', 'boolean', 'watermark'],
  ['camera-control', 'recording-mode', 'enum', 'recording'],
  ['motion-detection', 'motion-detection', 'boolean', 'motion_detection'],
  ['motion-detection', 'detection-sensitivity', 'enum', 'motion_sensitivity'],
  ['memory-card-management', 'storage-free-space', 'number', 'storage_free'],
  ['key-call', 'key-call-status', 'enum', 'call_status'],
  ['speaker', 'volume', 'number', 'volume'],
  ['speaker', 'mute', 'boolean', 'mute'],
  ['device-information', 'firmware-revision', 'text', 'firmware'],
  ['arming', 'arming-mode', 'enum', 'alarm'],
];

describe('MIoT URNs', () => {
  it('split into namespace, category and name', () => {
    expect(parseUrn('urn:miot-spec-v2:property:on:00000006:zhimi-mb5:1')).toStrictEqual({
      namespace: 'miot-spec-v2',
      category: 'property',
      name: 'on',
      standard: true,
    });
    expect(standardName('urn:zhimi-spec:property:favorite-level:00000005:zhimi-mb5:1')).toBeNull();
    expect(standardName('urn:miot-spec-v2:service:filter:00007808:zhimi-mb5:1')).toBe('filter');
  });

  it('refuse anything that is not a URN with a name', () => {
    for (const bad of ['x:miot-spec-v2:property:on', 'urn::property:on', 'urn:a::on', 'urn:a:b']) {
      expect(() => parseUrn(bad)).toThrow(
        new MiotSpecError(bad, 'urn:<namespace>:<category>:<name>:...', bad),
      );
    }
  });
});

describe('the spec schema', () => {
  it('fills in missing descriptions and empty member lists', () => {
    expect(
      MIOT_SPEC.parse({
        type: 'urn:miot-spec-v2:device:light:0:x:1',
        services: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:service:light:0:x:1',
            properties: [
              { iid: 1, type: 'urn:miot-spec-v2:property:on:0:x:1', format: 'bool', access: [] },
            ],
            actions: [{ iid: 1, type: 'urn:miot-spec-v2:action:toggle:0:x:1', in: [], out: [] }],
            events: [{ iid: 1, type: 'urn:miot-spec-v2:event:on:0:x:1', arguments: [1] }],
          },
          { iid: 2, type: 'urn:miot-spec-v2:service:empty:0:x:1' },
        ],
      }),
    ).toStrictEqual({
      type: 'urn:miot-spec-v2:device:light:0:x:1',
      description: '',
      services: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:service:light:0:x:1',
          description: '',
          properties: [
            {
              iid: 1,
              type: 'urn:miot-spec-v2:property:on:0:x:1',
              description: '',
              format: 'bool',
              access: [],
            },
          ],
          actions: [
            {
              iid: 1,
              type: 'urn:miot-spec-v2:action:toggle:0:x:1',
              description: '',
              in: [],
              out: [],
            },
          ],
          events: [
            { iid: 1, type: 'urn:miot-spec-v2:event:on:0:x:1', description: '', arguments: [1] },
          ],
        },
        {
          iid: 2,
          type: 'urn:miot-spec-v2:service:empty:0:x:1',
          description: '',
          properties: [],
          actions: [],
          events: [],
        },
      ],
    });
  });
});

describe('device kinds', () => {
  it('follow the device URN type', () => {
    expect(deviceKindOf(urn('device', 'air-purifier'))).toBe('air_purifier');
    expect(deviceKindOf(urn('device', 'video-doorbell'))).toBe('doorbell');
    expect(deviceKindOf(urn('device', 'temperature-humidity-sensor'))).toBe('sensor');
    expect(deviceKindOf(urn('device', 'kettle'))).toBe('other');
    const kinds = {
      light: 'light',
      outlet: 'plug',
      switch: 'switch',
      humidifier: 'humidifier',
      dehumidifier: 'dehumidifier',
      'air-conditioner': 'air_conditioner',
      heater: 'heater',
      fan: 'fan',
      thermostat: 'thermostat',
      camera: 'camera',
      doorbell: 'doorbell',
      lock: 'lock',
      'door-lock': 'lock',
      vacuum: 'vacuum',
      curtain: 'cover',
      'window-opener': 'cover',
      television: 'television',
      speaker: 'speaker',
      'ir-remote-control': 'ir_blaster',
      gateway: 'gateway',
      'air-monitor': 'sensor',
    };
    for (const [type, kind] of Object.entries(kinds)) {
      expect(deviceKindOf(urn('device', type))).toBe(kind);
    }
  });
});

describe('the spec index', () => {
  it('picks the highest released version for a model', () => {
    const index = MIOT_SPEC_INDEX.parse({
      instances: [
        { model: 'a.b.c', version: 1, type: 'one' },
        { model: 'a.b.c', version: 3, type: 'three' },
        { model: 'a.b.c', version: 2, type: 'two' },
        { model: 'x.y.z', version: 9, type: 'other' },
      ],
    });
    expect(specTypeForModel(index, 'a.b.c')).toBe('three');
    expect(specTypeForModel(index, 'none')).toBeNull();
    const tied = MIOT_SPEC_INDEX.parse({
      instances: [
        { model: 'm', version: 2, type: 'first' },
        { model: 'm', version: 2, type: 'second' },
      ],
    });
    expect(specTypeForModel(tied, 'm')).toBe('first');
  });
});

describe('catalogue mapping', () => {
  it.each(RULES)('maps %s/%s as %s onto %s', (serviceName, propertyName, shape, key) => {
    const model = modelFromSpec(
      specWith([service(serviceName, [property(propertyName, SHAPES[shape])])]),
    );
    expect(model.capabilities.map((capability) => capability.key)).toStrictEqual([key]);
  });

  it('reports a door as open when its magnets lose contact, as every provider does', () => {
    const sensor = modelFromSpec(
      specWith([service('magnet-sensor', [property('contact-state')])], 'magnet-sensor'),
    );
    expect(sensor.bindings.get('contact')).toMatchObject({ codec: { kind: 'inverted-boolean' } });
    const numeric = modelFromSpec(
      specWith(
        [service('magnet-sensor', [property('contact-state', { format: 'uint8' })])],
        'magnet-sensor',
      ),
    );
    expect(numeric.bindings.get('contact')).toBeUndefined();
    const motion = modelFromSpec(specWith([service('motion-sensor', [property('motion-state')])]));
    expect(motion.bindings.get('motion')).toMatchObject({ codec: { kind: 'boolean' } });
  });

  it('keeps vendor properties and kind mismatches as raw capabilities', () => {
    const model = modelFromSpec(
      specWith([
        service('light', [
          property('color', { iid: 4, format: 'string' }),
          property('on', { iid: 5, type: urn('property', 'on', 'zhimi-spec') }),
          property('brightness', { iid: 6, format: 'bool' }),
          property('color', { iid: 7, format: 'bool' }),
        ]),
      ]),
    );
    expect(model.capabilities.map(({ key }) => key)).toStrictEqual([
      'raw:2.4',
      'raw:2.5',
      'raw:2.6',
      'raw:2.7',
    ]);
    expect(model.capabilities.map(({ label }) => label)).toStrictEqual([
      'light: color',
      'light: on',
      'light: brightness',
      'light: color',
    ]);
  });

  it('gives each catalogue key to the first property only', () => {
    const model = modelFromSpec(
      specWith([
        service('air-purifier', [property('on', { iid: 1 })]),
        service('switch', [property('on', { iid: 1 })], { iid: 3 }),
      ]),
    );
    expect(model.capabilities.map(({ key, label }) => [key, label])).toStrictEqual([
      ['power', 'Power'],
      ['raw:3.1', 'switch: on'],
    ]);
  });

  it('labels raw capabilities from the URN names when descriptions are blank', () => {
    const model = modelFromSpec(
      specWith([
        service('custom', [property('speed', { description: ' ', format: 'uint8' })], {
          description: ' ',
        }),
      ]),
    );
    expect(model.capabilities[0]?.label).toBe('custom: speed');
  });

  it('derives access from the access list', () => {
    const model = modelFromSpec(
      specWith([
        service('custom', [
          property('a', { iid: 1, access: ['read'] }),
          property('b', { iid: 2, access: ['notify'] }),
          property('c', { iid: 3, access: ['write'] }),
          property('d', { iid: 4, access: ['write', 'notify'] }),
          property('e', { iid: 5, access: [] }),
        ]),
      ]),
    );
    expect(model.capabilities.map(({ key, access }) => [key, access])).toStrictEqual([
      ['raw:2.1', 'read'],
      ['raw:2.2', 'read'],
      ['raw:2.3', 'write'],
      ['raw:2.4', 'read_write'],
    ]);
    expect(model.problems).toStrictEqual([
      `${urn('property', 'e')} is neither readable nor writable`,
    ]);
    const bindings = [...model.bindings.values()];
    expect(
      bindings.map((binding) => binding.kind === 'property' && binding.readable),
    ).toStrictEqual([true, false, false, false]);
  });

  it('records unusable properties as problems and maps the rest', () => {
    const model = modelFromSpec(
      specWith([
        service('custom', [
          property('f', { iid: 1, format: 'float' }),
          property('g', { iid: 2, format: 'uint8' }),
        ]),
      ]),
    );
    expect(model.capabilities.map(({ key }) => key)).toStrictEqual(['raw:2.2']);
    expect(model.problems).toStrictEqual([
      `${urn('property', 'f')}: The MIoT spec for ${urn('property', 'f')} is unusable: expected a value-range for a float, received none.`,
    ]);
  });

  it('maps actions with their inputs as named arguments', () => {
    const model = modelFromSpec(
      specWith([
        service(
          'filter',
          [
            property('filter-life-level', { iid: 1, format: 'uint8', 'value-range': [0, 100, 1] }),
            property('level', { iid: 2, format: 'uint8', access: [] }),
            property('level', { iid: 3, format: 'uint8', access: [] }),
          ],
          {
            actions: [
              {
                iid: 1,
                type: urn('action', 'reset-filter-life'),
                description: 'Reset',
                in: [],
                out: [],
              },
              {
                iid: 2,
                type: urn('action', 'reset-filter-life'),
                description: 'Again',
                in: [2, 3],
                out: [],
              },
              { iid: 3, type: urn('action', 'broken'), description: 'Broken', in: [9], out: [] },
              { iid: 5, type: urn('action', 'pair'), description: 'Pair', in: [1, 2], out: [] },
            ],
          },
        ),
      ]),
    );
    expect(model.capabilities.slice(1, 3)).toStrictEqual([
      { key: 'filter_reset', label: 'Reset filter', access: 'write', value: { kind: 'action' } },
      {
        key: 'raw:action.2.2',
        label: 'filter: Again',
        access: 'write',
        value: { kind: 'action', arguments: ['level', 'level-3'] },
      },
    ]);
    expect(model.bindings.get('raw:action.2.2')).toMatchObject({
      kind: 'action',
      siid: 2,
      aiid: 2,
      name: 'reset-filter-life',
      inputs: [
        { name: 'level', piid: 2 },
        { name: 'level-3', piid: 3 },
      ],
    });
    expect(model.capabilities.at(-1)?.value).toStrictEqual({
      kind: 'action',
      arguments: ['filter-life-level', 'level'],
    });
    expect(propertyKeyOf(model, 2, 5)).toBeNull();
    expect(propertyKeyOf(model, 2, 1)).toBe('filter_life');
    expect(model.problems.at(-1)).toBe(
      `${urn('action', 'broken')}: The MIoT spec for ${urn('action', 'broken')} is unusable: expected input property 9 in service 2, received none.`,
    );
  });

  it('rethrows anything that is not a spec problem', () => {
    const hostile = specWith([
      service('custom', [
        property('x', { iid: 1, 'value-list': [{ value: 1, description: 'a' }] }),
      ]),
    ]);
    Object.defineProperty(hostile.services[0]?.properties[0] ?? {}, 'access', {
      get: () => {
        throw new TypeError('boom');
      },
    });
    expect(() => modelFromSpec(hostile)).toThrow(new TypeError('boom'));
  });

  it('finds the capability bound to a property address', () => {
    const model = modelFromSpec(fixture('zhimi-mb5'));
    expect(propertyKeyOf(model, 2, 1)).toBe('power');
    expect(propertyKeyOf(model, 4, 1)).toBe('filter_life');
    expect(propertyKeyOf(model, 4, 99)).toBeNull();
    expect(propertyKeyOf(model, 99, 1)).toBeNull();
  });
});

describe('real MIoT specs', () => {
  const cases = [
    [
      'zhimi-mb5',
      'air_purifier',
      ['power', 'purifier_mode', 'fan_mode', 'pm25', 'filter_life', 'filter_reset'],
    ],
    [
      'zhimi-ca4',
      'humidifier',
      ['power', 'mist_level', 'target_humidity', 'water_level', 'humidity'],
    ],
    [
      'nwt-wdh318efw1',
      'dehumidifier',
      ['power', 'fan_mode', 'humidity', 'child_lock', 'status_light'],
    ],
    [
      'yeelink-color4',
      'light',
      ['power', 'brightness', 'color_temperature', 'color', 'light_effect'],
    ],
    ['lumi-aq2', 'sensor', ['motion', 'illuminance']],
    ['lumi-v2', 'sensor', ['contact']],
    ['lumi-mgl03', 'gateway', ['firmware']],
    ['isa-hldb6', 'doorbell', ['motion_detection']],
    [
      'xiaomi-091ac1',
      'camera',
      ['power', 'night_vision', 'motion_detection', 'call_status', 'volume'],
    ],
  ] as const;

  it.each(cases)('%s maps to a valid %s with its catalogue capabilities', (name, kind, keys) => {
    const model = modelFromSpec(fixture(name));
    expect(model.kind).toBe(kind);
    const present = model.capabilities.map(({ key }) => key);
    expect(present).toStrictEqual(expect.arrayContaining([...keys]));
    expect(new Set(present).size).toBe(present.length);
    for (const capability of model.capabilities) {
      expect(DEVICE_CAPABILITY.safeParse(capability).success).toBe(true);
    }
    const settings = fixture(name).services.flatMap((entry) =>
      entry.properties.filter(({ access }) => access.length > 0),
    );
    const bound = [...model.bindings.values()].filter((binding) => binding.kind === 'property');
    expect(bound).toHaveLength(settings.length);
  });

  it('converts the light colour between RGB and hue, saturation and value', () => {
    const light = modelFromSpec(fixture('yeelink-color4'));
    expect(light.bindings.get('color')).toMatchObject({
      kind: 'property',
      codec: { kind: 'color' },
    });
  });

  it('exposes the camera call status as idle, calling and busy', () => {
    const camera = modelFromSpec(fixture('xiaomi-091ac1'));
    expect(camera.capabilities.find(({ key }) => key === 'call_status')?.value).toStrictEqual({
      kind: 'enum',
      options: ['Idle Hang Up', 'Calling', 'Busy'],
    });
  });
});
