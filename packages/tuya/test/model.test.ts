import { CommandRefusedError, InvalidValueError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  ColorValueError,
  DataPointValueError,
  IR_CAPABILITIES,
  buildDeviceModel,
  decodeReport,
  encodeCommand,
} from '../src';
import { BOOL, JSON_SHAPE, int, options, point } from './fixtures';

const light = buildDeviceModel(
  'dj',
  [
    point('switch_led', 20, BOOL),
    point('bright_value_v2', 22, int(10, 1000)),
    point('colour_data_v2', 24, JSON_SHAPE),
    point('countdown_1', 26, int(0, 86400)),
  ],
  new Set(),
);

describe('device models', () => {
  it('derives access from where the data point is listed', () => {
    const model = buildDeviceModel(
      'wk',
      [
        point('temp_current', 3, int(-200, 600, 1, '℃'), { writable: false }),
        point('temp_set', 2, int(50, 350, 1, '℃'), { readable: false }),
        point('child_lock', 40, BOOL),
      ],
      new Set(),
    );
    expect(model.capabilities).toStrictEqual([
      {
        key: 'target_temperature',
        label: 'Target temperature',
        access: 'write',
        value: { kind: 'number', min: 5, max: 35, step: 0.1, unit: '℃' },
      },
      {
        key: 'temperature',
        label: 'Temperature',
        access: 'read',
        value: { kind: 'number', min: -20, max: 60, step: 0.1, unit: '℃' },
      },
      { key: 'child_lock', label: 'Child lock', access: 'read_write', value: { kind: 'boolean' } },
    ]);
    expect(model.kind).toBe('thermostat');
    expect(model.ir).toBeNull();
  });

  it('reads a cover position from its state code and writes it through its control code', () => {
    const model = buildDeviceModel(
      'cl',
      [
        point('percent_state', 3, int(0, 100), { writable: false }),
        point('percent_control', 2, int(0, 100)),
      ],
      new Set(),
    );
    expect(model.capabilities.map((item) => [item.key, item.access])).toStrictEqual([
      ['cover_position', 'read_write'],
    ]);
    expect(model.bindings[0]?.read?.code).toBe('percent_state');
    expect(model.bindings[0]?.write?.code).toBe('percent_control');
  });

  it('reads a cover position from its control code when it has no state code', () => {
    const model = buildDeviceModel('cl', [point('percent_control', 2, int(0, 100))], new Set());
    expect(model.bindings[0]?.read?.code).toBe('percent_control');
  });

  it('makes sensor flags read-only and triggers write-only', () => {
    const model = buildDeviceModel(
      'kj',
      [point('filter_reset', 11, BOOL), point('pir', 1, options('pir', 'none'))],
      new Set(),
    );
    expect(model.capabilities).toStrictEqual([
      { key: 'filter_reset', label: 'Reset filter', access: 'write', value: { kind: 'action' } },
      { key: 'motion', label: 'Motion', access: 'read', value: { kind: 'boolean' } },
    ]);
  });

  it('binds a capability once even when two rules could claim it', () => {
    const model = buildDeviceModel(
      'dj',
      [point('colour_data_v2', 24, JSON_SHAPE), point('colour_data', 5, JSON_SHAPE)],
      new Set(),
    );
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['color', 'raw:colour_data']);
  });

  it('never binds one data point to two capabilities', () => {
    const model = buildDeviceModel('gyd', [point('bright_value', 3, int(0, 1000))], new Set());
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['brightness']);
  });

  it('needs a switch for a trigger', () => {
    const model = buildDeviceModel('kj', [point('filter_reset', 9, options('reset'))], new Set());
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['raw:filter_reset']);
  });

  it('never reads a trigger', () => {
    const model = buildDeviceModel('kj', [point('filter_reset', 9, BOOL)], new Set());
    expect(decodeReport(model, [{ code: 'filter_reset', value: true }])).toStrictEqual({
      values: [],
      problems: [],
    });
  });

  it('names raw capabilities from the cloud name or the code, with valid unique keys', () => {
    const model = buildDeviceModel(
      'kg',
      [
        point('relay_status', 38, options('on', 'off'), { name: 'Power-on state' }),
        point('Light_Mode', 15, options('relay', 'pos')),
        point('light mode', 16, options('a')),
        point('light_mode', 17, options('a')),
        point('_x', 18, BOOL),
        point('__', 19, BOOL),
      ],
      new Set(),
    );
    expect(model.capabilities.map((item) => [item.key, item.label])).toStrictEqual([
      ['raw:relay_status', 'Power-on state'],
      ['raw:light_mode', 'Light Mode'],
      ['raw:dp_16', 'Light mode'],
      ['raw:dp_17', 'Light mode'],
      ['raw:dp_18', 'X'],
      ['raw:dp_19', '__'],
    ]);
  });

  it('gives an IR blaster its infrared capabilities and hides its IR data points', () => {
    const model = buildDeviceModel(
      'wnykq',
      [
        point('ir_send', 201, { type: 'String', maxLength: 255 }),
        point('ir_study_code', 202, { type: 'String', maxLength: 255 }),
        point('battery_percentage', 9, int(0, 100)),
      ],
      new Set(),
    );
    expect(model.kind).toBe('ir_blaster');
    expect(model.ir?.kind).toBe('dp201');
    expect(model.capabilities).toStrictEqual([
      {
        key: 'battery',
        label: 'Battery',
        access: 'read_write',
        value: { kind: 'number', min: 0, max: 100, step: 1 },
      },
      ...IR_CAPABILITIES,
    ]);
    expect(IR_CAPABILITIES).toStrictEqual([
      { key: 'ir_learn', label: 'Learn IR code', access: 'write', value: { kind: 'action' } },
      {
        key: 'ir_send',
        label: 'Send IR code',
        access: 'write',
        value: { kind: 'action', arguments: ['format', 'code'] },
      },
    ]);
  });

  it('detects the IR scheme from data points seen on the LAN when the cloud publishes none', () => {
    const model = buildDeviceModel('wnykq', [], new Set([1, 2]));
    expect(model.ir?.kind).toBe('dp1');
    expect(model.capabilities).toStrictEqual(IR_CAPABILITIES);
    expect(buildDeviceModel('wnykq', [], new Set()).ir).toBeNull();
    expect(buildDeviceModel('kg', [], new Set([201])).ir).toBeNull();
  });
});

