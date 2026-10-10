import { describe, expect, it } from 'vitest';
import { CAPABILITY_DEFINITION, type CapabilityDefinition } from '../src/definition-schema';
import { deviceKindOf } from '../src/device-kind';
import { IGNORED_CAPABILITIES, mapDevice, statusOfComponent } from '../src/device-mapping';
import { SmartThingsResponseError } from '../src/errors';
import { DEVICE, type Device } from '../src/rest-schemas';

function deviceOf(overrides: Record<string, unknown>): Device {
  return DEVICE.parse({
    deviceId: 'device-1',
    label: 'Living room AC',
    name: 'Samsung AC',
    manufacturerName: 'Samsung Electronics',
    presentationId: 'DA-AC-RAC-01001',
    locationId: 'location-1',
    roomId: 'room-1',
    type: 'OCF',
    components: [],
    ...overrides,
  });
}

function airConditioner(): Device {
  return deviceOf({
    ocf: { modelNumber: 'AC-2026-TEST', firmwareVersion: '0.1.0' },
    healthState: { state: 'ONLINE' },
    components: [
      {
        id: 'main',
        label: 'main',
        categories: [{ name: 'AirConditioner', categoryType: 'manufacturer' }],
        capabilities: [
          { id: 'switch', version: 1, status: { switch: { value: 'on' } } },
          {
            id: 'thermostatCoolingSetpoint',
            version: 1,
            status: {
              coolingSetpoint: { value: 23, unit: 'C' },
              coolingSetpointRange: { value: { minimum: 16, maximum: 30, step: 1 } },
            },
          },
          {
            id: 'thermostatHeatingSetpoint',
            version: 1,
            status: { heatingSetpoint: { value: 20, unit: 'C' } },
          },
          {
            id: 'airConditionerMode',
            version: 1,
            status: {
              airConditionerMode: { value: 'cool' },
              supportedAcModes: { value: ['cool', 'dry'] },
            },
          },
          {
            id: 'temperatureMeasurement',
            version: 1,
            status: { temperature: { value: 25.5, unit: 'C' } },
          },
          { id: 'healthCheck', version: 1 },
          {
            id: 'custom.disabledCapabilities',
            version: 1,
            status: { disabledCapabilities: { value: ['audioVolume'] } },
          },
          { id: 'audioVolume', version: 1, status: { volume: { value: 30 } } },
          { id: 'custom.spiMode', version: 1, status: { spiMode: { value: 'off' } } },
          { id: 'refresh', version: 1 },
        ],
      },
      {
        id: 'freezer',
        label: 'Freezer drawer',
        categories: [],
        capabilities: [
          { id: 'switch', version: 1, status: { switch: { value: 'off' } } },
          { id: 'custom.spiMode', version: 1, status: { spiMode: { value: 'on' } } },
          { id: 'custom.dryMode', version: 2, status: { dryMode: { value: 'off' } } },
        ],
      },
    ],
  });
}

function definitions(): ReadonlyMap<string, CapabilityDefinition> {
  return new Map([
    [
      'custom.dryMode@2',
      CAPABILITY_DEFINITION.parse({
        id: 'custom.dryMode',
        version: 2,
        attributes: { dryMode: { schema: { properties: { value: { type: 'string' } } } } },
        commands: { dry: { name: 'dry', arguments: [] } },
      }),
    ],
    [
      'switch@1',
      CAPABILITY_DEFINITION.parse({
        id: 'switch',
        version: 1,
        attributes: {
          switch: { schema: { properties: { value: { type: 'string', enum: ['on', 'off'] } } } },
        },
        commands: { on: { name: 'on', arguments: [] }, off: { name: 'off', arguments: [] } },
      }),
    ],
    [
      'refresh@1',
      CAPABILITY_DEFINITION.parse({
        id: 'refresh',
        version: 1,
        commands: { refresh: { name: 'refresh', arguments: [] } },
      }),
    ],
    [
      'thermostatHeatingSetpoint@1',
      CAPABILITY_DEFINITION.parse({
        id: 'thermostatHeatingSetpoint',
        version: 1,
        attributes: {
          heatingSetpoint: {
            schema: { properties: { value: { type: 'number' } } },
            setter: 'setHeatingSetpoint',
          },
          heatingSetpointRange: { schema: { properties: { value: { type: 'object' } } } },
        },
        commands: {
          setHeatingSetpoint: {
            name: 'setHeatingSetpoint',
            arguments: [{ name: 'setpoint', schema: { type: 'number' } }],
          },
        },
      }),
    ],
  ]);
}

