import { describe, expect, it } from 'vitest';
import { CAPABILITY_RULES, buildDeviceModel, decodeReport, type DataPointShape } from '../src';
import { BOOL, JSON_SHAPE, int, options, point } from './fixtures';

type Case = readonly [category: string, code: string, shape: DataPointShape, capability: string];

const CASES: readonly Case[] = [
  ['dj', 'switch_led', BOOL, 'power'],
  ['kg', 'switch', BOOL, 'power'],
  ['kg', 'switch_1', BOOL, 'power'],
  ['dj', 'switch_led_1', BOOL, 'power'],
  ['kg', 'power', BOOL, 'power'],
  ['dj', 'bright_value_v2', int(10, 1000), 'brightness'],
  ['dj', 'bright_value', int(25, 255), 'brightness'],
  ['dj', 'bright_value_1', int(10, 1000), 'brightness'],
  ['dj', 'temp_value_v2', int(), 'color_temperature'],
  ['dj', 'temp_value', int(0, 255), 'color_temperature'],
  ['dj', 'colour_data_v2', JSON_SHAPE, 'color'],
  ['dj', 'colour_data', JSON_SHAPE, 'color'],
  ['wk', 'temp_set', int(50, 350, 1), 'target_temperature'],
  ['wk', 'temp_current', int(-200, 600, 1), 'temperature'],
  ['wsdcg', 'va_temperature', int(-200, 600, 1), 'temperature'],
  ['cs', 'temp_indoor', int(-20, 60), 'temperature'],
  ['kt', 'mode', options('cold', 'hot'), 'hvac_mode'],
  ['kj', 'mode', options('auto', 'sleep'), 'purifier_mode'],
  ['sd', 'mode', options('smart', 'zone'), 'cleaning'],
  ['fs', 'mode', options('normal', 'sleep'), 'fan_mode'],
  ['fsd', 'mode', options('normal', 'sleep'), 'fan_mode'],
  ['fskg', 'mode', options('normal', 'sleep'), 'fan_mode'],
  ['kj', 'fan_speed_enum', options('low', 'high'), 'fan_mode'],
  ['kt', 'windspeed', options('1', '2'), 'fan_mode'],
  ['kj', 'speed', options('1', '2'), 'fan_mode'],
  ['fs', 'fan_speed', options('1', '2'), 'fan_mode'],
  ['fs', 'fan_speed_percent', int(1, 100), 'fan_speed'],
  ['fs', 'fan_speed', int(1, 6), 'fan_speed'],
  ['fs', 'switch_horizontal', BOOL, 'oscillation'],
  ['fs', 'shake', BOOL, 'oscillation'],
  ['jsq', 'humidity_set', int(40, 80), 'target_humidity'],
  ['cs', 'dehumidify_set_value', int(35, 70), 'target_humidity'],
  ['jsq', 'humidity_current', int(0, 100), 'humidity'],
  ['wsdcg', 'va_humidity', int(0, 1000, 1), 'humidity'],
  ['wsdcg', 'humidity_value', int(0, 100), 'humidity'],
  ['cs', 'humidity_indoor', int(0, 100), 'humidity'],
  ['kj', 'humidity', int(0, 100), 'humidity'],
  ['jsq', 'level', options('level_1', 'level_2'), 'mist_level'],
  ['xxj', 'level', options('level_1', 'level_2'), 'mist_level'],
  ['jsq', 'water_level', int(0, 100), 'water_level'],
  ['kj', 'pm25', int(0, 999), 'pm25'],
  ['hjjcy', 'pm25_value', int(0, 999), 'pm25'],
  ['kj', 'pm10', int(0, 999), 'pm10'],
  ['hjjcy', 'pm10_value', int(0, 999), 'pm10'],
  ['hjjcy', 'co2_value', int(0, 5000), 'co2'],
  ['kj', 'eco2', int(0, 5000), 'co2'],
  ['kj', 'tvoc', int(0, 999), 'tvoc'],
  ['hjjcy', 'voc_value', int(0, 999), 'tvoc'],
  ['hjjcy', 'ch2o_value', int(0, 999), 'hcho'],
  ['kj', 'hcho', int(0, 999), 'hcho'],
  ['kj', 'aqi', int(0, 500), 'air_quality_index'],
  ['kj', 'filter', int(0, 100), 'filter_life'],
  ['kj', 'filter_life', int(0, 100), 'filter_life'],
  ['kj', 'filter_reset', BOOL, 'filter_reset'],
  ['kj', 'reset_filter', BOOL, 'filter_reset'],
  ['kj', 'child_lock', BOOL, 'child_lock'],
  ['jsq', 'beep', BOOL, 'buzzer'],
  ['kj', 'buzzer', BOOL, 'buzzer'],
  ['wsdcg', 'battery_percentage', int(0, 100), 'battery'],
  ['pir', 'battery_value', int(0, 100), 'battery'],
  ['mcs', 'va_battery', int(0, 100), 'battery'],
  ['ms', 'residual_electricity', int(0, 100), 'battery'],
  ['pir', 'pir', options('pir', 'none'), 'motion'],
  ['mcs', 'doorcontact_state', BOOL, 'contact'],
  ['hps', 'presence_state', options('presence', 'none'), 'occupancy'],
  ['ldcg', 'illuminance_value', int(0, 10000), 'illuminance'],
  ['ldcg', 'bright_value', int(0, 10000), 'illuminance'],
  ['hps', 'bright_value', int(0, 10000), 'illuminance'],
  ['pir', 'bright_value', int(0, 10000), 'illuminance'],
  ['sj', 'watersensor_state', options('alarm', 'normal'), 'leak'],
  ['ywbj', 'smoke_sensor_status', options('alarm', 'normal'), 'smoke'],
  ['ywbj', 'smoke_sensor_state', options('1', '2'), 'smoke'],
  ['rqbj', 'gas_sensor_status', options('alarm', 'normal'), 'gas'],
  ['rqbj', 'gas_sensor_state', options('1', '2'), 'gas'],
  ['zd', 'shock_state', options('vibration', 'normal'), 'vibration'],
  ['ylcg', 'pressure_value', int(0, 2000), 'pressure'],
  ['wxkg', 'switch1_value', options('single_click', 'double_click'), 'button'],
  ['wxkg', 'switch_mode1', options('click', 'press'), 'button'],
  ['mal', 'master_mode', options('disarmed', 'arm'), 'alarm'],
  ['sgbj', 'alarm_switch', BOOL, 'siren'],
  ['cl', 'control', options('open', 'stop', 'close'), 'cover_action'],
  ['ckmkzq', 'mach_operate', options('FZ', 'ZZ', 'STOP'), 'cover_action'],
  ['cl', 'percent_control', int(0, 100), 'cover_position'],
  ['clkg', 'position', int(0, 100), 'cover_position'],
  ['cz', 'cur_power', int(0, 50000, 1, 'W'), 'power_draw'],
  ['cz', 'cur_voltage', int(0, 5000, 1, 'V'), 'voltage'],
  ['zndb', 'forward_energy_total', int(0, 99999999, 2, 'kWh'), 'energy'],
  ['zndb', 'total_forward_energy', int(0, 99999999, 2, 'kWh'), 'energy'],
  ['sd', 'suction', options('gentle', 'strong'), 'suction'],
  ['sd', 'cistern', options('low', 'high'), 'mop_level'],
];

