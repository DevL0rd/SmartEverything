import { describe, expect, it } from 'vitest';
import {
  ConversionError,
  convertDataPoints,
  convertValue,
  isKnownConversion,
  type DataPointConversion,
} from '../src';
import {
  colorsysHsvToRgb,
  colorsysRgbToHsv,
  decimal,
  lenientHex,
  pythonRound,
  strictHex,
} from '../src/conversions/primitives';

function base64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

function conversion(name: string, extra: Partial<DataPointConversion> = {}): DataPointConversion {
  return {
    name,
    dpId: 1,
    code: 'value',
    valueType: 'Raw',
    valueDesc: '{}',
    enumMappings: null,
    ...extra,
  };
}

function convert(name: string, raw: unknown, extra: Partial<DataPointConversion> = {}): unknown {
  return convertValue(conversion(name, extra), raw);
}

function parsed(name: string, raw: unknown): unknown {
  return JSON.parse(String(convert(name, raw)));
}

function failure(name: string, raw: unknown, extra: Partial<DataPointConversion> = {}): string {
  try {
    convert(name, raw, extra);
  } catch (error) {
    if (error instanceof ConversionError) {
      return error.reason;
    }
    throw error;
  }
  throw new Error('the conversion did not fail');
}

const FRAME = '08fc' + '000064' + '0003e8' + '0001f4' + '0007d0' + '5a';