function mapped(): ReturnType<typeof mapDevice> {
  return mapDevice(airConditioner(), {
    rooms: new Map([['room-1', 'Living room']]),
    definitions: definitions(),
  });
}

describe('mapping a SmartThings device', () => {
  it('describes the device itself', () => {
    const { capabilities: _capabilities, ...device } = mapped().device;
    expect(device).toEqual({
      provider: 'smartthings',
      externalId: 'device-1',
      parentExternalId: null,
      kind: 'air_conditioner',
      name: 'Living room AC',
      model: 'AC-2026-TEST',
      manufacturer: 'Samsung Electronics',
      room: 'Living room',
      online: true,
      details: {
        locationId: 'location-1',
        integration: 'OCF',
        components: ['main', 'freezer'],
        firmware: '0.1.0',
        health: 'ONLINE',
        capabilitiesWithoutDefinition: [
          'thermostatCoolingSetpoint',
          'airConditionerMode',
          'temperatureMeasurement',
          'custom.spiMode',
        ],
      },
    });
  });

  it('maps standard capabilities, keeps the second claimant of a key as raw, and exposes the rest raw', () => {
    expect(
      mapped().device.capabilities.map((capability) => [
        capability.key,
        capability.label,
        capability.access,
      ]),
    ).toEqual([
      ['power', 'Power', 'read_write'],
      ['target_temperature', 'Target temperature', 'read_write'],
      [
        'raw:thermostat_heating_setpoint.target_temperature',
        'Target temperature (thermostat heating setpoint)',
        'read_write',
      ],
      ['hvac_mode', 'Mode', 'read_write'],
      ['temperature', 'Temperature', 'read'],
      ['raw:custom.spi_mode.spi_mode', 'Custom spi mode spi mode', 'read'],
      ['raw:refresh:refresh', 'Refresh: refresh', 'write'],
      ['raw:freezer-power', 'Freezer drawer: Power', 'read_write'],
      ['raw:freezer-custom.spi_mode.spi_mode', 'Freezer drawer: Custom spi mode spi mode', 'read'],
      ['raw:freezer-custom.dry_mode.dry_mode', 'Freezer drawer: Custom dry mode dry mode', 'read'],
      ['raw:freezer-custom.dry_mode:dry', 'Freezer drawer: Custom dry mode: dry', 'write'],
    ]);
  });

  it('keeps the bindings in the same order with their components', () => {
    expect(mapped().bindings.map((binding) => [binding.capability.key, binding.component])).toEqual(
      mapped().device.capabilities.map((capability, index) => [
        capability.key,
        index >= 7 ? 'freezer' : 'main',
      ]),
    );
  });

  it('sends commands to the component a binding belongs to', () => {
    const freezer = mapped().bindings.find(
      (binding) => binding.capability.key === 'raw:freezer-power',
    );
    expect(freezer?.write?.(true)).toEqual([
      { component: 'freezer', capability: 'switch', command: 'on' },
    ]);
    const heating = mapped().bindings.find(
      (binding) => binding.capability.key === 'raw:thermostat_heating_setpoint.target_temperature',
    );
    expect(heating?.write?.(21)).toEqual([
      {
        component: 'main',
        capability: 'thermostatHeatingSetpoint',
        command: 'setHeatingSetpoint',
        arguments: [21],
      },
    ]);
    const temperature = mapped().bindings.find(
      (binding) => binding.capability.key === 'temperature',
    );
    expect(temperature?.write).toBeNull();
  });

  it('keeps the embedded status by component', () => {
    expect(mapped().status['freezer']).toEqual({
      switch: { switch: { value: 'off' } },
      'custom.spiMode': { spiMode: { value: 'on' } },
      'custom.dryMode': { dryMode: { value: 'off' } },
    });
    expect(mapped().status['main']?.['switch']).toEqual({ switch: { value: 'on' } });
  });

  it('ignores marker capabilities', () => {
    expect([...IGNORED_CAPABILITIES]).toEqual([
      'actuator',
      'sensor',
      'healthCheck',
      'ocf',
      'execute',
      'configuration',
      'polling',
      'custom.disabledCapabilities',
    ]);
  });
});