describe('decoding reports', () => {
  it('decodes every bound value and ignores codes without a readable binding', () => {
    expect(
      decodeReport(light, [
        { code: 'switch_led', value: true },
        { code: 'bright_value_v2', value: 500 },
        { code: 'colour_data_v2', value: '00f003e801f4' },
        { code: 'unknown', value: 1 },
      ]),
    ).toStrictEqual({
      values: [
        { capability: 'power', value: true },
        { capability: 'brightness', value: 500 },
        { capability: 'color', value: { hue: 240, saturation: 100, value: 50 } },
      ],
      problems: [],
    });
  });

  it('decodes flags against their on options', () => {
    const model = buildDeviceModel('pir', [point('pir', 1, options('pir', 'none'))], new Set());
    expect(decodeReport(model, [{ code: 'pir', value: 'pir' }]).values).toStrictEqual([
      { capability: 'motion', value: true },
    ]);
    expect(decodeReport(model, [{ code: 'pir', value: 'none' }]).values).toStrictEqual([
      { capability: 'motion', value: false },
    ]);
  });

  it('collects each bad value as a problem without losing the good ones', () => {
    const model = buildDeviceModel(
      'dj',
      [
        point('pir', 1, options('pir', 'none')),
        point('colour_data_v2', 24, JSON_SHAPE),
        point('switch_led', 20, BOOL),
      ],
      new Set(),
    );
    const report = decodeReport(model, [
      { code: 'pir', value: 3 },
      { code: 'colour_data_v2', value: 'zz' },
      { code: 'switch_led', value: false },
    ]);
    expect(report.values).toStrictEqual([{ capability: 'power', value: false }]);
    expect(report.problems.map((problem) => problem.code)).toStrictEqual(['pir', 'colour_data_v2']);
    expect(report.problems[0]?.error).toStrictEqual(
      new DataPointValueError('pir', 'one of its options', 3),
    );
    expect(report.problems[1]?.error).toBeInstanceOf(ColorValueError);
  });
});

describe('encoding commands', () => {
  it('writes scaled values to the bound data point', () => {
    expect(encodeCommand(light, 'brightness', 500, 'local')).toStrictEqual([
      { code: 'bright_value_v2', dpId: 22, value: 500 },
    ]);
    expect(encodeCommand(light, 'raw:countdown_1', 60, 'cloud')).toStrictEqual([
      { code: 'countdown_1', dpId: 26, value: 60 },
    ]);
  });

  it('writes colours in the form the transport expects', () => {
    const blue = { hue: 240, saturation: 100, value: 50 };
    expect(encodeCommand(light, 'color', blue, 'local')).toStrictEqual([
      { code: 'colour_data_v2', dpId: 24, value: '00f003e801f4' },
    ]);
    expect(encodeCommand(light, 'color', blue, 'cloud')).toStrictEqual([
      { code: 'colour_data_v2', dpId: 24, value: { h: 240, s: 1000, v: 500 } },
    ]);
    expect(() => encodeCommand(light, 'color', { hue: 400 }, 'local')).toThrow(InvalidValueError);
  });

  it('writes true for a trigger and accepts no arguments', () => {
    const model = buildDeviceModel('kj', [point('filter_reset', 11, BOOL)], new Set());
    expect(encodeCommand(model, 'filter_reset', null, 'local')).toStrictEqual([
      { code: 'filter_reset', dpId: 11, value: true },
    ]);
    expect(() => encodeCommand(model, 'filter_reset', { now: true }, 'local')).toThrow(
      InvalidValueError,
    );
  });

  it('refuses capabilities it cannot write, saying why', () => {
    const model = buildDeviceModel(
      'wnykq',
      [
        point('pir', 1, options('pir', 'none')),
        point('temp_current', 3, int(), { writable: false }),
      ],
      new Set(),
    );
    expect(() => encodeCommand(model, 'motion', true, 'local')).toThrow(
      new CommandRefusedError('motion', 'it can only be read'),
    );
    expect(() => encodeCommand(model, 'temperature', 1, 'local')).toThrow(
      new CommandRefusedError('temperature', 'it can only be read'),
    );
    expect(() => encodeCommand(model, 'power', true, 'local')).toThrow(
      new CommandRefusedError('power', 'the device does not have it'),
    );
    expect(() => encodeCommand(model, 'ir_send', {}, 'local')).toThrow(
      new CommandRefusedError(
        'ir_send',
        'it is carried out by the infrared controller, not written as a data point',
      ),
    );
    expect(() => encodeCommand(model, 'ir_learn', null, 'local')).toThrow(
      'it is carried out by the infrared controller',
    );
  });

  it('refuses a value outside the exact range', () => {
    expect(() => encodeCommand(light, 'brightness', 5, 'local')).toThrow(InvalidValueError);
  });
});