describe('metering conversions', () => {
  it('reads alarms with and without thresholds and skips unknown codes', () => {
    expect(
      parsed('db_v1_alarm', base64('01010064' + '06010000' + '0a000fa0' + '0a000fa1' + '63000000')),
    ).toStrictEqual([
      { alarmCode: 'overcurrent', doAction: true, threshold: '100' },
      { alarmCode: 'power_failure', doAction: true },
      { alarmCode: 'battery_overvoltage', doAction: false, threshold: '40.0' },
      { alarmCode: 'battery_overvoltage', doAction: false, threshold: '40.01' },
    ]);
  });

  it('reads the daily, month, data and frozen records', () => {
    expect(parsed('db_v1_daily', base64('0102030400000064'))).toStrictEqual({
      startMonth: 1,
      startDay: 2,
      endMonth: 3,
      endDay: 4,
      electricTotal: 1,
    });
    expect(parsed('db_v1_month', base64('1a0a1a0b00000064'))).toStrictEqual({
      startYear: 26,
      startMonth: 10,
      endYear: 26,
      endMonth: 11,
      electricTotal: 1,
    });
    expect(parsed('db_v1_data', base64('00000064' + '1a0a0b0c0d0e'))).toStrictEqual({
      power: 1,
      year: 26,
      month: 10,
      date: 11,
      hour: 12,
      minute: 13,
      second: 14,
    });
    expect(parsed('db_v1_frozen', base64('0a0b'))).toStrictEqual({ day: 10, hour: 11 });
  });

  it('reads the full, signed and short parameter frames', () => {
    expect(parsed('db_v1_params', base64(`010f${FRAME}`))).toStrictEqual({
      voltage: 230,
      electricCurrent: 0.1,
      power: 1,
      reactivePower: 0.5,
      apparentPower: 2,
      powerFactor: 0.9,
    });
    expect(parsed('db_v1_params', base64(`020f${FRAME}0f`))).toStrictEqual({
      voltage: 230,
      electricCurrent: -0.1,
      power: -1,
      reactivePower: -0.5,
      apparentPower: 2,
      powerFactor: -0.9,
    });
    expect(parsed('db_v1_params', base64(`020f${FRAME}05`))).toMatchObject({
      electricCurrent: -0.1,
      power: 1,
      reactivePower: -0.5,
      powerFactor: 0.9,
    });
    expect(parsed('db_v1_params', base64('08fc000064' + '0003e8'))).toStrictEqual({
      voltage: 230,
      electricCurrent: 0.1,
      power: 1,
    });
  });

  it('reads a tariff week and reports an idle day as no periods', () => {
    const worked = '061218240000';
    const idle = '000000000000';
    expect(parsed('db_v1_tariff', base64(worked + idle.repeat(6)))).toStrictEqual({
      monday: [
        { start_time: '6', end_time: '18' },
        { start_time: '24', end_time: '36' },
        { start_time: '0', end_time: '0' },
      ],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
  });

  it('reports a week of idle days as seven empty days', () => {
    expect(parsed('db_v1_tariff', base64('000000000000'.repeat(7)))).toStrictEqual({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
  });

  it('reports a tariff that does not hold seven days as empty text', () => {
    expect(convert('db_v1_tariff', base64('000000000000'.repeat(6)))).toBe('');
  });

  it('names the conversion and the hex digit that cannot be read', () => {
    expect(failure('db_v1_daily', 5)).toBe('expected text, received 5');
    expect(failure('db_v1_daily', '***')).toContain('not base64');
  });
});

describe('lighting conversions', () => {
  it('reads hue, saturation and brightness from the v1 text and from its RGB form', () => {
    expect(parsed('dj_v1_hsv_alg', '00000000b480ff')).toStrictEqual({ h: 180, s: 128, v: 255 });
    expect(parsed('dj_v1_hsv_alg', 'ff00000168ffff')).toStrictEqual({ h: 0, s: 255, v: 255 });
    expect(parsed('voice_atm_color', '00000000b480ff')).toStrictEqual({ h: 180, s: 128, v: 255 });
    expect(parsed('voice_atm_color', '00ff800168ffff')).toStrictEqual({ h: 150.1, s: 255, v: 255 });
    expect(failure('dj_v1_hsv_alg', 'zz00000168ffff')).toContain('not hexadecimal');
  });

  it('reads a v1 scene as its settings and colour list', () => {
    expect(convert('dj_v1_scene_alg', '')).toBe('');
    expect(parsed('dj_v1_scene_alg', '3c643200' + 'ff0000' + '00ff00')).toStrictEqual({
      frequency: 50,
      bright: 60,
      temperature: 100,
      hsv: [
        { h: 0, s: 255, v: 255 },
        { h: 120, s: 255, v: 255 },
      ],
    });
  });

  it('reads the v2 colour', () => {
    expect(parsed('dj_v2_color_alg', '00b403e803e8')).toStrictEqual({ h: 180, s: 1000, v: 1000 });
  });

  it('reads the v2 control and music frames with their change mode', () => {
    const frame = '0b403e803e803e803e8';
    expect(convert('dj_v2_contr_alg', '')).toBe('');
    expect(parsed('dj_v2_contr_alg', `0${frame}`)).toMatchObject({
      change_mode: 'direct',
      h: 2880,
    });
    expect(parsed('dj_v2_contr_alg', `1${frame}`)).toMatchObject({ change_mode: 'gradient' });
    expect(parsed('dj_v2_contr_alg', `2${frame}`)).toMatchObject({ change_mode: '' });
    expect(parsed('dj_v2_music_alg', `2${frame}`)).toMatchObject({ change_mode: null });
    expect(convert('dj_v2_music_alg', '')).toBe('');
  });

  it('reads the v2 scene units and names an unknown change mode as empty', () => {
    const unit = (mode: string): string => `0a0a${mode}00b403e803e803e803e8`;
    expect(parsed('dj_v2_scene_alg', `01${unit('01')}${unit('05')}`)).toStrictEqual({
      scene_num: 2,
      scene_units: [
        {
          unit_switch_duration: 10,
          unit_gradient_duration: 10,
          unit_change_mode: 'jump',
          h: 180,
          s: 1000,
          v: 1000,
          bright: 1000,
          temperature: 1000,
        },
        {
          unit_switch_duration: 10,
          unit_gradient_duration: 10,
          unit_change_mode: '',
          h: 180,
          s: 1000,
          v: 1000,
          bright: 1000,
          temperature: 1000,
        },
      ],
    });
  });

  it('turns a Hubbell colour into truncated red, green and blue', () => {
    expect(convert('hb_djv1_color', '{"h": 120, "s": 255, "v": 255}')).toBe('0|255|0');
    expect(convert('hb_djv1_color', '{"h": "120", "s": " 255 ", "v": 128.5}')).toBe('0|128|0');
  });

  it('names what is wrong with a Hubbell colour', () => {
    expect(failure('hb_djv1_color', '{"h": "x", "s": 1, "v": 1}')).toBe('"x" is not a number');
    expect(failure('hb_djv1_color', '{"h": "", "s": 1, "v": 1}')).toBe('"" is not a number');
    expect(failure('hb_djv1_color', 'nope')).toContain('the value is not JSON');
    expect(failure('hb_djv1_color', 5)).toBe('expected text, received 5');
    expect(failure('hb_djv1_color', '{"h": 1}')).toBe('the value has no h, s and v');
  });

  it('suffixes the light text and scales range values', () => {
    expect(convert('hb_jsq_lightv1', null)).toBe('');
    expect(convert('hb_jsq_lightv1', 'abc')).toBe('abc|0|0');
    expect(convert('hb_range_v1', null)).toBe('');
    expect(convert('hb_range_v1', 255)).toBe(100);
    expect(convert('hb_range_v1', 140)).toBe(50);
    expect(convert('hb_range_v1', 0)).toBe(0);
    expect(convert('hb_range_v1', true)).toBe(0);
    expect(convert('hb_range_v1', false)).toBe(0);
    expect(convert('hb_range_v1', '140')).toBe(50);
    expect(convert('hb_range_v2', 255)).toBe(12000);
    expect(failure('hb_range_v1', 'x')).toBe('"x" is not a whole number');
  });
});

describe('general conversions', () => {
  it('reads short and long timer records', () => {
    expect(parsed('cz_timer1_alg', base64('01' + '7f' + '0168' + '01e0'))).toStrictEqual([
      {
        timer_switch: true,
        week_day: [0, 1, 2, 3, 4, 5, 6],
        start_time: '06:00',
        end_time: '08:00',
      },
    ]);
    expect(
      parsed('cz_timer2_alg', base64('00' + '01' + '0168' + '01e0' + '0000' + '003c')),
    ).toStrictEqual([
      {
        timer_switch: false,
        week_day: [0],
        start_time: '06:00',
        end_time: '08:00',
        open_time: '00:00',
        close_time: '01:00',
      },
    ]);
    expect(parsed('cz_timer1_alg', base64('00' + '05' + '0000' + '0000'))).toStrictEqual([
      { timer_switch: false, week_day: [0, 2], start_time: '00:00', end_time: '00:00' },
    ]);
    expect(failure('cz_timer1_alg', base64('0100'))).toContain('ends before byte 2');
  });

  it('lists the unlock methods a lock reports', () => {
    expect(convert('ms_dp_syn_alg', '')).toStrictEqual([]);
    expect(convert('ms_dp_syn_alg', base64('0105' + '0203'))).toStrictEqual([0, 2, 8, 9]);
    expect(failure('ms_dp_syn_alg', '***')).toContain('not base64');
    expect(failure('ms_dp_syn_alg', base64('01'))).toContain('byte 1');
  });

  it('reads cleaning records of every length', () => {
    expect(parsed('sd_clean_record', '012034')).toStrictEqual({
      record_time: '',
      clean_time: 12,
      clean_area: 34,
      map_id: '',
    });
    expect(parsed('sd_clean_record', '01203456789')).toMatchObject({ map_id: '56789' });
    expect(parsed('sd_clean_record', '202610170830012034')).toMatchObject({
      record_time: '202610170830',
      clean_time: 12,
      clean_area: 34,
    });
    expect(parsed('sd_clean_record', '20261017083001203456789')).toMatchObject({
      map_id: '56789',
    });
    expect(failure('sd_clean_record', 'abcdef')).toContain('not a whole number');
  });

  it('falls back to the empty value of the declared type when a value is empty', () => {
    expect(convert('default', 'on')).toBe('on');
    expect(convert('default', '', { valueType: 'Boolean' })).toBe(false);
    expect(convert('default', null, { valueType: 'integer', valueDesc: '{"min":5}' })).toBe(5);
    expect(convert('default', null, { valueType: 'Integer' })).toBeNull();
    expect(convert('default', null, { valueType: 'Enum', valueDesc: '{"range":["a","b"]}' })).toBe(
      'a',
    );
    expect(convert('default', null, { valueType: 'String' })).toBe('');
    expect(failure('default', null, { valueType: 'Enum', valueDesc: '{"range":[]}' })).toBe(
      'valueDesc has no enum range',
    );
    expect(failure('default', null, { valueType: 'Enum' })).toBe('valueDesc has no enum range');
    expect(failure('default', null, { valueType: 'Integer', valueDesc: '[' })).toContain(
      'valueDesc is not JSON',
    );
    expect(failure('default', null, { valueType: 'Integer', valueDesc: '5' })).toBe(
      'valueDesc is not an object',
    );
  });

  it('maps an enum through its published mapping', () => {
    const enumMappings = { True: { value: 'on' }, none: { value: 'off' }, bare: {} };
    const enumeration = (raw: unknown): unknown =>
      convert('enum', raw, { valueType: 'Enum', valueDesc: '{"range":["z"]}', enumMappings });
    expect(enumeration(true)).toBe('on');
    expect(enumeration(null)).toBe('off');
    expect(enumeration('NONE')).toBe('off');
    expect(enumeration('bare')).toBe('z');
    expect(enumeration('unmapped')).toBe('z');
    expect(enumeration(false)).toBe('z');
    expect(enumeration(3)).toBe('z');
    expect(failure('enum', 'x')).toBe('Tuya published no enum mapping for the data point');
  });
});

describe('converting several data points', () => {
  const conversions = new Map([
    [1, conversion('db_v1_frozen', { code: 'frozen' })],
    [2, conversion('hb_range_v1', { code: 'range' })],
    [3, conversion('nonsense', { code: 'bad' })],
  ]);

  it('reports values, unknown data points and conversion problems separately', () => {
    const result = convertDataPoints(conversions, {
      '1': base64('0a0b'),
      '2': 255,
      '3': 'x',
      '9': 'y',
    });
    expect(result.report).toStrictEqual([
      { code: 'frozen', value: '{"day":10,"hour":11}' },
      { code: 'range', value: 100 },
    ]);
    expect(result.unknownDpIds).toStrictEqual([9]);
    expect(result.problems.map(({ dpId, error }) => [dpId, error.reason])).toStrictEqual([
      [3, 'the conversion is unknown'],
    ]);
  });

  it('keeps null as null for converters that preserve it and knows which names exist', () => {
    expect(convert('db_v1_frozen', null)).toBeNull();
    expect(isKnownConversion('db_v1_frozen')).toBe(true);
    expect(isKnownConversion('enum')).toBe(true);
    expect(isKnownConversion('nonsense')).toBe(false);
  });
});

describe('conversion primitives', () => {
  it('reads hexadecimal and decimal text strictly', () => {
    expect(strictHex('x', 'ff')).toBe(255);
    expect(lenientHex('x', '000ff')).toBe(255);
    expect(lenientHex('x', '000')).toBe(0);
    expect(decimal('x', ' 12 ')).toBe(12);
    expect(() => strictHex('x', 'zz')).toThrow(ConversionError);
    expect(() => decimal('x', '1.5')).toThrow(ConversionError);
  });

  it('rounds half to even like Python and otherwise to the digits asked for', () => {
    expect(pythonRound(0.5, 0)).toBe(0);
    expect(pythonRound(1.5, 0)).toBe(2);
    expect(pythonRound(2.5, 0)).toBe(2);
    expect(pythonRound(1.234, 2)).toBe(1.23);
  });

  it('converts between RGB and HSV with the float semantics of Python colorsys', () => {
    expect(colorsysRgbToHsv(0.5, 0.5, 0.5)).toStrictEqual([0, 0, 0.5]);
    expect(colorsysRgbToHsv(1, 0, 0)).toStrictEqual([0, 1, 1]);
    expect(colorsysRgbToHsv(0, 1, 0)[0]).toBeCloseTo(1 / 3);
    expect(colorsysRgbToHsv(0, 0, 1)[0]).toBeCloseTo(2 / 3);
    expect(colorsysRgbToHsv(1, 0, 0.5)[0]).toBeCloseTo(11 / 12);
    expect(colorsysHsvToRgb(0.3, 0, 0.7)).toStrictEqual([0.7, 0.7, 0.7]);
    const expected = [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
      [1, 0, 1],
    ];
    expected.forEach((channels, sector) => {
      colorsysHsvToRgb(sector / 6 + 0.01, 1, 1).forEach((value, index) => {
        expect(Math.round(value)).toBe(channels[index]);
      });
    });
  });
});
