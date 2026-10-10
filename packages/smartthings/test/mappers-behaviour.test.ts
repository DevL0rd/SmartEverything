import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SmartThingsCommandError } from '../src/errors';
import { mapperFor, single, statusOf, viewOf, writeOf } from './helpers';

describe('switches, dimmers and colour', () => {
  it('reads and switches power', () => {
    const power = single('switch', viewOf({ switch: { switch: 'on' } }));
    expect(power.read(statusOf({ switch: { switch: 'on' } }))).toBe(true);
    expect(power.read(statusOf({ switch: { switch: 'off' } }))).toBe(false);
    expect(power.read(statusOf({ switch: { switch: null } }))).toBeUndefined();
    expect(power.read(statusOf({}))).toBeUndefined();
    expect(writeOf(power, true)).toEqual([{ capability: 'switch', command: 'on' }]);
    expect(writeOf(power, false)).toEqual([{ capability: 'switch', command: 'off' }]);
    expect(() => writeOf(power, 'on')).toThrow(
      new SmartThingsCommandError('switch', 'on', 'expected true or false'),
    );
  });

  it('reads and sets the level', () => {
    const brightness = single('switchLevel', viewOf({ switchLevel: { level: 10 } }));
    expect(brightness.read(statusOf({ switchLevel: { level: 55 } }))).toBe(55);
    expect(brightness.read(statusOf({ switchLevel: { level: '55' } }))).toBeUndefined();
    expect(writeOf(brightness, 75)).toEqual([
      { capability: 'switchLevel', command: 'setLevel', arguments: [75] },
    ]);
    expect(() => writeOf(brightness, '75')).toThrow(
      'The switchLevel command cannot be built: expected a number. Received "75".',
    );
  });

  it('converts hue between SmartThings percent and degrees, and takes the value from the level', () => {
    const color = single('colorControl', viewOf({ colorControl: {}, switchLevel: {} }));
    expect(
      color.read(
        statusOf({ colorControl: { hue: 33.3, saturation: 80 }, switchLevel: { level: 60 } }),
      ),
    ).toEqual({
      hue: 119.88,
      saturation: 80,
      value: 60,
    });
    expect(color.read(statusOf({ colorControl: { hue: 33.3, saturation: 80 } }))).toBeUndefined();
    expect(
      color.read(statusOf({ colorControl: { saturation: 80 }, switchLevel: { level: 60 } })),
    ).toBeUndefined();
    expect(
      color.read(statusOf({ colorControl: { hue: 10 }, switchLevel: { level: 60 } })),
    ).toBeUndefined();
    expect(writeOf(color, { hue: 120, saturation: 50, value: 30 })).toEqual([
      {
        capability: 'colorControl',
        command: 'setColor',
        arguments: [{ hue: 33.33, saturation: 50 }],
      },
      { capability: 'switchLevel', command: 'setLevel', arguments: [30] },
    ]);
  });

  it('treats a colour light without a level as fully bright', () => {
    const color = single('colorControl', viewOf({ colorControl: {} }));
    expect(color.sources).toEqual([
      { capability: 'colorControl', attribute: 'hue' },
      { capability: 'colorControl', attribute: 'saturation' },
    ]);
    expect(color.read(statusOf({ colorControl: { hue: 50, saturation: 100 } }))).toEqual({
      hue: 180,
      saturation: 100,
      value: 100,
    });
    expect(writeOf(color, { hue: 360, saturation: 0, value: 30 })).toEqual([
      { capability: 'colorControl', command: 'setColor', arguments: [{ hue: 100, saturation: 0 }] },
    ]);
    expect(() => writeOf(color, { hue: 400, saturation: 0, value: 0 })).toThrow(
      'The colorControl command cannot be built: expected a hue, saturation and value.',
    );
  });

  it('uses the colour temperature range the device reports', () => {
    const temperature = single(
      'colorTemperature',
      viewOf({ colorTemperature: { colorTemperatureRange: { minimum: 2200, maximum: 6500 } } }),
    );
    expect(temperature.value).toEqual({ kind: 'number', min: 2200, max: 6500, step: 1, unit: 'K' });
    expect(temperature.read(statusOf({ colorTemperature: { colorTemperature: 4000 } }))).toBe(4000);
    expect(writeOf(temperature, 2700)).toEqual([
      { capability: 'colorTemperature', command: 'setColorTemperature', arguments: [2700] },
    ]);
  });
});

