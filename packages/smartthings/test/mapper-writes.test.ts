import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { mapperFor, single, statusOf, viewOf, writeOf } from './helpers';

describe('writing a value of the wrong type', () => {
  const cases: readonly (readonly [string, JsonValue, string])[] = [
    ['windowShade', 1, 'The windowShade command cannot be built: expected text. Received 1.'],
    ['alarm', 'on', 'The alarm command cannot be built: expected true or false. Received "on".'],
    [
      'colorTemperature',
      'warm',
      'The colorTemperature command cannot be built: expected a number. Received "warm".',
    ],
    ['mediaPlayback', 2, 'The mediaPlayback command cannot be built: expected text. Received 2.'],
    [
      'samsungvd.mediaInputSource',
      2,
      'The samsungvd.mediaInputSource command cannot be built: expected text. Received 2.',
    ],
    ['tvChannel', '5', 'The tvChannel command cannot be built: expected a number. Received "5".'],
    [
      'custom.launchapp',
      5,
      'The custom.launchapp command cannot be built: expected text. Received 5.',
    ],
  ];

  it('names the capability and what it received', () => {
    const view = viewOf({
      'samsungvd.mediaInputSource': { supportedInputSourcesMap: [{ id: 'dtv' }] },
    });
    for (const [capability, value, message] of cases) {
      expect(() => writeOf(single(capability, view), value)).toThrow(message);
    }
  });

  it('sends commands without arguments as just the capability and command', () => {
    const power = single('switch', viewOf({}));
    expect(writeOf(power, true)).toStrictEqual([{ capability: 'switch', command: 'on' }]);
  });
});

describe('the Samsung TV remote', () => {
  it('presses a known key and refuses an unknown one', () => {
    const remote = single('samsungvd.remoteControl', viewOf({}));
    expect(writeOf(remote, 'home')).toStrictEqual([
      {
        capability: 'samsungvd.remoteControl',
        command: 'send',
        arguments: ['HOME', 'PRESS_AND_RELEASED'],
      },
    ]);
    expect(() => writeOf(remote, 'skip')).toThrow('SmartThings cannot send this key');
    expect(() => writeOf(remote, 'power')).toThrow('SmartThings cannot send this key');
    expect(remote.read(statusOf({}))).toBeUndefined();
  });
});

describe('the Samsung TV input source', () => {
  it('lists the sources it reports and adds the current one only when it is a name', () => {
    const options = (current: JsonValue): unknown =>
      single(
        'samsungvd.mediaInputSource',
        viewOf({
          'samsungvd.mediaInputSource': {
            supportedInputSourcesMap: [{ id: 'dtv' }],
            inputSource: current,
          },
        }),
      ).value;
    expect(options('hdmi1')).toEqual({ kind: 'enum', options: ['dtv', 'hdmi1'] });
    expect(options('dtv')).toEqual({ kind: 'enum', options: ['dtv'] });
    expect(options('')).toEqual({ kind: 'enum', options: ['dtv'] });
    expect(options(4)).toEqual({ kind: 'enum', options: ['dtv'] });
  });
});

describe('reading reported values', () => {
  it('reads the boolean sensors from the values that mean detected', () => {
    const cases: readonly (readonly [string, string, string, string])[] = [
      ['motionSensor', 'motion', 'active', 'inactive'],
      ['waterSensor', 'water', 'wet', 'dry'],
      ['occupancySensor', 'occupancy', 'occupied', 'unoccupied'],
      ['presenceSensor', 'presence', 'present', 'not present'],
      ['accelerationSensor', 'acceleration', 'active', 'inactive'],
    ];
    for (const [capability, attribute, detected, clear] of cases) {
      const sensor = single(capability, viewOf({}));
      expect(sensor.read(statusOf({ [capability]: { [attribute]: detected } }))).toBe(true);
      expect(sensor.read(statusOf({ [capability]: { [attribute]: clear } }))).toBe(false);
    }
  });

  it('reads nothing from a power report that is missing', () => {
    const [power, energy] = mapperFor('powerConsumptionReport').map(viewOf({}));
    expect(power?.read(statusOf({}))).toBeUndefined();
    expect(energy?.read(statusOf({ powerConsumptionReport: {} }))).toBeUndefined();
  });

  it('takes the colour temperature unit the device reports', () => {
    const temperature = single(
      'colorTemperature',
      viewOf({ colorTemperature: { colorTemperature: { value: 3000, unit: 'kelvin' } } }),
    );
    expect(temperature.value).toEqual({
      kind: 'number',
      min: 1,
      max: 30000,
      step: 1,
      unit: 'kelvin',
    });
  });
});