describe('capability rules', () => {
  it('maps every standard data point code onto its capability', () => {
    for (const [category, code, shape, capability] of CASES) {
      const model = buildDeviceModel(category, [point(code, 7, shape)], new Set());
      expect({ category, code, keys: model.capabilities.map((item) => item.key) }).toStrictEqual({
        category,
        code,
        keys: [capability],
      });
    }
  });

  it('decodes each sensor flag as true only on its alarm option', () => {
    for (const [category, code, on, off, capability] of [
      ['pir', 'pir', 'pir', 'none', 'motion'],
      ['hps', 'presence_state', 'presence', 'none', 'occupancy'],
      ['sj', 'watersensor_state', 'alarm', 'normal', 'leak'],
      ['ywbj', 'smoke_sensor_status', 'alarm', 'normal', 'smoke'],
      ['ywbj', 'smoke_sensor_state', '1', '2', 'smoke'],
      ['rqbj', 'gas_sensor_status', 'alarm', 'normal', 'gas'],
      ['rqbj', 'gas_sensor_state', '1', '2', 'gas'],
      ['zd', 'shock_state', 'vibration', 'normal', 'vibration'],
    ] as const) {
      const model = buildDeviceModel(category, [point(code, 1, options(on, off))], new Set());
      expect(
        decodeReport(model, [
          { code, value: on },
          { code, value: off },
        ]).values,
      ).toStrictEqual([
        { capability, value: true },
        { capability, value: false },
      ]);
    }
  });

  it('decodes each colour code in its own version', () => {
    const model = buildDeviceModel('dj', [point('colour_data', 5, JSON_SHAPE)], new Set());
    expect(
      decodeReport(model, [{ code: 'colour_data', value: 'ff00000000ff80' }]).values,
    ).toStrictEqual([{ capability: 'color', value: { hue: 0, saturation: 100, value: 50.2 } }]);
  });

  it('has a case for every code in every rule', () => {
    const covered = new Set(CASES.map(([, code, , capability]) => `${capability}:${code}`));
    const missing = CAPABILITY_RULES.flatMap((rule) =>
      rule.codes.map((code) => `${rule.capability}:${code}`),
    ).filter((entry) => !covered.has(entry));
    expect(missing).toStrictEqual([]);
  });

  it('keeps category-specific codes raw outside their categories', () => {
    for (const [category, code, shape] of [
      ['cz', 'mode', options('a', 'b')],
      ['kj', 'bright_value', int()],
      ['kj', 'temp_value', int()],
      ['cz', 'control', options('open', 'close')],
      ['cz', 'percent_control', int(0, 100)],
      ['kg', 'level', options('a')],
      ['kg', 'master_mode', options('a')],
      ['kg', 'suction', options('a')],
      ['kg', 'cistern', options('a')],
      ['kg', 'mach_operate', options('a')],
      ['dj', 'bright_value_2', int()],
    ] as const) {
      const model = buildDeviceModel(category, [point(code, 7, shape)], new Set());
      expect(model.capabilities.map((item) => item.key)).toStrictEqual([`raw:${code}`]);
    }
  });

  it('keeps a data point raw when its type does not fit the capability', () => {
    const model = buildDeviceModel(
      'kg',
      [point('switch_1', 1, int()), point('pir', 2, BOOL), point('colour_data', 3, int())],
      new Set(),
    );
    expect(model.capabilities.map((item) => item.key)).toStrictEqual([
      'raw:switch_1',
      'raw:pir',
      'raw:colour_data',
    ]);
  });

  it('prefers the first listed code and leaves the others raw', () => {
    const model = buildDeviceModel(
      'dj',
      [point('switch', 1, BOOL), point('switch_led', 20, BOOL)],
      new Set(),
    );
    expect(model.capabilities.map((item) => [item.key, item.label])).toStrictEqual([
      ['power', 'Power'],
      ['raw:switch', 'Switch'],
    ]);
    expect(model.bindings[0]?.write?.code).toBe('switch_led');
  });

  it('binds one data point to one capability only', () => {
    const model = buildDeviceModel('fs', [point('fan_speed', 3, options('1', '2'))], new Set());
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['fan_mode']);
  });

  it('accepts a colour stored as a string data point', () => {
    const model = buildDeviceModel(
      'dj',
      [point('colour_data_v2', 24, { type: 'String', maxLength: 255 })],
      new Set(),
    );
    expect(model.capabilities).toStrictEqual([
      { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
    ]);
  });

  it('needs a writable switch for a trigger', () => {
    const model = buildDeviceModel(
      'kj',
      [point('filter_reset', 9, BOOL, { writable: false })],
      new Set(),
    );
    expect(model.capabilities.map((item) => item.key)).toStrictEqual(['raw:filter_reset']);
  });
});