describe('ranges reported by a device', () => {
  const setpoint = (range: JsonValue, unit = 'C'): unknown =>
    single(
      'thermostatCoolingSetpoint',
      viewOf({
        thermostatCoolingSetpoint: {
          coolingSetpoint: { value: 20, unit },
          coolingSetpointRange: range,
        },
      }),
    ).value;

  it('takes the minimum, maximum and step', () => {
    expect(setpoint({ minimum: 16, maximum: 30, step: 1 })).toEqual({
      kind: 'number',
      min: 16,
      max: 30,
      step: 1,
      unit: 'C',
    });
  });

  it('keeps the usual step when none or a meaningless one is reported', () => {
    expect(setpoint({ minimum: 16, maximum: 30 })).toEqual({
      kind: 'number',
      min: 16,
      max: 30,
      step: 0.5,
      unit: 'C',
    });
    expect(setpoint({ minimum: 16, maximum: 30, step: 0 })).toEqual({
      kind: 'number',
      min: 16,
      max: 30,
      step: 0.5,
      unit: 'C',
    });
  });

  it('falls back to the usual Celsius or Fahrenheit range when the report is unusable', () => {
    expect(setpoint(null)).toEqual({ kind: 'number', min: 5, max: 40, step: 0.5, unit: 'C' });
    expect(setpoint(null, 'F')).toEqual({ kind: 'number', min: 40, max: 104, step: 1, unit: 'F' });
    expect(setpoint([16, 30])).toEqual({ kind: 'number', min: 5, max: 40, step: 0.5, unit: 'C' });
    expect(setpoint({ minimum: 30, maximum: 16 })).toEqual({
      kind: 'number',
      min: 5,
      max: 40,
      step: 0.5,
      unit: 'C',
    });
    expect(setpoint({ minimum: 16 })).toEqual({
      kind: 'number',
      min: 5,
      max: 40,
      step: 0.5,
      unit: 'C',
    });
    expect(setpoint({ maximum: 16 })).toEqual({
      kind: 'number',
      min: 5,
      max: 40,
      step: 0.5,
      unit: 'C',
    });
  });

  it('accepts a range whose minimum equals its maximum', () => {
    expect(setpoint({ minimum: 20, maximum: 20 })).toEqual({
      kind: 'number',
      min: 20,
      max: 20,
      step: 0.5,
      unit: 'C',
    });
  });
});

describe('climate', () => {
  it('reads and sets the cooling and heating setpoints', () => {
    const cooling = single('thermostatCoolingSetpoint', viewOf({ thermostatCoolingSetpoint: {} }));
    expect(cooling.read(statusOf({ thermostatCoolingSetpoint: { coolingSetpoint: 23 } }))).toBe(23);
    expect(writeOf(cooling, 21.5)).toEqual([
      { capability: 'thermostatCoolingSetpoint', command: 'setCoolingSetpoint', arguments: [21.5] },
    ]);
    const heating = single('thermostatHeatingSetpoint', viewOf({ thermostatHeatingSetpoint: {} }));
    expect(heating.read(statusOf({ thermostatHeatingSetpoint: { heatingSetpoint: 19 } }))).toBe(19);
    expect(writeOf(heating, 20)).toEqual([
      { capability: 'thermostatHeatingSetpoint', command: 'setHeatingSetpoint', arguments: [20] },
    ]);
  });

  it('offers the modes the device reports, and the documented ones when it reports none', () => {
    const reported = single(
      'airConditionerMode',
      viewOf({ airConditionerMode: { supportedAcModes: ['cool', 'dry', '', 3] } }),
    );
    expect(reported.value).toEqual({ kind: 'enum', options: ['cool', 'dry'] });
    expect(reported.read(statusOf({ airConditionerMode: { airConditionerMode: 'dry' } }))).toBe(
      'dry',
    );
    expect(
      reported.read(statusOf({ airConditionerMode: { airConditionerMode: 4 } })),
    ).toBeUndefined();
    expect(writeOf(reported, 'cool')).toEqual([
      { capability: 'airConditionerMode', command: 'setAirConditionerMode', arguments: ['cool'] },
    ]);
    expect(() => writeOf(reported, 1)).toThrow(
      'The airConditionerMode command cannot be built: expected text. Received 1.',
    );
    const fallback = single(
      'thermostatMode',
      viewOf({ thermostatMode: { supportedThermostatModes: 'heat' } }),
    );
    expect(fallback.value).toEqual({
      kind: 'enum',
      options: ['auto', 'cool', 'eco', 'rush hour', 'emergency heat', 'heat', 'off'],
    });
  });

  it('sets the fan speed', () => {
    const speed = single('fanSpeed', viewOf({ fanSpeed: {} }));
    expect(writeOf(speed, 2)).toEqual([
      { capability: 'fanSpeed', command: 'setFanSpeed', arguments: [2] },
    ]);
  });

  it('reads temperature in the unit the device reports', () => {
    const temperature = single(
      'temperatureMeasurement',
      viewOf({ temperatureMeasurement: { temperature: { value: 70, unit: 'F' } } }),
    );
    expect(temperature.value).toEqual({
      kind: 'number',
      min: -460,
      max: 10000,
      step: 0.1,
      unit: 'F',
    });
    expect(temperature.read(statusOf({ temperatureMeasurement: { temperature: 70 } }))).toBe(70);
    expect(
      temperature.read(statusOf({ temperatureMeasurement: { temperature: Number.NaN } })),
    ).toBeUndefined();
    const plain = single('temperatureMeasurement', viewOf({ temperatureMeasurement: {} }));
    expect(plain.value).toEqual({ kind: 'number', min: -460, max: 10000, step: 0.1 });
  });
});

