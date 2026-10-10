import type { StandardCapability } from '@smarteverything/domain';
import {
  CLIMATE_CATEGORIES,
  COVER_CATEGORIES,
  ILLUMINANCE_CATEGORIES,
  LIGHT_CATEGORIES,
} from './categories';
import type { ColorVersion } from './color';

export type Codec =
  | { readonly kind: 'direct' }
  | { readonly kind: 'flag'; readonly on: readonly string[] }
  | { readonly kind: 'color'; readonly version: ColorVersion }
  | { readonly kind: 'trigger' };

interface RuleOptions {
  readonly statusCodes?: readonly string[];
  readonly categories?: readonly string[];
  readonly codec?: Codec;
}

export interface CapabilityRule extends RuleOptions {
  readonly capability: StandardCapability;
  readonly codes: readonly string[];
}

function rule(
  capability: StandardCapability,
  codes: readonly string[],
  options: RuleOptions = {},
): CapabilityRule {
  return { capability, codes, ...options };
}

function flag(on: readonly string[]): Codec {
  return { kind: 'flag', on };
}

export const CAPABILITY_RULES: readonly CapabilityRule[] = [
  rule('power', ['switch_led', 'switch', 'switch_1', 'switch_led_1', 'power']),
  rule('brightness', ['bright_value_v2', 'bright_value', 'bright_value_1'], {
    categories: LIGHT_CATEGORIES,
  }),
  rule('color_temperature', ['temp_value_v2', 'temp_value'], { categories: LIGHT_CATEGORIES }),
  rule('color', ['colour_data_v2'], { codec: { kind: 'color', version: 'v2' } }),
  rule('color', ['colour_data'], { codec: { kind: 'color', version: 'v1' } }),
  rule('target_temperature', ['temp_set']),
  rule('temperature', ['temp_current', 'va_temperature', 'temp_indoor']),
  rule('hvac_mode', ['mode'], { categories: CLIMATE_CATEGORIES }),
  rule('purifier_mode', ['mode'], { categories: ['kj'] }),
  rule('cleaning', ['mode'], { categories: ['sd'] }),
  rule('fan_mode', ['mode'], { categories: ['fs', 'fsd', 'fskg'] }),
  rule('fan_mode', ['fan_speed_enum', 'windspeed', 'speed', 'fan_speed']),
  rule('fan_speed', ['fan_speed_percent', 'fan_speed']),
  rule('oscillation', ['switch_horizontal', 'shake']),
  rule('target_humidity', ['humidity_set', 'dehumidify_set_value']),
  rule('humidity', [
    'humidity_current',
    'va_humidity',
    'humidity_value',
    'humidity_indoor',
    'humidity',
  ]),
  rule('mist_level', ['level'], { categories: ['jsq', 'xxj'] }),
  rule('water_level', ['water_level']),
  rule('pm25', ['pm25', 'pm25_value']),
  rule('pm10', ['pm10', 'pm10_value']),
  rule('co2', ['co2_value', 'eco2']),
  rule('tvoc', ['tvoc', 'voc_value']),
  rule('hcho', ['ch2o_value', 'hcho']),
  rule('air_quality_index', ['aqi']),
  rule('filter_life', ['filter', 'filter_life']),
  rule('filter_reset', ['filter_reset', 'reset_filter'], { codec: { kind: 'trigger' } }),
  rule('child_lock', ['child_lock']),
  rule('buzzer', ['beep', 'buzzer']),
  rule('battery', ['battery_percentage', 'battery_value', 'va_battery', 'residual_electricity']),
  rule('motion', ['pir'], { codec: flag(['pir']) }),
  rule('contact', ['doorcontact_state']),
  rule('occupancy', ['presence_state'], { codec: flag(['presence']) }),
  rule('illuminance', ['illuminance_value']),
  rule('illuminance', ['bright_value'], { categories: ILLUMINANCE_CATEGORIES }),
  rule('leak', ['watersensor_state'], { codec: flag(['alarm']) }),
  rule('smoke', ['smoke_sensor_status'], { codec: flag(['alarm']) }),
  rule('smoke', ['smoke_sensor_state'], { codec: flag(['1']) }),
  rule('gas', ['gas_sensor_status'], { codec: flag(['alarm']) }),
  rule('gas', ['gas_sensor_state'], { codec: flag(['1']) }),
  rule('vibration', ['shock_state'], { codec: flag(['vibration']) }),
  rule('pressure', ['pressure_value']),
  rule('button', ['switch1_value', 'switch_mode1']),
  rule('alarm', ['master_mode'], { categories: ['mal'] }),
  rule('siren', ['alarm_switch']),
  rule('cover_action', ['control', 'mach_operate'], { categories: COVER_CATEGORIES }),
  rule('cover_position', ['percent_control', 'position'], {
    statusCodes: ['percent_state'],
    categories: COVER_CATEGORIES,
  }),
  rule('power_draw', ['cur_power']),
  rule('voltage', ['cur_voltage']),
  rule('energy', ['forward_energy_total', 'total_forward_energy']),
  rule('suction', ['suction'], { categories: ['sd'] }),
  rule('mop_level', ['cistern'], { categories: ['sd'] }),
];