describe('device details that SmartThings may leave out', () => {
  const minimal = (overrides: Record<string, unknown>): ReturnType<typeof mapDevice>['device'] =>
    mapDevice(
      deviceOf({
        label: null,
        roomId: null,
        presentationId: null,
        type: null,
        components: [{ id: 'main', categories: [], capabilities: [] }],
        ...overrides,
      }),
      { rooms: new Map(), definitions: new Map() },
    ).device;

  it('falls back from the label to the name to the id', () => {
    expect(minimal({}).name).toBe('Samsung AC');
    expect(minimal({ name: null }).name).toBe('device-1');
  });

  it('takes the model from the most specific source available', () => {
    expect(
      minimal({ viper: { modelName: 'Viper 1', swVersion: '2.0' }, deviceTypeName: 'DTH' }).model,
    ).toBe('Viper 1');
    expect(
      minimal({ ocf: { modelNumber: '' }, deviceTypeName: 'DTH', presentationId: 'P' }).model,
    ).toBe('DTH');
    expect(minimal({ presentationId: 'P' }).model).toBe('P');
    expect(minimal({}).model).toBe('device-1');
  });

  it('reports the firmware from Viper devices and nothing when there is none', () => {
    expect(minimal({ viper: { swVersion: '2.0' } }).details['firmware']).toBe('2.0');
    expect(minimal({}).details['firmware']).toBeNull();
    expect(minimal({}).details['integration']).toBeNull();
  });

  it('is online unless health says otherwise, and says when health was not reported', () => {
    expect(minimal({}).online).toBe(true);
    expect(minimal({}).details['health']).toBe('UNREPORTED');
    expect(minimal({ healthState: { state: 'OFFLINE' } }).online).toBe(false);
  });

  it('names no room when the room is unknown or absent', () => {
    expect(minimal({}).room).toBeNull();
    expect(minimal({ roomId: 'elsewhere' }).room).toBeNull();
  });

  it('keeps the parent device, and treats an empty parent as none', () => {
    expect(minimal({ parentDeviceId: 'hub-1' }).parentExternalId).toBe('hub-1');
    expect(minimal({ parentDeviceId: '' }).parentExternalId).toBeNull();
  });

  it('lists each capability without a definition once', () => {
    const device = minimal({
      components: [
        { id: 'main', categories: [], capabilities: [{ id: 'refresh' }] },
        { id: 'second', categories: [], capabilities: [{ id: 'refresh' }] },
      ],
    });
    expect(device.details['capabilitiesWithoutDefinition']).toEqual(['refresh']);
  });

  it('numbers raw keys that would otherwise collide', () => {
    const device = minimal({
      components: [
        {
          id: 'main',
          categories: [],
          capabilities: [
            { id: 'fooBar', status: { x: { value: 1 } } },
            { id: 'foo_bar', status: { x: { value: 2 } } },
            { id: 'foo.bar', status: { x: { value: 3 } } },
            { id: 'foo_Bar', status: { x: { value: 4 } } },
          ],
        },
      ],
    });
    expect(device.capabilities.map((capability) => capability.key)).toEqual([
      'raw:foo_bar.x',
      'raw:foo_bar.x_2',
      'raw:foo.bar.x',
      'raw:foo_bar.x_3',
    ]);
  });

  it('numbers a second fallback key for the same standard capability', () => {
    const device = minimal({
      components: [
        {
          id: 'main',
          categories: [],
          capabilities: [
            { id: 'presenceSensor', status: {} },
            { id: 'occupancySensor', status: {} },
            { id: 'thermostatFanMode', status: {} },
            { id: 'airConditionerFanMode', status: {} },
          ],
        },
      ],
    });
    expect(device.capabilities.map((capability) => capability.key)).toEqual([
      'fan_mode',
      'raw:thermostat_fan_mode.fan_mode',
      'occupancy',
      'raw:presence_sensor.occupancy',
    ]);
  });

  it('refuses a device whose component name cannot form a capability key', () => {
    expect(() =>
      minimal({
        components: [
          { id: 'main', categories: [], capabilities: [] },
          { id: '!!!', categories: [], capabilities: [{ id: 'switch' }] },
        ],
      }),
    ).toThrow(SmartThingsResponseError);
    expect(() =>
      minimal({
        components: [
          { id: 'main', categories: [], capabilities: [] },
          { id: '!!!', categories: [], capabilities: [{ id: 'switch' }] },
        ],
      }),
    ).toThrow(/^The SmartThings device did not have the expected shape: .*Received "device-1"\.$/s);
  });

  it('exposes a capability raw when its mapper finds nothing to offer', () => {
    const device = minimal({
      components: [
        {
          id: 'main',
          categories: [],
          capabilities: [
            {
              id: 'samsungvd.mediaInputSource',
              status: { inputSource: { value: 'dtv' }, supportedInputSourcesMap: { value: [] } },
            },
          ],
        },
      ],
    });
    expect(device.capabilities.map((capability) => capability.key)).toEqual([
      'raw:samsungvd.media_input_source.input_source',
      'raw:samsungvd.media_input_source.supported_input_sources_map',
    ]);
  });

  it('reads no status from capabilities that carry none', () => {
    expect(
      statusOfComponent({
        id: 'main',
        categories: [],
        capabilities: [{ id: 'a', status: null }, { id: 'b' }],
      }),
    ).toStrictEqual({});
  });
});