describe('media', () => {
  it('plays, pauses and reports playback', () => {
    const playback = single(
      'mediaPlayback',
      viewOf({ mediaPlayback: { supportedPlaybackCommands: ['play', 'pause', 'unknown'] } }),
    );
    expect(playback.value).toEqual({ kind: 'enum', options: ['playing', 'paused'] });
    expect(playback.read(statusOf({ mediaPlayback: { playbackStatus: 'paused' } }))).toBe('paused');
    expect(writeOf(playback, 'playing')).toEqual([
      { capability: 'mediaPlayback', command: 'play' },
    ]);
    expect(writeOf(playback, 'paused')).toEqual([
      { capability: 'mediaPlayback', command: 'pause' },
    ]);
    expect(writeOf(playback, 'stopped')).toEqual([
      { capability: 'mediaPlayback', command: 'stop' },
    ]);
    expect(writeOf(playback, 'fast forwarding')).toEqual([
      { capability: 'mediaPlayback', command: 'fastForward' },
    ]);
    expect(writeOf(playback, 'rewinding')).toEqual([
      { capability: 'mediaPlayback', command: 'rewind' },
    ]);
    expect(() => writeOf(playback, 'buffering')).toThrow(
      'The mediaPlayback command cannot be built: not a playback status. Received "buffering".',
    );
  });

  it('switches the Samsung input source by its id, and offers nothing when none is listed', () => {
    const view = viewOf({
      'samsungvd.mediaInputSource': {
        supportedInputSourcesMap: [
          { id: 'dtv', name: 'TV' },
          { name: 'nameless' },
          'HDMI2',
          { id: 'HDMI1' },
        ],
      },
    });
    const input = single('samsungvd.mediaInputSource', view);
    expect(input.value).toEqual({ kind: 'enum', options: ['dtv', 'HDMI1'] });
    expect(input.read(statusOf({ 'samsungvd.mediaInputSource': { inputSource: 'HDMI1' } }))).toBe(
      'HDMI1',
    );
    expect(writeOf(input, 'dtv')).toEqual([
      { capability: 'samsungvd.mediaInputSource', command: 'setInputSource', arguments: ['dtv'] },
    ]);
    const mapper = mapperFor('samsungvd.mediaInputSource');
    expect(
      mapper.map(viewOf({ 'samsungvd.mediaInputSource': { supportedInputSourcesMap: [] } })),
    ).toEqual([]);
    expect(
      mapper.map(viewOf({ 'samsungvd.mediaInputSource': { supportedInputSourcesMap: 'dtv' } })),
    ).toEqual([]);
  });

  it('reads and sets a numbered channel', () => {
    const channel = single('tvChannel', viewOf({ tvChannel: {} }));
    expect(channel.read(statusOf({ tvChannel: { tvChannel: '12' } }))).toBe(12);
    expect(channel.read(statusOf({ tvChannel: { tvChannel: '7-1' } }))).toBeUndefined();
    expect(channel.read(statusOf({ tvChannel: { tvChannel: 'x12' } }))).toBeUndefined();
    expect(channel.read(statusOf({ tvChannel: { tvChannel: 12 } }))).toBeUndefined();
    expect(writeOf(channel, 5)).toEqual([
      { capability: 'tvChannel', command: 'setTvChannel', arguments: ['5'] },
    ]);
  });

  it('launches a known app by its first Tizen id', () => {
    const launch = single('custom.launchapp', viewOf({ 'custom.launchapp': {} }));
    expect(launch.read(statusOf({}))).toBeUndefined();
    expect(writeOf(launch, 'Netflix')).toEqual([
      {
        capability: 'custom.launchapp',
        command: 'launchApp',
        arguments: ['3201907018807', 'Netflix'],
      },
    ]);
    expect(() => writeOf(launch, 'Nonexistent Player')).toThrow(
      'The custom.launchapp command cannot be built: not a known app. Received "Nonexistent Player".',
    );
  });

  it('mutes and restores the sound', () => {
    const mute = single('audioMute', viewOf({ audioMute: {} }));
    expect(mute.read(statusOf({ audioMute: { mute: 'muted' } }))).toBe(true);
    expect(writeOf(mute, true)).toEqual([{ capability: 'audioMute', command: 'mute' }]);
    expect(writeOf(mute, false)).toEqual([{ capability: 'audioMute', command: 'unmute' }]);
  });
});