describe('the kind of a device', () => {
  const kindOf = (categories: readonly (readonly [string, 'user' | 'manufacturer'])[]): string =>
    deviceKindOf([
      {
        id: 'main',
        capabilities: [],
        categories: categories.map(([name, categoryType]) => ({ name, categoryType })),
      },
    ]);

  it('prefers the category the person chose over the manufacturer one', () => {
    expect(
      kindOf([
        ['Light', 'manufacturer'],
        ['Switch', 'user'],
      ]),
    ).toBe('switch');
  });

  it('skips unknown categories and falls back to other', () => {
    expect(
      kindOf([
        ['Mystery', 'user'],
        ['Fan', 'manufacturer'],
      ]),
    ).toBe('fan');
    expect(kindOf([['Mystery', 'manufacturer']])).toBe('other');
    expect(deviceKindOf([{ id: 'main', categories: [], capabilities: [] }])).toBe('other');
  });

  it('looks at the other components when the main one has no category', () => {
    expect(
      deviceKindOf([
        { id: 'main', categories: [], capabilities: [] },
        {
          id: 'sub',
          capabilities: [],
          categories: [{ name: 'Thermostat', categoryType: 'manufacturer' }],
        },
      ]),
    ).toBe('thermostat');
  });

  it('maps every known SmartThings category', () => {
    const expected: Record<string, string> = {
      Light: 'light',
      Switch: 'switch',
      SmartPlug: 'plug',
      AirPurifier: 'air_purifier',
      Humidifier: 'humidifier',
      Dehumidifier: 'dehumidifier',
      AirConditioner: 'air_conditioner',
      Fan: 'fan',
      Thermostat: 'thermostat',
      Camera: 'camera',
      DoorBell: 'doorbell',
      SmartLock: 'lock',
      RobotCleaner: 'vacuum',
      StickVacuumCleaner: 'vacuum',
      Blind: 'cover',
      Shade: 'cover',
      GarageDoor: 'cover',
      Television: 'television',
      SmartMonitor: 'television',
      Projector: 'television',
      Speaker: 'speaker',
      NetworkAudio: 'speaker',
      HomeTheater: 'speaker',
      Receiver: 'speaker',
      IrRemote: 'ir_remote',
      RemoteController: 'ir_remote',
      Hub: 'gateway',
      Bridges: 'gateway',
      ContactSensor: 'sensor',
      MotionSensor: 'sensor',
      LeakSensor: 'sensor',
      SmokeDetector: 'sensor',
      TempSensor: 'sensor',
      HumiditySensor: 'sensor',
      TempHumiditySensor: 'sensor',
      MultiFunctionalSensor: 'sensor',
      PresenceSensor: 'sensor',
      AirQualityDetector: 'sensor',
      GenericSensor: 'sensor',
      LightSensor: 'sensor',
      SoundSensor: 'sensor',
      Button: 'sensor',
      Washer: 'appliance',
      Dryer: 'appliance',
      Dishwasher: 'appliance',
      Refrigerator: 'appliance',
      Oven: 'appliance',
      Microwave: 'appliance',
      Range: 'appliance',
      Cooktop: 'appliance',
      KitchenHood: 'appliance',
      CoffeeMaker: 'appliance',
      RiceCooker: 'appliance',
      ClothingCareMachine: 'appliance',
      WaterPurifier: 'appliance',
      WaterHeater: 'heater',
    };
    for (const [category, kind] of Object.entries(expected)) {
      expect(kindOf([[category, 'manufacturer']])).toBe(kind);
    }
  });
});