describe('locks, covers, cleaners, buttons and alarms', () => {
  it('locks and unlocks, and does not guess an unknown lock state', () => {
    const lock = single('lock', viewOf({ lock: {} }));
    expect(lock.read(statusOf({ lock: { lock: 'locked' } }))).toBe(true);
    expect(lock.read(statusOf({ lock: { lock: 'unlocked' } }))).toBe(false);
    expect(writeOf(lock, true)).toEqual([{ capability: 'lock', command: 'lock' }]);
    expect(writeOf(lock, false)).toEqual([{ capability: 'lock', command: 'unlock' }]);
  });

  it('opens, closes and pauses a shade and reads where it is going', () => {
    const shade = single(
      'windowShade',
      viewOf({ windowShade: { supportedWindowShadeCommands: ['open', 'close'] } }),
    );
    expect(shade.value).toEqual({ kind: 'enum', options: ['open', 'close'] });
    const read = (state: string | number): unknown =>
      shade.read(statusOf({ windowShade: { windowShade: state } }));
    expect(read('open')).toBe('open');
    expect(read('opening')).toBe('open');
    expect(read('closed')).toBe('close');
    expect(read('closing')).toBe('close');
    expect(read('partially open')).toBe('pause');
    expect(read('unknown')).toBeUndefined();
    expect(read(3)).toBeUndefined();
    expect(writeOf(shade, 'pause')).toEqual([{ capability: 'windowShade', command: 'pause' }]);
    expect(() => writeOf(shade, 'up')).toThrow(
      'The windowShade command cannot be built: not open, close or pause. Received "up".',
    );
    const every = single('windowShade', viewOf({ windowShade: {} }));
    expect(every.value).toEqual({ kind: 'enum', options: ['open', 'close', 'pause'] });
  });

  it('sounds and silences the alarm', () => {
    const siren = single('alarm', viewOf({ alarm: {} }));
    expect(siren.read(statusOf({ alarm: { alarm: 'off' } }))).toBe(false);
    expect(siren.read(statusOf({ alarm: { alarm: 'strobe' } }))).toBe(true);
    expect(siren.read(statusOf({ alarm: { alarm: 1 } }))).toBeUndefined();
    expect(writeOf(siren, true)).toEqual([{ capability: 'alarm', command: 'both' }]);
    expect(writeOf(siren, false)).toEqual([{ capability: 'alarm', command: 'off' }]);
  });

  it('reads buttons as read-only with the values the device supports', () => {
    const button = single(
      'button',
      viewOf({ button: { supportedButtonValues: ['pushed', 'double'] } }),
    );
    expect(button.value).toEqual({ kind: 'enum', options: ['pushed', 'double'] });
    expect(button.write).toBeNull();
  });
});

describe('sensors and energy', () => {
  it('reads alarms from their detected values', () => {
    const smoke = single('smokeDetector', viewOf({ smokeDetector: {} }));
    expect(smoke.read(statusOf({ smokeDetector: { smoke: 'detected' } }))).toBe(true);
    expect(smoke.read(statusOf({ smokeDetector: { smoke: 'tested' } }))).toBe(true);
    expect(smoke.read(statusOf({ smokeDetector: { smoke: 'clear' } }))).toBe(false);
    const contact = single('contactSensor', viewOf({ contactSensor: {} }));
    expect(contact.read(statusOf({ contactSensor: { contact: 'open' } }))).toBe(true);
    expect(contact.read(statusOf({ contactSensor: { contact: 'closed' } }))).toBe(false);
  });

  it('splits the power consumption report into watts and kilowatt hours', () => {
    const [power, energy] = mapperFor('powerConsumptionReport').map(
      viewOf({ powerConsumptionReport: {} }),
    );
    const status = statusOf({
      powerConsumptionReport: { powerConsumption: { power: 85, energy: 12500 } },
    });
    expect(power?.read(status)).toBe(85);
    expect(energy?.read(status)).toBe(12.5);
    const missing = statusOf({ powerConsumptionReport: { powerConsumption: { power: 'x' } } });
    expect(power?.read(missing)).toBeUndefined();
    expect(energy?.read(missing)).toBeUndefined();
    const notAReport = statusOf({ powerConsumptionReport: { powerConsumption: [1, 2] } });
    expect(power?.read(notAReport)).toBeUndefined();
  });

  it('reads the firmware version as text', () => {
    const firmware = single('firmwareUpdate', viewOf({ firmwareUpdate: {} }));
    expect(firmware.read(statusOf({ firmwareUpdate: { currentVersion: '1.2.3' } }))).toBe('1.2.3');
    expect(firmware.read(statusOf({ firmwareUpdate: { currentVersion: 123 } }))).toBeUndefined();
  });
});
